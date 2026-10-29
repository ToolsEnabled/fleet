'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
test('committed V4 export carries the standalone builder, runtime, setup and release identity', t => {
  const root = path.resolve(__dirname, '..');
  const base = path.join(root, 'dist/release-kit/export-tests');
  fs.mkdirSync(base, { recursive: true });
  const folder = fs.mkdtempSync(path.join(base, 'run-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const output = path.join(folder, 'source');
  const result = spawnSync('python3', ['public-source/build.py', '--generation', '4', '--commit', commit, '--output', output], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).sourceCommit, commit);
  for (const name of ['installer/fleetV2/build.py', 'installer/fleetV2/SOURCE-ALLOWLIST', 'installer/fleetV2/verify.cjs', 'bin/fleetV4.js', 'docs/FLEET-V4-SETUP.md', 'RELEASE-NOTES-4.0.2.md']) assert.ok(fs.statSync(path.join(output, name)).isFile(), name);
  const runtimeNames = fs.readFileSync(path.join(output, 'installer/fleetV2/SOURCE-ALLOWLIST'), 'utf8').trim().split('\n');
  for (const name of runtimeNames) {
    const committed = spawnSync('git', ['show', commit + ':' + name], { cwd: root });
    assert.equal(committed.status, 0, name);
    assert.deepEqual(fs.readFileSync(path.join(output, name)), committed.stdout, name + ' must rebuild with identical runtime bytes');
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(output, 'fleetV4.json')));
  assert.equal(metadata.version, '4.0.2');
  assert.match(fs.readFileSync(path.join(output, 'README.md'), 'utf8'), new RegExp(metadata.version.replaceAll('.', '\\.')));
  assert.equal(fs.existsSync(path.join(output, 'installer/openshell/fleet_legacy_inventory.json')), false);
});
