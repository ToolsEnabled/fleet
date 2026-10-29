'use strict';
const assert = require('node:assert/strict');
assert.equal(typeof process.env.V5_RECOVERY_EXPECTED_PATH, 'string', 'fixture publishes the expected runner PATH');
assert.equal(process.env.PATH, process.env.V5_RECOVERY_EXPECTED_PATH, 'the native command check inherits the runner PATH');
