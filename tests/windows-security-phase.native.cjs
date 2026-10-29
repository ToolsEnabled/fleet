'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const engine=process.env.FLEET_PACKAGED_ENGINE||path.resolve(__dirname,'..'),security=require(path.join(engine,'src/lib/windows-state-security'));
let phaseRoot; const phase=security.withPhase ? fn=>security.withPhase(fn,{stateRoot:phaseRoot}) : fn=>fn();
const native={skip:process.platform!=='win32',timeout:120000};
const spawns=()=>fs.existsSync(process.env.SECURITY_SPAWN_LOG)?fs.readFileSync(process.env.SECURITY_SPAWN_LOG,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
function gone(rows){for(const {pid}of rows)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'})}
function closedJobs(rows){const current=spawns();for(const row of rows.filter(x=>x.kind==='wrapper'))assert.ok(current.some(x=>x.kind==='closed'&&x.pid===row.pid),'retained wrapper handle must close before phase returns')}
function code(fn){try{fn();return 'PASS'}catch(e){return e.code}}
test('native phase keeps three check/mutation steps and uses one exited helper',native,t=>{
 const base=path.join(os.tmpdir(),'fleet-phase-order-'+require('node:crypto').randomUUID());t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 security.check('create',base);phaseRoot=base;const root=path.join(base,'private'),before=spawns().length,trace=[];
 phase(()=>{trace.push('create');security.check('create',root);trace.push('write');fs.writeFileSync(path.join(root,'entry'),'synthetic');trace.push('inspect');security.check('inspect',root);trace.push('read');assert.equal(fs.readFileSync(path.join(root,'entry'),'utf8'),'synthetic');trace.push('file');security.check('file',path.join(root,'entry'));trace.push('done')});
 assert.deepEqual(trace,['create','write','inspect','read','file','done']);assert.equal(fs.existsSync(path.join(base,'security-phase-jobs')),false,'phase must not create token registration files');const rows=spawns().slice(before);assert.equal(rows.filter(x=>x.kind==='security-helper').length,1,'N=3 security checks in this phase must use one security-helper subprocess');gone(rows);
});
test('native pass, denied ACL and owner mismatch equal fresh one-shot verdicts; denial stops before mutation',native,t=>{
 const base=path.join(os.tmpdir(),'fleet-phase-verdict-'+require('node:crypto').randomUUID());t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 security.check('create',base);phaseRoot=base;const good=path.join(base,'good'),deny=path.join(base,'deny'),mismatch=path.join(base,'owner');
 for(const dir of [good,deny,mismatch])security.check('create',dir);
 const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const script="$ErrorActionPreference='Stop';$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;$a=[IO.Directory]::GetAccessControl($r.deny);$sid=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow);$null=$a.AddAccessRule($rule);[IO.Directory]::SetAccessControl($r.deny,$a);$a=[IO.Directory]::GetAccessControl($r.owner);$a.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')));[IO.Directory]::SetAccessControl($r.owner,$a)";
 const changed=cp.spawnSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({deny,owner:mismatch}),encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(changed.status,0,changed.stderr);
 const expected=[good,deny,mismatch].map(dir=>code(()=>security.check('inspect',dir)));
 const from=spawns().length;const actual=phase(()=>[good,deny,mismatch].map(dir=>code(()=>security.check('inspect',dir))));closedJobs(spawns().slice(from));
 assert.deepEqual(expected,['PASS','HOST_STATE_UNSAFE','HOST_STATE_UNSAFE']);assert.deepEqual(actual,expected);
 function run(wrap){const start=spawns().length,trace=[];let failure;try{wrap(()=>{for(const dir of [good,deny,mismatch]){trace.push('check:'+path.basename(dir));security.check('inspect',dir);trace.push('mutation:'+path.basename(dir))}})}catch(e){failure=e.code}closedJobs(spawns().slice(start));return{trace,failure}}
 assert.deepEqual(run(phase),run(fn=>fn()));
});
test('forced Node startup-owner termination closes the Job and every helper descendant',native,async t=>{
 const root=path.join(os.tmpdir(),'fleet-phase-kill-'+require('node:crypto').randomUUID());security.check('create',root);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const before=spawns().length,child=cp.spawn(process.execPath,[path.join(__dirname,'fixtures/windows-security-phase-owner.cjs')],{env:{...process.env,FLEET_PACKAGED_ENGINE:engine,SECURITY_PHASE_RECORDS:path.join(root,'jobs')},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='',error='';child.stderr.on('data',x=>error+=x);const receipt=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('phase helper did not become ready: '+error)),30000);child.once('error',reject);child.once('exit',()=>{if(!output.includes('\n'))reject(Error('owner exited early: '+error))});child.stdout.on('data',x=>{output+=x;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]))}})});
 t.after(()=>{try{child.kill('SIGKILL')}catch{}});const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGKILL');await closed;
 const pids=[receipt.helper,receipt.descendant,...spawns().slice(before).map(x=>x.pid)];
 const deadline=Date.now()+8000;while(Date.now()<deadline){if(pids.every(pid=>{try{process.kill(pid,0);return false}catch(e){if(e.code==='ESRCH')return true;throw e}}))return;await new Promise(resolve=>setTimeout(resolve,25))}
 gone(pids.map(pid=>({pid})));
});
