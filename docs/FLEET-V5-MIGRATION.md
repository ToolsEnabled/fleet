# Private V4 to V5 import and rollback

The owning lead qualifies and pins the candidate first. No live hub, registration, shared install or account is changed by this procedure's rehearsal. Import is currently qualified on Linux only, even though the distribution also builds a Windows archive.

Use Fleet controls to pause the source workers, retain current revisions and asks, finish in-flight work, close direct clients, and stop each owning V4 hub. Only the owning lead quiesces a real hub. A shared root with an excluded or still-running cohort cannot be imported. Process checks supplement that coordination; they cannot exclude unmanaged exterior writers.

From the verified candidate:

```sh
node verify.cjs
node "$CANDIDATE_RUNTIME/bin/fleetV5.js" import-v4 \
  --source-state-root "$SOURCE_STATE" --state-root "$NEW_V5_STATE"
node "$CANDIDATE_RUNTIME/bin/fleetV5.js" status --state-root "$NEW_V5_STATE" --actor "$LEAD_ACTOR"
```

Both roots must be physical, private paths owned by the operator. The destination is a new absolute directory outside the source and runtime. The source stays byte-exact, including configuration, signing material and SQLite companions. Read-only snapshots are supported. The importer reads databases through disposable copies, retains originals in `v4-import-originals`, and preserves tasks, revisions, asks, rules, queues, memory, reports, assessments, thread IDs, inboxes, settings, opaque files, live metrics and archived cold history. Destination machine records are resealed for the new runtime with the preserved machine identity.

Transient node processes and session IDs are detached in the destination; running/starting nodes become stopped. Import starts zero workers. Source process records, unsafe links, existing/overlapping destinations, wrong generations, unresolved byte publications and source changes refuse. The destination host configuration is published last, after copying, comparison and fsync. A failed destination remains unactivated; inspect it and use a new destination rather than overwriting it.

Review imported tasks and outcomes before changing MCP registration to `fleetV5 serve`. Keep provider sign-ins, account routing, actor, tree key and conversations. Start the destination hub and explicitly resume selected work through Fleet. A reported completion and a lead assessment remain separate. An unknown external effect must be reconciled rather than retried.

Rollback means retaining or returning to the old V4 runtime and untouched source root. Quiesce V5 first and preserve its new results, conversations and destination root. Reconcile workspace effects and later V5 work against the old tasks before any V4 resume. Returning to the source does not merge later results, undo file edits or reverse external effects. There is no automatic reverse import or replay.

Temporary rehearsal roots holding signing keys must be removed after checks. A busy real root is never stopped by the rehearsal: use a fresh synthetic V4 installation populated with a consistent copied tree database's real records, and freeze that synthetic source before import. Such a rehearsal is labelled synthetic-with-real-records, not a live cutover or full-root real snapshot.
