'use strict';
const fs = require('node:fs');
fs.appendFileSync(process.argv[2], JSON.stringify({pid:process.pid})+'\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const r = JSON.parse(line);
  if (r.path.endsWith('hang')) return;
  if (r.path.endsWith('crash')) return process.exit(1);
  if (r.path.endsWith('protocol')) return process.stdout.write('invalid\n');
  const evidence = { ok: !r.path.endsWith('deny'), fileSystem:'NTFS', fixedDrive:true,
    ownedByUser:!r.path.endsWith('owner-mismatch'), ownerTrusted:true, private:true, writeRestricted:true };
  process.stdout.write(JSON.stringify(evidence)+'\n');
});
