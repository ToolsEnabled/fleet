'use strict';
// The V4 package ships only files in installer/fleetV2/SOURCE-ALLOWLIST. A
// shipped module that requires a file left off that list starts in source
// tests but fails when the packaged hub starts. Check every literal relative
// require of every shipped script against the list.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function unshippedRequires(listFile) {
  const shipped = new Set(fs.readFileSync(path.join(ROOT, listFile), 'utf8').split('\n').map(line => line.trim()).filter(Boolean));
  const missing = [];
  for (const file of shipped) {
    if (!/\.c?js$/.test(file) || !fs.existsSync(path.join(ROOT, file))) continue;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of text.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      const found = [base, `${base}.js`, `${base}.cjs`, `${base}.json`, `${base}/index.js`]
        .filter(candidate => fs.existsSync(path.join(ROOT, candidate)) && fs.statSync(path.join(ROOT, candidate)).isFile());
      if (found.length && !found.some(candidate => shipped.has(candidate))) missing.push(`${file} requires ${found[0]}`);
    }
  }
  return missing;
}

test('the V4 source allowlist is sorted and unique, as the package build requires', () => {
  const lines = fs.readFileSync(path.join(ROOT, 'installer/fleetV2/SOURCE-ALLOWLIST'), 'utf8').split('\n').filter(Boolean);
  const ordered = [...new Set(lines)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(lines, ordered);
});

test('every module a shipped V4 script requires is itself in the V4 source allowlist', () => {
  assert.deepEqual(unshippedRequires('installer/fleetV2/SOURCE-ALLOWLIST'), []);
});

test('every shipped V4 runtime file is also in the V4 public source export list', () => {
  const read = file => new Set(fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').map(line => line.trim()).filter(Boolean));
  const exported = read('public-source/FLEET-V4-ALLOWLIST.txt');
  assert.deepEqual([...read('installer/fleetV2/SOURCE-ALLOWLIST')].filter(file => !exported.has(file)), []);
});

test('V5 package and export lists include the generation entry, surface and complete contract core', () => {
  const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').filter(Boolean);
  const runtime = read('installer/fleetV2/SOURCE-ALLOWLIST');
  const exported = read('public-source/FLEET-V5-ALLOWLIST.txt');
  assert.deepEqual(exported, [...new Set(exported)].sort());
  assert.deepEqual(runtime.filter(file => !exported.includes(file)), []);
  for (const file of ['bin/fleetV5.js','fleetV5.json','src/lib/fleet-v5-contracts.js','src/lib/fleet-v5-computers.js','src/lib/fleet-v5-selector.js','src/lib/fleet-v5-surface.js']) assert.ok(runtime.includes(file), file);
  for (const file of exported) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  assert.deepEqual(unshippedRequires('public-source/FLEET-V5-ALLOWLIST.txt').filter(item => !item.startsWith('tests/')), []);
});
