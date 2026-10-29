'use strict';
const path=require('node:path');
const {session}=require('../../src/lib/windows-security-phase');
const helper=session({command:process.execPath,args:[path.join(__dirname,'windows-security-helper.cjs'),process.argv[2]]});
helper.request(JSON.stringify({path:'pass'}));helper.close();process.stdout.write('closed\n');
