'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readCodexCustody, createAccountService } = require('../src/lib/fleet-v3-accounts');

const account = 'fixture-account';
const model = 'fixture-model';
const route = { provider: 'codex', account, admission: 'ordinary-work', model };
const meta = { email: 'support@toolsenabled.ai', workspaceId: 'fixture-workspace', planType: 'fixture-plan', creditsAllowed: false };
const secret = 'fixture-access-only-secret';
function fixture(t) {
  const base = path.resolve(__dirname, '../dist/release-kit/custody-tests');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'custody-config.json');
  const record = path.join(root, 'called.json');
  const responseFile = path.join(root, 'response.json');
  const config = { version: 1, host: 'custody.example.invalid', adapter: '/fixture/adapter.py', store: '/fixture/store' };
  fs.writeFileSync(file, JSON.stringify(config));
  const attestation = { version: 1, ...meta, account, status: 'ok', singleHolder: true, observedAtMs: Date.now() };
  fs.writeFileSync(responseFile, JSON.stringify(attestation));
  fs.writeFileSync(path.join(root, 'ssh'), `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(process.env.RECORD, JSON.stringify({ args: process.argv.slice(2), pid: process.pid }));
if (process.env.SSH_MODE === 'hang') setInterval(() => {}, 1000);
else if (process.env.SSH_MODE === 'failed' || process.env.SSH_MODE === 'timeout') {
  process.stderr.write((process.env.SSH_MODE === 'timeout' ? 'Connection timed out ' : 'Permission denied ') + '${secret}');
  process.exit(255);
} else {
  process.stdout.write(fs.readFileSync(process.env.RESPONSE_FILE));
  process.exitCode = process.env.SSH_MODE === 'refused-exit' ? 1 : 0;
}
`, { mode: 0o700 });
  const home = path.join(root, 'accounts/codex', account);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const auth = { auth_mode: 'chatgpt', tokens: { access_token: secret, id_token: 'fixture-id-secret', account_id: meta.workspaceId } };
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth), { mode: 0o600 });
  fs.writeFileSync(path.join(home, '.telogins-identity.json'), JSON.stringify(meta));
  const env = { PATH: root, RECORD: record, RESPONSE_FILE: responseFile,
    TELOGINS_CODEX_CUSTODY_CONFIG: file, TELOGINS_CODEX_CUSTODY_HOST: config.host,
    TELOGINS_ACCOUNTS_ROOT: path.join(root, 'accounts') };
  const usage = { email: meta.email, plan_type: meta.planType,
    rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 3600, reset_at: Date.now() / 1000 + 3600 } },
    credits: { has_credits: false, unlimited: false } };
  const policy = { planType: meta.planType, creditsAllowed: false };
  const service = { overrides: [], EXPECTED_IDENTITIES: { codex: { [account]: meta.email } }, resolveAccountsRoot: () => undefined,
    codexUsageUrl: 'https://fixture.invalid/usage',
    fetchCodexUsage: async (tokens, fetchImpl) => ({ ...(await (await fetchImpl('https://fixture.invalid/usage', {})).json()), outcome: 'ok' }),
    authorizeCodexLaunch: async (id, selectedHome, policyFile, { readUsage }) => {
      assert.equal(id, account); assert.equal(selectedHome, home);
      await readUsage(auth.tokens);
      return { model, policy, admission: {} };
    },
    pinCodexArguments: () => ({ args: ['app-server'] }), checkedCatalog() {}, guardedCodexRequest() {},
  };
  const accounts = createAccountService({ env, loadService: async () => service, readCatalog: async () => ({}),
    fetchImpl: async () => new Response(JSON.stringify(usage)) });
  return { root, file, config, record, responseFile, env, home, attestation, policy, usage, accounts, service,
    respond(value) { fs.writeFileSync(responseFile, JSON.stringify(value)); } };
}
function diagnostic(code, reason, message) {
  return error => {
    assert.equal(error.code, code); assert.equal(error.reason, reason); assert.match(error.message, message);
    assert.doesNotMatch(error.message, /fixture-access-only-secret|fixture-id-secret|fixture-remote-secret|fixture-password|fixture-api-secret/);
    assert.equal(Object.hasOwn(error, 'stdout'), false); assert.equal(Object.hasOwn(error, 'stderr'), false);
    return true;
  };
}
const unavailable = (reason, message) => diagnostic('FLEET_ACCOUNT_CUSTODY_UNAVAILABLE', reason, message);

for (const [name, change, reason, message] of [
  ['config variable missing', f => delete f.env.TELOGINS_CODEX_CUSTODY_CONFIG, 'CUSTODY_CONFIG_MISSING', /TELOGINS_CODEX_CUSTODY_CONFIG is missing; set/],
  ['config path relative', f => { f.env.TELOGINS_CODEX_CUSTODY_CONFIG = 'relative.json'; }, 'CUSTODY_CONFIG_INVALID', /absolute configuration path/],
  ['config file missing', f => fs.unlinkSync(f.file), 'CUSTODY_CONFIG_UNREADABLE', /unreadable; restore the file and its read permissions/],
  ['config unreadable directory', f => { f.env.TELOGINS_CODEX_CUSTODY_CONFIG = f.root; }, 'CUSTODY_CONFIG_UNREADABLE', /unreadable/],
  ['config invalid JSON', f => fs.writeFileSync(f.file, secret), 'CUSTODY_CONFIG_INVALID', /not valid JSON; repair/],
  ['config null', f => fs.writeFileSync(f.file, 'null'), 'CUSTODY_CONFIG_INVALID', /require version 1/],
  ['config invalid schema', f => fs.writeFileSync(f.file, JSON.stringify({ ...f.config, adapter: 123 })), 'CUSTODY_CONFIG_INVALID', /absolute adapter and store paths/],
  ['config wrong version', f => fs.writeFileSync(f.file, JSON.stringify({ ...f.config, version: 2 })), 'CUSTODY_CONFIG_INVALID', /require version 1/],
  ['host pin missing', f => delete f.env.TELOGINS_CODEX_CUSTODY_HOST, 'CUSTODY_HOST_PIN_MISSING', /TELOGINS_CODEX_CUSTODY_HOST is missing; set it to exactly the config's host field/],
  ['host pin changed', f => { f.env.TELOGINS_CODEX_CUSTODY_HOST = 'other.example.invalid'; }, 'CUSTODY_HOST_PIN_MISMATCH', /differs from the config's host field; verify/],
]) test(`custody ${name} names the cause and refuses before SSH`, async t => {
  const f = fixture(t); change(f);
  await assert.rejects(readCodexCustody(account, f.env), unavailable(reason, message));
  await assert.rejects(f.accounts.validate(route), unavailable(reason, message));
  assert.equal(fs.existsSync(f.record), false);
});

for (const root of [undefined, 'relative', '/fixture/nonexistent-accounts-root'])
  test(`custody accounts root ${root ?? 'unset'} names the repair before SSH`, async t => {
    const f = fixture(t); f.env.TELOGINS_ACCOUNTS_ROOT = root;
    await assert.rejects(f.accounts.validate(route), diagnostic('FLEET_ACCOUNT_HOME_INVALID', 'ACCOUNTS_ROOT_MISSING', /TELOGINS_ACCOUNTS_ROOT/));
    assert.equal(fs.existsSync(f.record), false);
  });

for (const [mode, reason, message] of [
  ['failed', 'CUSTODY_SSH_FAILED', /SSH.*failed; check host connectivity, SSH authentication/],
  ['timeout', 'CUSTODY_SSH_TIMEOUT', /SSH.*timed out; restore host connectivity/],
]) test(`custody SSH ${mode} is distinct and never exposes process output`, async t => {
  const f = fixture(t); f.env.SSH_MODE = mode;
  await assert.rejects(readCodexCustody(account, f.env), unavailable(reason, message));
  await assert.rejects(f.accounts.validate(route), unavailable(reason, message));
  assert.ok(fs.existsSync(f.record));
});

test('custody bounds a hung SSH command and reaps the process', async t => {
  const f = fixture(t); f.env.SSH_MODE = 'hang';
  await assert.rejects(f.accounts.validate(route), unavailable('CUSTODY_SSH_TIMEOUT', /timed out/));
  const { pid } = JSON.parse(fs.readFileSync(f.record));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('custody malformed service response names the response repair', async t => {
  const f = fixture(t); fs.writeFileSync(f.responseFile, secret);
  await assert.rejects(f.accounts.validate(route), unavailable('CUSTODY_RESPONSE_INVALID', /returned invalid JSON; repair/));
});

for (const mode of [undefined, 'refused-exit']) test(`custody answered refusal preserves its safe reason (exit ${mode ? 1 : 0})`, async t => {
  const f = fixture(t); f.env.SSH_MODE = mode;
  f.respond({ status: 'refused', reason: 'Canonical refresh holder is not registered.' });
  await assert.rejects(f.accounts.validate(route), diagnostic('FLEET_ACCOUNT_CUSTODY_INVALID', 'ATTESTATION_REFUSED', /answered but refused attestation: Canonical refresh holder is not registered\. Repair/));
});

test('custody refusal reason redacts local, remote and credential-shaped values', async t => {
  const f = fixture(t);
  const githubFixtureToken = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz12345';
  f.respond({ status: 'refused', refresh_token: 'fixture-redacted',
    reason: `Holder missing: ${secret}, fixture-id-secret, fixture-remote-secret; password=fixture-password; Bearer fixture-api-secret; password="fixture-redacted"; ${githubFixtureToken}; sk-fixturekey; eyJfixture.e30.signature` });
  await assert.rejects(f.accounts.validate(route), error => {
    diagnostic('FLEET_ACCOUNT_CUSTODY_INVALID', 'ATTESTATION_REFUSED', /Holder missing: \[redacted\]/)(error);
    assert.doesNotMatch(error.message, /sk-fixturekey|eyJfixture|two words hidden/);
    assert.equal(error.message.includes(githubFixtureToken), false);
    return true;
  });
});

test('custody non-attestation JSON keeps the invalid-attestation guard', async t => {
  const f = fixture(t); f.respond(null);
  await assert.rejects(f.accounts.validate(route), diagnostic('FLEET_ACCOUNT_CUSTODY_INVALID', 'ATTESTATION_INVALID', /must all agree; repair/));
});

test('custody success uses the pinned host and read-only command; pre-thread rechecks preserve diagnostics', async t => {
  const f = fixture(t);
  assert.equal((await readCodexCustody(account, f.env)).status, 'ok');
  const { args } = JSON.parse(fs.readFileSync(f.record));
  assert.equal(args.at(-2), f.config.host);
  assert.match(args.at(-1), /'custody' 'fixture-account'/);
  assert.deepEqual(args.slice(0, 4), ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']);
  const prepared = await f.accounts.launch(route, { model });
  const beforeThread = () => prepared.codex.beforeThread({ readAccountCatalog: async () => ({}) });
  assert.equal((await beforeThread()).account, account);
  delete f.env.TELOGINS_CODEX_CUSTODY_HOST;
  await assert.rejects(beforeThread(), unavailable('CUSTODY_HOST_PIN_MISSING', /TELOGINS_CODEX_CUSTODY_HOST/));
  f.env.TELOGINS_CODEX_CUSTODY_HOST = f.config.host;
  f.respond({ status: 'refused', reason: 'Holder stopped before thread admission.' });
  await assert.rejects(beforeThread(), diagnostic('FLEET_ACCOUNT_CUSTODY_INVALID', 'ATTESTATION_REFUSED', /Holder stopped before thread admission/));
});

for (const target of ['custody', 'identity', 'provider', 'unknown', 'policy'])
  test(`custody spending ${target} is observation only`, async t => {
    const f = fixture(t);
    if (target === 'custody') f.respond({ ...f.attestation, creditsAllowed: true });
    if (target === 'identity') fs.writeFileSync(path.join(f.home, '.telogins-identity.json'), JSON.stringify({ ...meta, creditsAllowed: true }));
    if (target === 'provider') f.usage.credits.has_credits = true;
    if (target === 'unknown') f.usage.credits = null;
    if (target === 'policy') f.policy.creditsAllowed = true;
    assert.equal((await f.accounts.validate(route)).account, account);
  });


test('custody accounts-root resolver failure names the repair without forwarding exceptions', async t => {
  const f = fixture(t); delete f.env.TELOGINS_ACCOUNTS_ROOT;
  f.service.resolveAccountsRoot = () => { throw Error(secret); };
  await assert.rejects(f.accounts.validate(route), diagnostic('FLEET_ACCOUNT_HOME_INVALID', 'ACCOUNTS_ROOT_MISSING', /accounts root could not be resolved; set TELOGINS_ACCOUNTS_ROOT/));
  assert.equal(fs.existsSync(f.record), false);
});

test('custody arbitrary reader exceptions cannot spoof safe diagnostics or expose secrets', async t => {
  const f = fixture(t);
  const accounts = createAccountService({ env: f.env, loadService: async () => f.service,
    readCustody: async () => { throw Object.assign(Error(secret), { code: 'FLEET_ACCOUNT_CUSTODY_UNAVAILABLE', reason: secret }); } });
  await assert.rejects(accounts.validate(route), unavailable('CUSTODY_READ_FAILED', /check the configured custody adapter/));
});

test('custody single-holder refusal includes the service reason while keeping its guard', async t => {
  const f = fixture(t);
  f.respond({ ...f.attestation, singleHolder: false, reason: 'More than one refresh holder registered.' });
  await assert.rejects(f.accounts.validate(route), diagnostic('FLEET_ACCOUNT_CUSTODY_INVALID', 'ATTESTATION_REFUSED', /More than one refresh holder registered/));
});

test('custody pre-thread credit permission does not prevent the selected account from working', async t => {
  const f = fixture(t);
  const prepared = await f.accounts.launch(route, { model });
  f.respond({ ...f.attestation, creditsAllowed: true });
  assert.equal((await prepared.codex.beforeThread({ readAccountCatalog: async () => ({}) })).account, account);
});
