#!/usr/bin/env node
'use strict';
// A bounded local rehearsal. The real hub is observed, never quiesced. Only a
// stable database+WAL copy supplies records; no real audit/sign-in key is copied.
process.umask(0o077);
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const { TreeStore, read } = require('../src/lib/fleet-v3-tree-store');
const { importV4 } = require('../src/lib/fleet-v3-import');
const ROOT = path.resolve(__dirname, '..');
function hashes(root) {
  const result = {};
  function walk(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) walk(file);
      else result[path.relative(root, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  walk(root); return result;
}
function freeze(root) {
  const restore = [];
  function walk(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) walk(file);
      else { restore.push([file, 0o600]); fs.chmodSync(file, 0o400); }
    }
    restore.push([folder, 0o700]); fs.chmodSync(folder, 0o500);
  }
  walk(root); return () => { for (const [file, mode] of restore.reverse()) fs.chmodSync(file, mode); };
}
function main(realRoot) {
  if (!path.isAbsolute(realRoot)) throw Error('Supply an absolute V4 root.');
  const realConfig = JSON.parse(fs.readFileSync(path.join(realRoot, 'host-mode.json')));
  assert.equal(realConfig.generation, 4);
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), 'fv5-real-records-')));
  const source = path.join(fixture, 'v4'), target = path.join(fixture, 'v5');
  let thaw = () => {};
  try {
    const base = path.join(realRoot, 'workers/openshell-tree');
    const keys = fs.readdirSync(base).sort().filter(key => fs.existsSync(path.join(base,key,'tree.sqlite3')));
    assert.ok(keys.length > 0, 'real root has transactional trees');
    const records = [];
    let liveHub = false;
    for (const key of keys) {
      const folder = path.join(base,key), hubFile = path.join(folder,'hub.json');
      if (fs.existsSync(hubFile)) {
        const hub = JSON.parse(fs.readFileSync(hubFile));
        if (Number.isSafeInteger(hub.pid)) liveHub ||= require('../src/lib/process-claim-lock').pidAlive(hub.pid);
      }
      const file = path.join(folder, 'tree.sqlite3');
      const copyRoot = path.join(fixture, 'snapshot-' + key); fs.mkdirSync(copyRoot, { mode: 0o700 });
      let document;
      for (let attempt = 0; attempt < 3; attempt++) {
        const signature = () => Object.fromEntries(['','-wal','-shm'].filter(suffix => fs.existsSync(file + suffix))
          .map(suffix => [suffix, crypto.createHash('sha256').update(fs.readFileSync(file + suffix)).digest('hex')]));
        const before = signature();
        for (const suffix of Object.keys(before)) fs.copyFileSync(file + suffix, path.join(copyRoot, 'tree.sqlite3' + suffix));
        if (JSON.stringify(signature()) !== JSON.stringify(before)) { fs.rmSync(copyRoot, {recursive:true}); fs.mkdirSync(copyRoot,{mode:0o700}); continue; }
        document = read(path.join(copyRoot, 'tree.sqlite3')); break;
      }
      assert.ok(document, 'real database did not stabilize within three copy attempts');
      // Only process/session fields are detached in this synthetic source.
      for (const node of document.nodes) {
        node.process = null; node.sessionId = null; node.turn = 'none';
        if (['running','starting'].includes(node.state)) node.state = 'stopped';
      }
      records.push({ key, document, copiedDatabase: path.join(copyRoot, 'tree.sqlite3') });
    }
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TOOLSENABLED_') && key !== 'OPENSHELL_SANDBOX'));
    const setup = spawnSync(process.execPath, [path.join(ROOT, 'bin/fleetV4.js'), 'setup', '--state-root', source, '--workspace', fixture, '--actor', 'local'], { env, cwd:fixture, encoding:'utf8', timeout:20000 });
    assert.equal(setup.status, 0, setup.stderr);
    const originals = new Map();
    for (const {key,document,copiedDatabase} of records) {
      const relative = `workers/openshell-tree/${key}/tree.sqlite3`, destination = path.join(source, relative);
      fs.mkdirSync(path.dirname(destination), {recursive:true,mode:0o700});
      fs.copyFileSync(copiedDatabase, destination); fs.chmodSync(destination,0o600);
      const store = new TreeStore(destination); try { store.save(document,{compactHistory:false}); } finally { store.close(); }
      originals.set(relative, read(destination));
    }
    const before = hashes(source); thaw = freeze(source);
    const imported = importV4({sourceStateRoot:source,stateRoot:target});
    assert.equal(imported.workersStarted,0); assert.ok(isDeepStrictEqual(hashes(source),before), 'source bytes preserved');
    for (const [relative, original] of originals) {
      assert.ok(isDeepStrictEqual(read(path.join(target,relative)),original), 'real tree records preserved');
      assert.ok(fs.readFileSync(path.join(target,'v4-import-originals',relative)).equals(fs.readFileSync(path.join(source,relative))), 'original database bytes preserved');
    }
    assert.equal(fs.existsSync(path.join(target,'capability/audit-keys')),false);
    const result = { rehearsal:'synthetic-with-real-records', sourceRoot:realRoot, realHubBusy:liveHub, readOnlySource:true,
      trees:imported.trees, realNodes:records.reduce((sum,row)=>sum+row.document.nodes.length,0), copiedFiles:imported.copiedFiles,
      sourcePreserved:true, workersStarted:0, processFieldsDetached:true, fullRealRootSnapshot:false, copiedRealAuditKeys:false, temporaryRootsRemoved:false };
    thaw(); thaw=()=>{}; fs.rmSync(fixture,{recursive:true,force:true});
    result.temporaryRootsRemoved=!fs.existsSync(fixture);
    return result;
  } finally { thaw(); fs.rmSync(fixture,{recursive:true,force:true}); }
}
if (require.main===module) {
  try { process.stdout.write(JSON.stringify(main(process.argv[2]),null,2)+'\n'); }
  catch(error) { process.stderr.write(`${error.code||'REHEARSAL_FAILED'}: ${error.message}\n`); process.exitCode=1; }
}
module.exports={main};
