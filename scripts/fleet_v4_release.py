"""Shared fail-closed release entry. Never creates a tag, release or source push."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

DEFAULT_PIN = Path(__file__).resolve().parents[1] / 'release/fleet-v4-pin.json'


def refuse(reason):
    raise ValueError('FLEET_V4_PUBLISH_REFUSED: ' + reason)


def verified_package(package, pin):
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names):
            refuse('duplicate package members')
        manifests = [name for name in names if name.count('/') == 1 and name.endswith('/release.json')]
        if len(manifests) != 1:
            refuse('expected exactly one package manifest')
        manifest_name = manifests[0]
        prefix = manifest_name.rsplit('/', 1)[0] + '/'
        manifest = json.loads(archive.read(manifest_name))
        if (manifest.get('name'), manifest.get('distribution'), manifest.get('commit'), manifest.get('version')) != (
                'fleetV4', 'standalone-mcp', pin['sourceCommit'], pin['version']):
            refuse('package identity differs from pin')
        expected = {manifest_name}
        for item in manifest['files']:
            relative = item['path']
            if relative.startswith('/') or '\\' in relative or any(p in ('', '.', '..') for p in relative.split('/')):
                refuse('unsafe package member')
            name = prefix + relative
            if name in expected:
                refuse('duplicate manifest member')
            expected.add(name)
            body = archive.read(name)
            if len(body) != item['size'] or hashlib.sha256(body).hexdigest() != item['sha256']:
                refuse('package manifest verification failed')
        if set(names) != expected:
            refuse('unexpected package members')
    return manifest


def publish(kind, package, source, pin, env, run=subprocess.run):
    if env.get('FLEET_V4_GO') != 'yes':
        refuse('set FLEET_V4_GO=yes only after release authorization')
    if pin.get('releaseVerified') is not True:
        refuse('pinned candidate has not received full release verification')
    for key, artifact in [('packageSha256', package), ('sourceSha256', source)]:
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        if digest != pin.get(key):
            refuse(key + ' mismatch; rebuild and verify before repinning')
    verified_package(package, pin)
    # Upload only to a release which the owning lead has already created.
    # No git push, tag creation, release creation, deployment or website writes.
    artifact = package if kind == 'package' else source
    return run(['gh', 'release', 'upload', pin['tag'], str(artifact.resolve()),
                '--repo', pin['repository']], check=True, env=env)


def main(kind):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--pin', type=Path, default=DEFAULT_PIN)
    args = parser.parse_args()
    try:
        pin = json.loads(args.pin.read_text())
        publish(kind, args.package, args.source, pin, os.environ.copy())
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print(str(error) if str(error).startswith('FLEET_V4_PUBLISH_REFUSED:') else
              'FLEET_V4_PUBLISH_REFUSED: invalid artifact/pin or publisher failure', file=__import__('sys').stderr)
        return 1
    return 0
