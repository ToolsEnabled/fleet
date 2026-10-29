'use strict';
process.umask(0o077);
require('./lib/provider-cli-environment').activate('fleet-v5-lead-surface', { preserveWindowsAccount: true });
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = fs.realpathSync(process.env.FLEET_V5_TEST_RUNTIME || path.resolve(__dirname, '..'));
const { CONTRACT_TOOLS } = require(path.join(ROOT, 'src/lib/fleet-v5-surface'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TOOLSENABLED_') && key !== 'OPENSHELL_SANDBOX'));
function cli(version,args,cwd) {
  const started=Date.now();
  const result=spawnSync(process.execPath,[path.join(ROOT,`bin/fleetV${version}.js`),...args],{env,cwd,encoding:'utf8',timeout:process.platform==='win32'?60000:20000});
  result.fixtureDurationMs=Date.now()-started;
  return result;
}
async function connection(version, args, cwd, inspect) {
  const child = spawn(process.execPath,[path.join(ROOT,`bin/fleetV${version}.js`),'serve',...args],{env,cwd,stdio:['pipe','pipe','pipe']});
  let sequence=0, buffer='', stderr='', failure=null;
  const pending = new Map();
  const closed = new Promise(resolve=>child.once('close',resolve));
  function fail(error) { failure=error; for(const waiter of pending.values())waiter.reject(error); pending.clear(); }
  child.on('error',fail); child.stdin.on('error',fail);
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.on('close',()=>fail(Error('MCP closed: '+stderr)));
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    let offset;
    while((offset=buffer.indexOf('\n'))>=0) {
      const line=buffer.slice(0,offset);buffer=buffer.slice(offset+1);if(!line.trim())continue;
      let message;try{message=JSON.parse(line);}catch{fail(Error('invalid MCP JSON'));return;}
      const waiter=pending.get(message.id); if(waiter){pending.delete(message.id);waiter.resolve(message);}
    }
  });
  const deadline=setTimeout(()=>{fail(Error('MCP deadline: '+stderr));child.kill('SIGKILL');},process.platform==='win32'?60000:20000);
  async function request(method,params={}) {
    if(failure)throw failure;
    return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  }
  try {
    const init=await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'v5-surface-test',version:'0'}});
    assert.equal(init.result.serverInfo.name,`fleetV${version}`);
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    await inspect(request, init.result.instructions);
  } finally {
    child.stdin.end();
    const stop=setTimeout(()=>child.kill('SIGKILL'),3000);
    await closed;clearTimeout(stop);clearTimeout(deadline);
  }
}
function assertOrdinaryV5Guidance(instructions) {
  assert.equal(typeof instructions, 'string');
  assert.match(instructions, /Fleet V5 ordinary lead/);
  for (const name of CONTRACT_TOOLS) assert.ok(instructions.includes(name), `initialize guidance names ${name}`);
  assert.doesNotMatch(instructions, /Worker launching is disabled|# Fleet lead manual|fleet\.control|agent\.spawn|nodeId|hub start/i);
}
function fixture(t, version) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(),'fv5-surface-'))),state=path.join(root,'state');
  t.after(()=>{cli(version,['hub','stop','--state-root',state,'--actor','local'],root);fs.rmSync(root,{recursive:true,force:true});});
  const setup=cli(version,['setup','--state-root',state,'--workspace',root,'--actor','local'],root);
  assert.equal(setup.status,0,setup.stderr);
  return {root,state,flags:['--state-root',state,'--actor','local']};
}
async function assertSurface(request, ordinary) {
  const list=await request('tools/list');const names=list.result.tools.map(tool=>tool.name);
  if(ordinary)assert.deepEqual(names.sort(),[...CONTRACT_TOOLS].sort());
  else {assert.ok(names.includes('fleet.control'));assert.ok(names.includes('host.read_file'));}
  const call=await request('tools/call',{name:'fleet.control',arguments:{action:'read'}});
  if(ordinary)assert.ok(call.error||call.result?.isError,'native call is refused, including unlisted calls');
  else {assert.equal(call.error,undefined);assert.equal(call.result.isError,undefined);}
  const hubAction=await request('tools/call',{name:'fleet.control',arguments:{action:'orchestrators'}});
  if(ordinary)assert.ok(hubAction.error||hubAction.result?.isError,'hub native action is refused before interception');
}
test('direct V5 MCP leads get six contract tools; explicit admin and V4 retain native tools',{timeout:process.platform==='win32'?300000:90000},async t=>{
  const v5=fixture(t,5),v4=fixture(t,4);
  await connection(5,v5.flags,v5.root,(request,instructions)=>{assertOrdinaryV5Guidance(instructions);return assertSurface(request,true);});
  await connection(5,[...v5.flags,'--admin'],v5.root,(request,instructions)=>{assert.match(instructions,/^fleetV2 standalone MCP/);assert.match(instructions,/# Fleet lead manual/);return assertSurface(request,false);});
  await connection(4,v4.flags,v4.root,(request,instructions)=>{assert.match(instructions,/^fleetV2 standalone MCP/);assert.match(instructions,/# Fleet lead manual/);return assertSurface(request,false);});
});
test('workers-off V5 ordinary serve refuses explicitly while admin and V4 coordination remain available',{timeout:process.platform==='win32'?300000:90000},async t=>{
  const roots=[];
  const workersOff=(version)=>{
    const root=fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(),'fv5-workers-off-'))),state=path.join(root,'state');roots.push({root,state,version});
    const setup=cli(version,['setup','--state-root',state,'--workspace',root,'--coordination-only','--actor','local'],root);
    assert.equal(setup.status,0,setup.stderr);
    return {root,state,flags:['--state-root',state,'--actor','local']};
  };
  t.after(()=>{for(const item of roots){cli(item.version,['hub','stop','--state-root',item.state,'--actor','local'],item.root);fs.rmSync(item.root,{recursive:true,force:true});}});
  const v5=workersOff(5),v4=workersOff(4);
  const refused=cli(5,['serve',...v5.flags],v5.root);
  assert.equal(refused.status,1,refused.stdout+refused.stderr);
  assert.match(refused.stderr,/FLEET_V5_WORKERS_REQUIRED: Fleet V5 ordinary lead connections require workers enabled/);
  await connection(5,[...v5.flags,'--admin','--ledger-only'],v5.root,async request=>{
    const list=await request('tools/list');
    assert.deepEqual(list.result.tools.map(tool=>tool.name).sort(),['ledger.read','r_ledger.withdraw']);
    const ledger=await request('tools/call',{name:'ledger.read',arguments:{kinds:['R']}});
    assert.equal(ledger.error,undefined);assert.equal(ledger.result.isError,undefined);
  });
  await connection(4,v4.flags,v4.root,async request=>{
    const list=await request('tools/list');
    assert.ok(list.result.tools.length>0,'V4 coordination-only mode keeps its existing native MCP surface');
    assert.equal(list.result.tools.some(tool=>tool.name.startsWith('fleet.contract.')),false);
  });
});
test('detached V5 hub connections separate ordinary contracts from explicit native admin',{timeout:process.platform==='win32'?300000:90000},async t=>{
  const f=fixture(t,5);
  const started=cli(5,['hub','start',...f.flags],f.root);if(process.platform==='win32')t.diagnostic(JSON.stringify({stage:'hub-start',durationMs:started.fixtureDurationMs,exitCode:started.status,errorCode:started.error?.code}));assert.equal(started.status,0,started.stderr);
  await connection(5,[...f.flags,'--attach','--name','ordinary'],f.root,request=>assertSurface(request,true));
  await connection(5,[...f.flags,'--attach','--name','admin','--admin'],f.root,request=>assertSurface(request,false));
  const ordinary=cli(5,['call',...f.flags,'fleet.control','{"action":"read"}'],f.root);
  assert.equal(ordinary.status,2,ordinary.stdout+ordinary.stderr);
  const admin=cli(5,['call','--admin',...f.flags,'fleet.control','{"action":"read"}'],f.root);
  assert.equal(admin.status,0,admin.stdout+admin.stderr);
});
