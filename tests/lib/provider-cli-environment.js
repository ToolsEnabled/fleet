'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let active;

// Model discovery can run `grok models` while a test loads the tool registry.
// Keep that incidental discovery off the installed CLI and the person's home.
// Tests exercising Grok itself prepend their own recording command afterwards.
function activate(label = 'provider-cli', { preserveWindowsAccount = false } = {}) {
  if (active) return active;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `fleet-cli-${label}-`)));
  const home = path.join(root, 'home'), bin = path.join(root, 'bin');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'grok'), `#!${process.execPath}\n`
    + "process.stderr.write('Grok is unavailable in this test environment; install a fixture command to exercise it.\\n');process.exit(127);\n", { mode: 0o700 });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.GROK_HOME = path.join(home, '.grok');
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH || ''}`;
  // Provider paths stay in the scratch HOME/USERPROFILE. Native Windows
  // product tests must nevertheless retain the OS principal: their source
  // tree belongs to that real profile, not to the synthetic CLI home.
  // Keep the existing stand-in behavior for tests explicitly exercising it.
  if (!(process.platform === 'win32' && preserveWindowsAccount)) {
    const preload = path.join(root, 'home.cjs');
    fs.writeFileSync(preload, "const os=require('node:os');const original=os.userInfo;os.userInfo=(...args)=>({...original(...args),homedir:process.env.HOME});\n", { mode: 0o600 });
    require(preload);
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`.trim();
  }
  active = Object.freeze({ root, home, bin });
  process.once('exit', () => {
    if (process.env.TOOLSENABLED_TEST_RETAIN_FIXTURES === '1') {
      process.stderr.write(`Provider CLI test environment retained by request: ${root}\n`);
      return;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return active;
}

module.exports = { activate };
