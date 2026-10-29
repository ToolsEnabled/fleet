# Fleet V5 5.0.0-alpha.13

Internal development candidate. No publication or shared-runtime activation is authorized by this package.

Fleet V5 adds a contract-facing execution service to the retained Fleet lifecycle. Node.js 22.19 or newer is required. Linux and Windows x64 archives carry the same reviewed standalone source; a Windows-target archive built on Linux is a packaging check, not native Windows execution qualification.

Verify the extracted archive before setup:

```sh
node verify.cjs
node runtime/bin/fleetV5.js setup --workspace ABS --state-root NEW_ABS --actor PROVIDER
node runtime/bin/fleetV5.js status --state-root NEW_ABS --actor PROVIDER
```

The default root is `~/.fleetV5`. Setup requires fresh state and inherits the launching environment. Explicit folder scope remains available for existing operator workflows. Generation 5 uses transactional SQLite tree storage. Older entries refuse V5 state; the V5 entry refuses earlier state. Same-generation `rebind` never imports earlier state.

The V5 lead surface includes six execution lifecycle tools: `fleet.contract.options`, `fleet.contract.submit`, `fleet.contract.inspect`, `fleet.contract.answer`, `fleet.contract.amend`, and `fleet.contract.cancel`. It also advertises `fleet.contract.review` for draft feedback, `fleet.contract.library` for snippet discovery, and `fleet.contract.determinacy` for post-completion omission checks. Ordinary V5 serve requires a setup with workers enabled; workers-off ordinary connections refuse with `FLEET_V5_WORKERS_REQUIRED` instead of starting with an empty tool catalog. With workers enabled, use explicit `serve --admin` or `call --admin` for native control and inspection. Workers-off setup remains available for explicit administrative maintenance, including `serve --admin --ledger-only`. Interior workers retain native Fleet tools and their scoped task authority. V4 surfaces remain unchanged. Both direct and detached-hub connections apply the selected surface. See the lane report for the local qualification results.

```sh
node runtime/bin/fleetV5.js serve --state-root ABS --actor PROVIDER
node runtime/bin/fleetV5.js serve --state-root ABS --actor PROVIDER --admin
node runtime/bin/fleetV5.js hub start --state-root ABS --actor PROVIDER
node runtime/bin/fleetV5.js serve --attach --state-root ABS --actor PROVIDER
node runtime/bin/fleetV5.js call --admin --state-root ABS --actor PROVIDER fleet.control '{"action":"read"}'
```

Accounts stay with their native provider and Telogins custody. This package neither registers logins nor copies provider credentials or histories. Usage, exhaustion, and credit observations never block an otherwise valid provider route; unavailable measurements remain unknown, and provider refusals remain visible. An explicitly selected account takes precedence over incidental inherited API keys, which are withheld from that account's worker and catalog environments. An explicitly selected API-key route uses the provider environment without claiming subscription account identity; key values are not retained in metadata, logs, or arguments. Requested models still require current native provider catalog support. Startup and completion balances are shared-account snapshots, not inferred per-trial charges. Failed turns settle as failed or paused and require explicit resume; ambiguous submissions are not replayed. This setup does not create accounts, write grants, or change credentials. Contract selection, preparation, resume admission and verified-versus-reported outcomes remain the core service's responsibility. Fleet's enclosing gateway, when present, is TEAA; its packaging and website have separate ownership.

Codex account-home credentials must be regular files in the canonical selected home. POSIX systems enforce private file mode and process ownership; Windows uses the existing NTFS owner, private ACL, link-count, and reparse-point checks. Invalid account-home path layouts retain an explicit path refusal.

For state transfer use the [V4 import and rollback procedure](FLEET-V5-MIGRATION.md).
