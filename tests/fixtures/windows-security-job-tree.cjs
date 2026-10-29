'use strict';
// A synthetic phase helper with a long-lived descendant, for kernel cleanup.
const cp=require('node:child_process');
const descendant=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
require('node:readline').createInterface({input:process.stdin}).on('line',()=>process.stdout.write(JSON.stringify({ok:true,helper:process.pid,descendant:descendant.pid})+'\n'));
