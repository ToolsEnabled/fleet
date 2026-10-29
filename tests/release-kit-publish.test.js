'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
test('publish gates refuse invalid bytes and invoke only intercepted existing-release uploads', () => {
  const result = spawnSync('python3', [path.join(__dirname, 'release-kit-publish.test.py')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
