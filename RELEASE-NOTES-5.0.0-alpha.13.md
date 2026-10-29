# Fleet V5 5.0.0-alpha.13

Linux f(x) study runtime. Build only; this package is not installed.

Build head `69c2d5c2c0b325447b2d6b7e501368eac3cd4f8b` on branch `a13-integrate`. It merges three inputs and then adds the package allowlist entries the merged modules need:

- alpha.12 study runtime `c45b8b7d9398811ed7b4a3c4ecc985af16f6074b`
- task-scoped byte mediation `bd22dff65e2ce1cc5b8f7d27d9a41ecb33664995`
- contract layer `24ea56d2d8a06bdf6a22941cef28bff5c8de085e` (newest `feature/v5-contract-layer` commit whose own 11-file suite passed at build time, 82 passed, 0 failed; the branch tip was re-fetched immediately before the merge commit and was still this commit)

`ab-next` commit `1a7cf3f` is not in this history.

The package builder archives only `installer/fleetV2/SOURCE-ALLOWLIST`. The merged runtime requires `src/lib/file-task-context.js`, `src/lib/fleet-v5-determinacy.js` and `src/lib/fleet-v5-record-parts.js`, and the lead text names `docs/CONTRACT-SNIPPETS.md` and `docs/examples/contract-tasks.json`. Those five paths are on the V2 source list and the V4 and V5 export lists. The alpha.12 release-notes path now sits with the other release-note paths in the V5 export list so that list stays sorted.

## Commits merged into alpha.12

Every commit reachable from the build head and not from alpha.12:

- `c2ea55386b9d5d7146c2dd22ec3db2f8c4fd0dc8` Guide ordinary V5 leads through contracts
- `b797d557747bf1e7666d9341a79313a5f5e77230` E1-E8: contract review layer for Fleet V5
- `13d1ca1bfaae5f210ebd36899e257c90f0a9c004` E3: a leading outcome verb decides the sentence kind
- `d06dad52248ee9c0d9b38af736d92da84e2e027f` C1, C2: snippet catalog and TEBench contract compiler
- `c21214c2f0226e055650f44956fc0b480279507f` C3: submit accepts compose, catalog and reviews
- `fff3117e62735c1084bed6992c230c0f56c51048` C4: the review reads the composition
- `3afbbb8acad1ffdd85ddbe91434cf9258d02cff1` C5: snippet library and ambiguity cost per snippet
- `7cfd0eef8c1332ed5df7b256182694a14e456da2` C5: resolves refusals keep their wording for contracts without compose
- `088425941e58aec88fdb95309552b358a0228938` D1-D4: contract determinacy runs omission mutants in throwaway copies
- `e894f267da88ed59ac628efdb155eac5b552ef0e` D5: determinacy tests in npm test; nothing earlier regresses
- `60900356a98a15f45622c5ab5f5715c5059b0dfe` Review: state-conflict findings between requirement units and checks
- `90dba954356cdb71b2d32030cb29c453fd57d853` Review: "All N checks pass" lines are context covered by every check
- `75fa8ab3148c092c2bbbbd5dd3b46518a36e3c1f` Review: a check id whose words all appear in a unit covers it
- `dcdf2263ee9a94e49f1441a2870813fe17c390de` Review: checks cover outputs and sentences through the files they name
- `f32c14266dfbab8f4eb6d7335d3c8a43873b86ea` Review: requirements are covered by long checks that share their words
- `72071e24cc83bce6342c8136a200fb4ef87b0f5c` Review: checks cover the requirement labels they name
- `9b1114ecd42edc7ae59b849b03e4148999f86bc1` Review: the first sentence of a longer objective is its headline
- `76bab87e439b39eff1e8130587d24ba3e7b2a045` Review: prohibitions are constraints unless a check observes them
- `d65dbd21b4d90eea8bb722d8007490ac940901b6` Review: a passive permission ("X may be deleted") is a choice
- `48c6a1b3f817d08a8bdaa4518ce6935031e8da58` Review: directives in a method section are process constraints
- `2ef23c50b32b8e6df90bf2b5cb1ec8e73723dd77` Review: byte quantities match by value; lead rules are not inferred covered
- `32ff57125291bb39e4b837cc1fe1064441724342` Review: text that calls itself "this choice" is a choice
- `6ed645cc8ba8998073a6a10af5bbda00ed79704d` Review: a rule takes its kind from its first sentence
- `9906badf7855a6bff1393a0805753631d05992cd` T1, T2: task snippets compile to tasks with completion checks and intentions
- `9973f663d6abea8e061f7cc6c9d710249773a4f6` Review: a vague adjective used as a verb is not vague wording
- `56d689ddcd9dbfea06c123ce90ecaa1d0fdd7d32` Review: a check that names an output's file type covers it
- `f2495ee1234f192891208eef98d28c372d6ecce7` Review: a sentence that is mostly quotation is context
- `0650d411a02edd67b376d79b8e74443957726ada` Review: tidy the precision helpers (no behavior change)
- `f53c6694e4598ad0a9259c9a3325e87181b8f5f1` T3: one Fleet work item per task snippet
- `7071315408ac2e661062924701378f2561ad85d5` T4: the review reads tasks
- `612010eec5deb698c133fe9005b553b19642c694` T5: the after view lists each task from its work item
- `3bba6a3daec34c0041b6cf61cca54e1a42588cbf` T6: leads are told to write contracts as task snippets
- `4fe612c6aeecf09cb85b090d8aa6b107828b119f` Task 1: merge review-precision (0650d41) into feature/v5-contract-layer (3bba6a3)
- `7d5d4032e611e461c2b020020d0b5655f63f865f` Task 2: review the sentences inside each task snippet one by one
- `ceb942b8e3991eec645a42efdbb5980b47131981` Task 3: keep a completion check's timeoutSeconds through compile and submit
- `8d5044050c7a6182d954eab62892e24ab1edacd4` Task 4: keep each stored contract record under Fleet's 32 KB value limit
- `96cf480ae6409e965240cc638d732ccbf11ba7e5` Task 4: keep the record under 32 KB as reports, asks and events grow it
- `ebf83fea1aa5ef0300e7e9215224f200144960c9` Task 5: count a task's open points by the units they are on
- `cd8ee10964fd309d9becd9b47b6aca92e65cf57d` Task 1: report state conflicts inside task snippets
- `1ef8643ddb2c18b1f7000ff459234e932e8f034a` Task 1: recognize a done line that only says the checks pass
- `24ea56d2d8a06bdf6a22941cef28bff5c8de085e` Task 2: give each done-line behavior its own path in ALL_CHECKS
- `bd22dff65e2ce1cc5b8f7d27d9a41ecb33664995` Validate Fleet V5 file dependencies within durable task scopes
- `637f5ee8430312501d81eafb3d0e5546962aa722` Merge byte mediation bd22dff into the alpha.12 study runtime
- `18c8ba46f9615d9f2e907e4fe84d63e88b6739d6` Merge contract layer 24ea56d into the alpha.12 study runtime
- `69c2d5c2c0b325447b2d6b7e501368eac3cd4f8b` Ship the merged byte and contract modules in the package allowlists

## Alpha.12 commits retained

Every commit from alpha.10 `6333e37943b56966ca87f1f41055e65afda162fd` through alpha.12, already in the alpha.12 package:

- `294b717520ce295e94de81648d8b337d97a285a4` Return a compact provider summary from fleet.contract.options
- `8051621fa75d0948b1390f970b1e2be5e793d6b8` Record Grok ACP prompt usage on each turn.
- `15681622b95dbb855690879b07190641bfc56028` Give delegated worker roots agent.spawn and omit the unused V5 lead manual.
- `517ec08382f27c6ee11cde66574b5ec7725c588f` Let a contract member's agent.spawn child inherit the parent's contract identity.
- `136a6bd5940455ad6b838ebba5617e4da2889d5a` Keep the contract revision when inspect finds no state change.
- `6d618adc1d2cbabeb851280326773575b1cd92d6` Release the tree slot of an idle worker whose contract task is completed
- `41ff697ddc81238536950244a03ac8939bf22a7e` Report an inherited worker's provider config directory from its own process environment.
- `932aa2011235cf998f6d92e424034be9dab44b15` Let fleet.contract.inspect wait for a contract change with sinceRevision and waitMs.
- `f1a1839446892e5d0103165b91f2fc1fb36c00d6` Pin which finished-turn usage counts as complete: non-Claude yes; Claude, partial, running, missing no.
- `91083595892d02dfe3cfda51c040f377108e6de0` Return configuration rows from fleet.contract.options when a request is supplied
- `54d1e8f564b0e640a889eae72498946da4385586` Certify Claude usage complete only once its session is retired with no late callback.
- `66e7573c9bcc9ce6b55b10cfce3861f82a61d05c` Let fleet.contract.amend keep contracts whose retained record outgrows one memory value
- `c45b8b7d9398811ed7b4a3c4ecc985af16f6074b` Prepare Fleet V5 alpha12 identity for the Linux study runtime

The release build adds one identity commit after these notes. `BUILD-RECEIPT.json` records that commit.
