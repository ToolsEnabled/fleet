"""Release guards execute against artifact bytes and an intercepted publisher."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', os.environ.get('FLEET_RELEASE_MODULE', str(ROOT / 'scripts/fleet_v4_release.py')))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PublishTest(unittest.TestCase):
    def setUp(self):
        base = ROOT / 'dist/release-kit/publish-tests'
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package, self.source = self.root / 'package.zip', self.root / 'source.zip'
        self.source.write_bytes(b'synthetic-source-fixture')
        body = b'fixture'
        self.manifest = dict(name='fleetV4', distribution='standalone-mcp', commit='a'*40,
                             version='4.0.0', files=[dict(path='runtime/file.txt', size=len(body), sha256=hashlib.sha256(body).hexdigest())])
        self.members = {'fleet/release.json': json.dumps(self.manifest).encode(), 'fleet/runtime/file.txt': body}
        self.pin = dict(releaseVerified=True, repository='fixture/project', tag='existing-release',
                        sourceCommit='a'*40, version='4.0.0', sourceSha256=hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.write_package()
        self.calls = []

    def write_package(self, duplicate=False):
        with zipfile.ZipFile(self.package, 'w') as archive:
            for name, body in self.members.items():
                archive.writestr(name, body)
            if duplicate:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    archive.writestr('fleet/runtime/file.txt', b'duplicate')
        self.pin['packageSha256'] = hashlib.sha256(self.package.read_bytes()).hexdigest()

    def invoke(self, kind='package', env=None):
        return release.publish(kind, self.package, self.source, self.pin,
                               {'FLEET_V4_GO': 'yes'} if env is None else env,
                               run=lambda argv, **kwargs: self.calls.append((argv, kwargs)))

    def rejected(self, reason, **kwargs):
        with self.assertRaisesRegex(ValueError, reason):
            self.invoke(**kwargs)
        self.assertEqual(self.calls, [], 'a rejected release must not call the publisher')

    def test_go_required(self):
        for env in [{}, {'FLEET_V4_GO': 'true'}, {'FLEET_V4_GO': 'YES'}]:
            self.rejected('FLEET_V4_GO=yes', env=env)

    def test_full_verification_required(self):
        self.pin['releaseVerified'] = False
        self.rejected('full release verification')

    def test_package_pin_required(self):
        self.package.write_bytes(self.package.read_bytes() + b'tampered')
        self.rejected('packageSha256 mismatch')

    def test_source_pin_required(self):
        self.source.write_bytes(b'tampered source')
        self.rejected('sourceSha256 mismatch', kind='source')

    def test_duplicate_archive_refuses(self):
        self.write_package(duplicate=True)
        self.rejected('duplicate package members')

    def test_missing_manifest_refuses(self):
        del self.members['fleet/release.json']
        self.write_package()
        self.rejected('exactly one package manifest')

    def test_identity_refuses(self):
        self.pin['sourceCommit'] = 'b'*40
        self.rejected('identity differs')

    def test_unsafe_member_refuses(self):
        self.manifest['files'][0]['path'] = '../outside'
        self.members['fleet/release.json'] = json.dumps(self.manifest).encode()
        self.members['fleet/../outside'] = b'fixture'
        self.write_package()
        self.rejected('unsafe package member')

    def test_duplicate_manifest_member_refuses(self):
        self.manifest['files'].append(self.manifest['files'][0])
        self.members['fleet/release.json'] = json.dumps(self.manifest).encode()
        self.write_package()
        self.rejected('duplicate manifest member')

    def test_corrupt_member_refuses(self):
        self.members['fleet/runtime/file.txt'] = b'wrong-bytes'
        self.write_package()
        self.rejected('manifest verification failed')

    def test_unexpected_member_refuses(self):
        self.members['fleet/extra.txt'] = b'extra'
        self.write_package()
        self.rejected('unexpected package members')

    def test_matching_artifacts_upload_only_the_selected_existing_release_asset(self):
        for kind, selected in [('package', self.package), ('source', self.source)]:
            self.calls.clear()
            self.invoke(kind)
            self.assertEqual(len(self.calls), 1)
            argv, kwargs = self.calls[0]
            self.assertEqual(argv, ['gh', 'release', 'upload', self.pin['tag'], str(selected.resolve()), '--repo', self.pin['repository']])
            self.assertTrue(kwargs['check'])


if __name__ == '__main__':
    unittest.main()
