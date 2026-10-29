'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), cp = require('node:child_process');
const source = process.env.SECURITY_TEST_FILE || path.resolve(__dirname, '../src/lib/windows-state-security.js');
const { session } = require('../src/lib/windows-security-phase');
function fixture(t, timeout=30000) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'security-phase-')), log=path.join(folder,'spawns.jsonl');
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const args=[path.join(__dirname,'fixtures/windows-security-helper.cjs'),log];
  const context={module:{exports:{}},exports:{},__dirname:path.dirname(source),process:{platform:'win32',env:{}},require:name=>{
    if(name==='node:child_process') return {spawnSync:(_exe,_args,opts)=>cp.spawnSync(process.execPath,args,opts)};
    if(name==='./windows-security-phase') return {session:()=>session({command:process.execPath,args,timeout})};
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync(source,'utf8'),context,{filename:source});
  const security=context.module.exports;
  const phase=security.withPhase ? fn=>security.withPhase(fn,{stateRoot:folder}) : fn=>fn();
  const entries=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
  return {security,phase,entries};
}
function code(fn){try{fn();return 'PASS'}catch(e){return e.code}}
function exited(rows){for(const {pid}of rows)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});}
test('N interleaved checks use one helper and preserve check/mutation order',t=>{
 const f=fixture(t),trace=[];
 f.phase(()=>{for(const name of ['first','second','third']){trace.push('check:'+name);f.security.check('inspect',path.resolve(name));trace.push('mutation:'+name);}});
 assert.deepEqual(trace,['check:first','mutation:first','check:second','mutation:second','check:third','mutation:third']);
 assert.equal(f.entries().length,1,'N=3 checks must spawn one phase helper');exited(f.entries());
});
test('fresh pass/deny/owner-mismatch verdicts equal one-shot verdicts and first failure stops the same step',t=>{
 const f=fixture(t),names=['pass','deny','owner-mismatch'];
 const expected=names.map(name=>code(()=>f.security.check('inspect',path.resolve(name))));
 const actual=f.phase(()=>names.map(name=>code(()=>f.security.check('inspect',path.resolve(name)))));
 assert.deepEqual(actual,expected);assert.deepEqual(actual,['PASS','HOST_STATE_UNSAFE','HOST_STATE_UNSAFE']);
 const run=phase=>{const trace=[];let failure;try{phase(()=>{for(const name of ['pass','deny','unreached']){trace.push('check:'+name);f.security.check('inspect',path.resolve(name));trace.push('mutation:'+name);}})}catch(e){failure=e.code}return{trace,failure}};
 assert.deepEqual(run(f.phase),run(fn=>fn()));exited(f.entries());
});
test('helpers have exited before success, exception and denial return',t=>{
 const f=fixture(t);f.phase(()=>f.security.check('inspect',path.resolve('pass')));exited(f.entries());
 assert.throws(()=>f.phase(()=>{f.security.check('inspect',path.resolve('pass'));throw Error('fixture failure')}),/fixture failure/);exited(f.entries());
 assert.equal(code(()=>f.phase(()=>f.security.check('inspect',path.resolve('deny')))),'HOST_STATE_UNSAFE');exited(f.entries());
});
for(const name of ['hang','crash','protocol'])test(name+' fails closed at the check and exits helper before return',{timeout:10000},t=>{
 const f=fixture(t,500);let reached=false;
 assert.equal(code(()=>f.phase(()=>{f.security.check('inspect',path.resolve(name));reached=true})),'HOST_STATE_UNSAFE');assert.equal(reached,false);exited(f.entries());
});
test('new phases do not reuse processes or verdicts',t=>{
 const f=fixture(t);for(let n=0;n<2;n++)f.phase(()=>f.security.check('inspect',path.resolve('pass')));
 assert.equal(f.entries().length,2);assert.notEqual(f.entries()[0].pid,f.entries()[1].pid);exited(f.entries());
});
test('controller exits after helper close even when inherited diagnostics write to worker stderr',{timeout:15000},t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'security-stdio-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const result=cp.spawnSync(process.execPath,['--require',path.join(__dirname,'fixtures/windows-security-noisy-preload.cjs'),path.join(__dirname,'fixtures/windows-security-stdio.cjs'),path.join(folder,'pids')],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'closed\n');
});
test('startup READY follows the verified exit of every phase helper and is absent on failure',t=>{
 const f=fixture(t),trace=[];
 for(const name of ['configure','workers']){f.phase(()=>f.security.check('inspect',path.resolve('pass')));exited(f.entries());trace.push(name+':helper-exited');}
 trace.push('READY');assert.deepEqual(trace,['configure:helper-exited','workers:helper-exited','READY']);
 let ready=false;assert.equal(code(()=>{f.phase(()=>f.security.check('inspect',path.resolve('deny')));ready=true}),'HOST_STATE_UNSAFE');assert.equal(ready,false);exited(f.entries());
});
