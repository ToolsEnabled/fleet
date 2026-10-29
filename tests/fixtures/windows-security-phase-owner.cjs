'use strict';
const path=require('node:path');
const {session}=require(path.join(process.env.FLEET_PACKAGED_ENGINE,'src/lib/windows-security-phase'));
const client=session({command:process.execPath,args:[path.join(__dirname,'windows-security-job-tree.cjs')],recordDirectory:process.env.SECURITY_PHASE_RECORDS});
const evidence=JSON.parse(client.request('{}').stdout);
process.stdout.write(JSON.stringify(evidence)+'\n');
// Simulates the Node owner killed while still inside its synchronous phase.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
