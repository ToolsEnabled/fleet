'use strict';
process.umask(0o077);
const isolation = require('./lib/isolated-environment').activate('fleet-v5-import');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { TreeStore, read } = require('../src/lib/fleet-v3-tree-store');
const { importV4 } = require('../src/lib/fleet-v3-import');
const { startHostAgentMode } = require('../src/lib/host-agent-mode');
const { createOpenShellAgentHost, openShellRoleHooks } = require('../src/lib/openshell-agent-host');
const runtime = require('../src/lib/host-runtime');

// V5 lead decision, board 409: retain the production Windows platform refusal.
const WINDOWS_IMPORT_REASON = 'Windows V4-state import stays unsupported in this alpha';
const importInvariantTest = (name, body) => test(name, {
  skip: process.platform === 'win32' ? WINDOWS_IMPORT_REASON : false,
}, body);
test('Windows V4-state import refuses before destination creation', {
  skip: process.platform !== 'win32' ? 'Windows-only production platform refusal' : false,
  timeout: process.platform === 'win32' ? 120000 : undefined,
}, () => {
  const sourceStateRoot = path.join(isolation.root, 'unsupported-v4');
  const stateRoot = path.join(isolation.root, 'unsupported-v5');
  assert.equal(fs.existsSync(stateRoot), false);
  assert.throws(() => importV4({ sourceStateRoot, stateRoot }), { code: 'FLEET_IMPORT_PLATFORM' });
  assert.equal(fs.existsSync(stateRoot), false);
});

function run(version, args, cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TOOLSENABLED_') && key !== 'OPENSHELL_SANDBOX'));
  return spawnSync(process.execPath, [path.resolve(__dirname, `../bin/fleetV${version}.js`), ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
}
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), 'fv5-import-')));
  const source = path.join(root, 'v4'), target = path.join(root, 'v5');
  assert.equal(run(4, ['setup', '--state-root', source, '--workspace', root, '--actor', 'codex'], root).status, 0);
  const closers = [];
  t.after(async () => { for (const close of closers) await close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, source, target, closers, options: { sourceStateRoot: source, stateRoot: target } };
}
function snapshot(root) {
  const result = {};
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else result[path.relative(root, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(root); return result;
}
function saveTree(source, document) {
  const file = path.join(source, 'workers', 'openshell-tree', document.treeKey, 'tree.sqlite3');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const store = new TreeStore(file); try { store.save(document); } finally { store.close(); }
  return file;
}
importInvariantTest('V4 to V5 imports retained work and resumes its conversation only through Fleet', async t => {
  const f = fixture(t), sessions = []; let backend;
  async function open(stateRoot, treeKey) {
    const mode = startHostAgentMode({ config: runtime.readHostConfig(stateRoot), actor: 'codex', treeKey, listen: false,
      env: { TOOLSENABLED_RUNTIME_MODE: 'host', TOOLSENABLED_FLEET_PROFILE: 'fleetV2', TOOLSENABLED_FLEET_GENERATION: stateRoot === f.source ? '4' : '5',
        TOOLSENABLED_TOOL_ALLOWLIST: require('../src/lib/host-surface').hostAllowlist({ workers: true, fleetV2: true }).join(',') },
      createLauncher: () => ({ async start(spec) {
        const session = { spec, threadId: spec.threadId || 'retained-v4-thread', turns: [], close() {}, async quiesce() {},
          adapter: { async sendTurn(turn) { session.turns.push(turn); return { threadId: session.threadId, turnId: 'turn-' + session.turns.length }; }, async interrupt() {} } };
        session.control = args => backend.handleLink(spec.linkToken, 'fleet-control', args);
        sessions.push(session); return session;
      } }),
      createHost: options => { backend = createOpenShellAgentHost({ ...options, roleHooks: openShellRoleHooks({ roles: null }), leadLevel: 4,
        watchIntervalMs: 0, getMessagePolicy: () => ({ mode: 'instant', intervalMs: 1000, resetAfterTask: true }) }); return backend; }
    });
    await mode.ready;
    return mode;
  }
  let mode = await open(f.source);
  f.closers.push(async () => { await mode?.close(); require('../src/lib/tree-host-registry').clearTreeSpawnHost(); });
  const worker = await mode.host.spawn({ parentSessionId: mode.context.agentSessionId, tier: 'codex', role: 'worker', brief: 'Keep the original output.' });
  await sessions[0].control({ action: 'ask', id: 'migration-input', question: 'Which input?', expectedTaskRevision: 1 });
  const key = mode.treeKey;
  const live = run(5, ['import-v4', '--source-state-root', f.source, '--state-root', f.target], f.root);
  assert.equal(live.status, 1); assert.match(live.stderr, /FLEET_IMPORT_LIVE/); assert.equal(fs.existsSync(f.target), false);
  await mode.close(); mode = null; require('../src/lib/tree-host-registry').clearTreeSpawnHost();
  const relative = path.join('workers', 'openshell-tree', key, 'tree.sqlite3');
  const original = read(path.join(f.source, relative));
  fs.writeFileSync(path.join(f.source, 'opaque.bin'), Buffer.from([0,255,12,0]), { mode: 0o600 });
  const before = snapshot(f.source);
  const imported = run(5, ['import-v4', '--source-state-root', f.source, '--state-root', f.target], f.root);
  assert.equal(imported.status, 0, imported.stderr);
  const receipt = JSON.parse(imported.stdout);
  assert.equal(receipt.workersStarted, 0); assert.equal(receipt.trees, 1); assert.equal(receipt.name, 'fleetV5');
  assert.deepEqual(snapshot(f.source), before);
  const copied = read(path.join(f.target, relative));
  assert.deepEqual(copied.fleetControl, original.fleetControl);
  assert.deepEqual(copied.fleetMetrics, original.fleetMetrics);
  assert.deepEqual(copied.inbox, original.inbox);
  assert.equal(copied.nodes[0].threadId, original.nodes[0].threadId);
  assert.equal(copied.nodes[0].sessionId, null);
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'v4-import-originals', relative)), fs.readFileSync(path.join(f.source, relative)));
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'opaque.bin')), Buffer.from([0,255,12,0]));
  assert.equal(run(5, ['status', '--state-root', f.target], f.root).status, 0);
  assert.match(run(4, ['status', '--state-root', f.target], f.root).stderr, /FLEET_GENERATION_MISMATCH/);
  mode = await open(f.target, key);
  assert.equal(sessions.length, 1);
  const current = await mode.host.fleetControl({ action: 'read' }, mode.context.agentSessionId);
  await mode.host.fleetControl({ action: 'answer', id: 'migration-input', answer: 'Original input.', resume: true, expectedRevision: current.revision }, mode.context.agentSessionId);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].spec.threadId, sessions[0].threadId);
  assert.match(sessions[1].turns[0].text, /Original input/);
  await assert.rejects(sessions[1].control({ action: 'complete', text: 'Wrong task', expectedTaskRevision: 2 }), { code: 'FLEET_TASK_STALE_REVISION' });
  const workerCompletionReceipt = await sessions[1].control({ action: 'complete', text: 'Retained result' });
  assert.equal(workerCompletionReceipt.task.taskRevision, 1, 'omission uses the imported task sent to this turn');
  assert.equal((await sessions[1].control({ action: 'complete', text: 'Retained result', expectedTaskRevision: 1 })).replay, true);
  const completed = read(path.join(f.target, relative));
  assert.equal(completed.fleetControl.tasks[worker.nodeId].submission.text, 'Retained result');
  assert.equal(completed.fleetControl.tasks[worker.nodeId].assessment, undefined);
  assert.deepEqual(snapshot(f.source), before);
  await mode.close(); mode = null;
  // Returning to the frozen source is rollback, not a merge of V5 results.
  assert.equal(run(4, ['status', '--state-root', f.source], f.root).status, 0);
  assert.deepEqual(read(path.join(f.source, relative)).fleetControl, original.fleetControl);
});
importInvariantTest('V5 import rejects wrong generations, overlap, aliases and an existing destination', t => {
  const f = fixture(t);
  assert.throws(() => importV4({ ...f.options, stateRoot: f.source }), { code: 'FLEET_IMPORT_OVERLAP' });
  const alias = path.join(f.source, 'alias'); fs.symlinkSync(path.join(f.source, 'host-mode.json'), alias);
  assert.throws(() => importV4(f.options), { code: 'FLEET_IMPORT_PATH' }); fs.unlinkSync(alias);
  fs.mkdirSync(f.target, { mode: 0o700 }); assert.throws(() => importV4(f.options), { code: 'FLEET_IMPORT_EXISTS' }); fs.rmdirSync(f.target);
  const file = path.join(f.source, 'host-mode.json'), bytes = fs.readFileSync(file), config = JSON.parse(bytes);
  fs.writeFileSync(file, JSON.stringify({ ...config, generation: 5 }));
  assert.throws(() => importV4(f.options), { code: 'FLEET_IMPORT_GENERATION' }); fs.writeFileSync(file, bytes);
  for (const [version,args] of [[4,['import-v4','--source-state-root',f.source,'--state-root',f.target]], [5,['import-v4','--source-state-root',f.source]], [5,['import-v4','--source-state-root',f.source,'--state-root',f.target,'--actor','codex']]]) {
    const result = run(version,args,f.root); assert.equal(result.status,1); assert.match(result.stderr,/import-v4/);
  }
  assert.equal(fs.existsSync(f.target), false);
});
importInvariantTest('V5 import preserves source and leaves no activation marker after a copy race or setup failure', t => {
  const f = fixture(t), before = snapshot(f.source);
  assert.throws(() => importV4(f.options, { runtime: { ...runtime, setupHost() { throw Error('injected setup failure'); } } }), /injected setup failure/);
  assert.deepEqual(snapshot(f.source), before); assert.equal(fs.existsSync(path.join(f.target, 'host-mode.json')), false);
  const changed = path.join(f.root, 'changed');
  assert.throws(() => importV4({ ...f.options, stateRoot: changed }, { beforeVerify() {
    fs.writeFileSync(path.join(f.source, 'arrived.bin'), 'retained', { mode: 0o600 });
  } }), { code: 'FLEET_IMPORT_CHANGED' });
  assert.equal(fs.existsSync(path.join(changed, 'host-mode.json')), false);
  assert.equal(run(5, ['status','--state-root',changed], f.root).status, 1);
});
importInvariantTest('pending host publication blocks import without retry or source changes', t => {
  const f = fixture(t), { DatabaseSync } = require('node:sqlite');
  const folder = path.join(f.source, 'capability', 'state', 'byte-coordination-host');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(folder, 'data.sqlite'));
  db.exec("CREATE TABLE operations(status TEXT); INSERT INTO operations VALUES ('UNKNOWN')"); db.close();
  const before = snapshot(f.source);
  assert.throws(() => importV4(f.options), { code: 'FLEET_IMPORT_UNRESOLVED' });
  assert.equal(fs.existsSync(f.target), false); assert.deepEqual(snapshot(f.source), before);
});

importInvariantTest('V5 import preserves the audit keystore empty flock sentinel as opaque state', t => {
  const f = fixture(t);
  const relative = 'capability/audit-keys/store.lock', lock = path.join(f.source, relative);
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  fs.writeFileSync(lock, '', { mode: 0o600 });
  const before = snapshot(f.source);
  const result = importV4(f.options);
  assert.equal(result.workersStarted, 0);
  assert.deepEqual(snapshot(f.source), before);
  assert.equal(fs.statSync(path.join(f.target, relative)).size, 0);
  assert.equal(fs.existsSync(path.join(f.target, 'v4-import-originals', relative)), false);
});

importInvariantTest('invalid import diagnostics identify files and record kinds without record values', t => {
  const f = fixture(t), relative = 'stale.lock', file = path.join(f.source, relative);
  const privateValue = 'fixture-private-body';
  fs.writeFileSync(file, '{' + privateValue, { mode: 0o600 });
  assert.throws(() => importV4(f.options), error => {
    assert.equal(error.code, 'FLEET_IMPORT_INVALID');
    assert.match(error.message, /stale\.lock/);
    assert.match(error.message, /ownership record/);
    assert.equal(error.message.includes(privateValue), false);
    return true;
  });
  fs.unlinkSync(file);
  const folder = path.join(f.source, 'capability/audit-keys');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(folder, 'store.lock'), privateValue, { mode: 0o600 });
  assert.throws(() => importV4(f.options), error => {
    assert.equal(error.code, 'FLEET_IMPORT_INVALID');
    assert.match(error.message, /capability\/audit-keys\/store\.lock/);
    assert.match(error.message, /audit keystore flock sentinel/);
    assert.equal(error.message.includes(privateValue), false);
    return true;
  });
  assert.equal(fs.existsSync(f.target), false);
});

importInvariantTest('V5 import keeps oversized live metrics and existing cold history byte-exact', t => {
  const f = fixture(t), folder = path.join(f.source, 'workers/openshell-tree/codex');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, 'tree.sqlite3');
  const document = { v: 1, treeKey: 'codex', root: { actor: 'codex' }, nodes: [],
    fleetMetrics: { entries: Array.from({ length: 2301 }, (_, n) => ({ n, synthetic: true })) } };
  const store = new TreeStore(file);
  try {
    store.save(document); // Establish actual cold history using normal retention.
    document.fleetMetrics = { entries: Array.from({ length: 2289 }, (_, n) => ({ n, live: true })) };
    store.save(document, { compactHistory: false }); // Match a pre-retention V4 document.
  } finally { store.close(); }
  const original = read(file);
  const { DatabaseSync } = require('node:sqlite');
  const history = file => {
    const db = new DatabaseSync(file, { readOnly: true });
    try { return { rows: db.prepare('SELECT * FROM history ORDER BY kind,scope,seq').all(),
      counts: db.prepare('SELECT * FROM history_counts ORDER BY kind,scope').all() }; }
    finally { db.close(); }
  };
  const cold = history(file);
  assert.equal(cold.rows.length, 1301);
  const before = snapshot(f.source);
  const result = importV4(f.options);
  assert.equal(result.workersStarted, 0);
  const target = path.join(f.target, 'workers/openshell-tree/codex/tree.sqlite3');
  assert.deepEqual(read(target), original);
  assert.equal(read(target).fleetMetrics.entries.length, 2289);
  assert.deepEqual(history(target), cold);
  assert.deepEqual(snapshot(f.source), before);
});

importInvariantTest('V5 import accepts a physically read-only source snapshot and preserves every record', t => {
  const f = fixture(t);
  const document = { v: 1, treeKey: 'codex', root: { actor: 'codex' }, nodes: [],
    inbox: [{ seq: 1, text: 'retained message' }], fleetMetrics: { entries: [{ cost: null }] } };
  saveTree(f.source, document);
  const records = {
    'services/settings.json': { revision: 7, values: { 'browser.enabled': false } },
    'capability/state/retained-contracts.json': { tasks: [{ taskRevision: 7, status: 'assigned' }], outcomes: { reported: 'done', assessment: null } }
  };
  for (const [relative, value] of Object.entries(records)) {
    const file = path.join(f.source, relative); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  }
  const modes = [];
  function freeze(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) freeze(file); else { modes.push([file, 0o600]); fs.chmodSync(file, 0o400); }
    }
    modes.push([folder, 0o700]); fs.chmodSync(folder, 0o500);
  }
  const before = snapshot(f.source);
  try {
    freeze(f.source);
    const result = importV4(f.options);
    assert.equal(result.workersStarted, 0);
    assert.deepEqual(snapshot(f.source), before);
    assert.deepEqual(read(path.join(f.target, 'workers/openshell-tree/codex/tree.sqlite3')), document);
    for (const relative of Object.keys(records)) assert.deepEqual(fs.readFileSync(path.join(f.target, relative)), fs.readFileSync(path.join(f.source, relative)));
    assert.equal(fs.existsSync(path.join(f.target, 'workers/openshell-tree/codex/hub.json')), false);
  } finally { for (const [file, mode] of modes.reverse()) fs.chmodSync(file, mode); }
});

importInvariantTest('V5 import retains earlier-generation import originals as opaque rollback evidence', t => {
  const f = fixture(t);
  for (const [relative, body] of [
    ['v3-import-originals/capability/audit-keys/store.lock',''],
    ['v3-import-originals/workers/openshell-tree/codex/owner.json',JSON.stringify({pid:process.pid})],
    ['v3-import-originals/v2-import-originals/host-mode.json','opaque retained original']
  ]) {
    const file = path.join(f.source, relative); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, body, { mode: 0o600 });
  }
  const before = snapshot(f.source);
  assert.equal(importV4(f.options).workersStarted, 0);
  assert.deepEqual(snapshot(f.source), before);
  for (const relative of Object.keys(before).filter(file => file.startsWith('v3-import-originals/')))
    assert.deepEqual(fs.readFileSync(path.join(f.target, relative)), fs.readFileSync(path.join(f.source, relative)));
});
