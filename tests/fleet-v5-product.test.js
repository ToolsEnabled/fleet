'use strict';
process.umask(0o077);
require('./lib/isolated-environment').activate('fleet-v5-product');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const identity = require('../src/lib/product-identity');
const surface = require('../src/lib/fleet-v5-surface');
const ROOT = path.resolve(__dirname, '..');
function run(version, args, cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TOOLSENABLED_') && key !== 'OPENSHELL_SANDBOX'));
  return spawnSync(process.execPath, [path.join(ROOT, `bin/fleetV${version}.js`), ...args], { env, cwd, encoding: 'utf8', timeout: 10000 });
}
test('V5 entry, default state, metadata and runtime identity agree', () => {
  const { product } = require('../bin/fleetV5');
  assert.equal(product.name, 'fleetV5'); assert.equal(product.generation, 5);
  assert.equal(product.defaultStateRoot(), path.join(os.homedir(), '.fleetV5'));
  assert.equal(product.entry, path.join(ROOT, 'bin/fleetV5.js'));
  assert.equal(product.metadata.entry, 'bin/fleetV5.js');
  assert.deepEqual(identity.productIdentity({ TOOLSENABLED_FLEET_PROFILE: 'fleetV2', TOOLSENABLED_FLEET_GENERATION: '5' }), { name: 'fleetV5', version: product.metadata.version });
  assert.equal(identity.transactionalGeneration(5), true); assert.equal(identity.generationName(5), 'fleetV5');
  assert.equal(run(5, ['--version'], ROOT).stdout.trim(), `fleetV5 ${product.metadata.version}`);
});
test('V2/V3/V4 reject V5 state and V5 rejects V4 before any direct or hub operation', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), 'fv5-generation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const v4 = path.join(root, 'v4'), v5 = path.join(root, 'v5');
  for (const [version, state] of [[4, v4], [5, v5]]) {
    const setup = run(version, ['setup', '--state-root', state, '--workspace', root, '--actor', 'local'], root);
    assert.equal(setup.status, 0, setup.stderr);
    const response = JSON.parse(setup.stdout);
    assert.equal(response.name, `fleetV${version}`);
    assert.equal(response.server.args[0], path.join(ROOT, `bin/fleetV${version}.js`));
  }
  const bytes = fs.readFileSync(path.join(v5, 'host-mode.json'));
  for (const [version, state] of [[2,v5], [3,v5], [4,v5], [5,v4]]) {
    for (const action of [['status'], ['serve','--actor','local'], ['scope','--revision','1'], ['rebind'], ['hub','start','--actor','local']]) {
      const result = run(version, [...action, '--state-root', state], root);
      assert.equal(result.status, 1, JSON.stringify({ version, action, stderr: result.stderr }));
      assert.match(result.stderr, /FLEET_GENERATION_MISMATCH/);
    }
  }
  assert.deepEqual(fs.readFileSync(path.join(v5, 'host-mode.json')), bytes);
  if (fs.existsSync(path.join(v5, 'workers'))) assert.deepEqual(fs.readdirSync(path.join(v5, 'workers')), []);
});
test('ordinary V5 surface selects only contracts; admin, workers and V4 keep native surfaces', () => {
  assert.deepEqual(surface.leadToolNames({ generation: 5 }), [...surface.CONTRACT_TOOLS]);
  assert.equal(surface.leadToolNames({ generation: 5, admin: true }), undefined);
  assert.equal(surface.leadToolNames({ generation: 5, linkedWorker: true }), undefined);
  assert.equal(surface.leadToolNames({ generation: 4 }), undefined);
  for (const version of [2,3,4]) assert.throws(() => surface.validateAdmin(version, true), { code: 'FLEET_ADMIN_INVALID' });
  surface.validateAdmin(5, true);
  assert.equal(run(4, ['serve','--admin'], ROOT).status, 1);
  assert.match(run(5, ['setup','--admin'], ROOT).stderr, /--admin applies only/);
  assert.match(run(5, ['serve','--ledger-only'], ROOT).stderr, /requires explicit --admin/);
});

test('repository source, docs, tests, metadata and evidence contain no retired product branding', () => {
  const retired = /\b(?:\x7a\x75\x73\x65|\x7a\x65\x75\x73)\b/i;
  const violations = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (['.git','dist','node_modules','__pycache__'].includes(entry.name)) continue;
      const file = path.join(folder, entry.name), relative = path.relative(ROOT, file);
      if (retired.test(entry.name)) violations.push(relative + ' filename');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(file);
        if (!bytes.includes(0) && retired.test(bytes.toString('utf8'))) violations.push(relative + ' content');
      }
    }
  }
  walk(ROOT); assert.deepEqual(violations, []);
});

test('V5 interior worker profile retains the inherited native Fleet tools', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), 'fv5-worker-profile-'))), state = path.join(root, 'v5');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const setup = run(5, ['setup','--state-root',state,'--workspace',root,'--actor','local'],root);
  assert.equal(setup.status,0,setup.stderr);
  const runtime = require('../src/lib/host-runtime'), config = runtime.readHostConfig(state);
  const env = { ...process.env, TOOLSENABLED_HOST_NODE:'fixture-worker', TOOLSENABLED_HOST_SESSION:'fixture-session',
    TOOLSENABLED_TOOL_ALLOWLIST:'fleet.control,host.read_file,r_ledger.withdraw' };
  runtime.configureHost(config,{env,actor:'local'});
  assert.equal(env.TOOLSENABLED_FLEET_GENERATION,'5');
  assert.deepEqual(env.TOOLSENABLED_TOOL_ALLOWLIST.split(',').sort(),['fleet.control','host.read_file']);
  assert.equal(surface.leadToolNames({generation:5,linkedWorker:true}),undefined);
});
