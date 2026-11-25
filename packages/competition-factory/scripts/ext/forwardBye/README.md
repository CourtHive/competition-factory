# Forward BYE provider parity

The stock query-mirror replay on Factory `ba2f42cbf0` admitted all 106 sealed positives with zero calls to the legacy writer, whole recorder or nested recorder. All 16 negatives called the whole recorder and writer once, as on `3ff57de8a6`. Both detached revisions passed the original 122-input control in V1, V2 and differential with the recorder toggled each way. Stored identities, both landings, subscriber delivery and material results matched the historical V1 observations in every mode. All 732 candidate stacks were arrays. On 212 rows the diagnostic stack moved from key position 1 to 2 and its contents differed. [Stock control](stock-control.json)

## Provider observations

Each cell counts V2 provider entries across the 106 positives per revision. The complete replay also checked all 16 controls in each environment and repeated each pair in differential mode. All **1,464 pairs** matched on the ordered methods and draft scope, immediate argument and return observations, enqueue payload with the stored graph at entry, retained argument and return references at completion, listener deliveries, source clock reads, material result and final delivery scope. The historical mirror remained installed in the original control. The supplemental probes forwarded calls to the installed provider methods. [Paired receipt](receipt.json) · [Probe](providerReplay.mjs)

| Environment                                         | Recorded entries | Native entries | Draft enqueues, each revision | Live enqueues, each revision |
| --------------------------------------------------- | ---------------: | -------------: | ----------------------------: | ---------------------------: |
| Stock query mirror                                  |           13,798 |         13,798 |                           830 |                          574 |
| Production sync                                     |           13,600 |         13,600 |                           830 |                          574 |
| Custom sync with external append-only log           |           13,600 |         13,600 |                           830 |                          574 |
| Async request provider, historical entry            |           12,815 |         12,815 |                           830 |                          574 |
| Async engine with request-local provider            |           12,815 |         12,815 |                           830 |                          574 |
| Custom sync reading the lazy payload inside enqueue |           13,600 |         13,600 |                           830 |                          574 |

In each async arm, public calls returned the first sequence below 60 times and the second 39 times. The seven enclosed calls retained them in their post-flush state three and four times respectively. Both revisions gave the same order. Each request retained its own delivery scope across an event-loop yield and the mutation. The implicit context count stayed constant.

1. `updateInContextMatchUp → modifyMatchUp → modifyDrawDefinition`
2. `updateInContextMatchUp → modifyMatchUp → modifyPositionAssignments → modifyDrawDefinition`

The native plan performs its bounded placement writes on a detached graph under the existing draft and random-source scopes. The installed provider sees those draft attempts. The normal recorded-operation apply path then replays the coalesced notices on the stored graph. That distinction restores the 830 draft callbacks, the 574 live callbacks and the async topic order measured on the recorded baseline. The draw-position inventory now documents the proof's side-keyed map lookup and both static tests pass. [Earlier failing trace and field values](https://github.com/CourtHive/Mentat/pull/320)

The shareable ledger contains 244 V2 rows, one per sealed key and provider for custom sync and the real async engine. Each row carries the two independently computed full observation digests, method entries in execution order, draft flags, enqueue topic, key and payload/record graph digest, ordered topic returns, per-entry digests and terminal scope. Full method arguments, returns and buffer observations are represented by digests in the ledger. The script compares their observed representations before emitting rows. [Ordered ledger](ordered-callbacks.jsonl.gz) · [Comparator](replay.py)

## Reproduction

From a Mentat checkout with the merged sealed-input assessment and a sibling Factory checkout, run the commands below on Button within the assigned focused worker window. The output directory must be fresh. The probe stages only a temporary test in each clean detached Factory revision and uses stock Vitest. The original six-mode control uses Mentat's original replay test and `--stock-config`.

```sh
scripts/worktree.sh add ../factory --detach 3ff57de8a6 --name bye-proof-recorded
scripts/worktree.sh add ../factory --detach ba2f42cbf0 --name bye-proof-native
base=../factory/.worktrees/bye-proof-recorded
native=../factory/.worktrees/bye-proof-native
proof=../factory/.worktrees/r27-bye-provider-contract/packages/competition-factory/scripts/ext/forwardBye
inputs=~/censuses/bye-passage-59c7a5d2d2/exact
out=~/censuses/r27-bye-reproduction
python3 scripts/outcome-v2-runner.py --reserve-workers 1 -- python3 "$proof/replay.py" "$base" "$native" "$inputs" "$out"
for wt in "$base" "$native"
do
  sha=$(git -C "$wt" rev-parse HEAD)
  python3 scripts/outcome-v2-runner.py --reserve-workers 1 -- python3 \
    assessment/2026-11-24-bye-passage-effects/qualification/exact.py \
    "$wt" "$sha" "$out/stock-$sha" "$out/receipt.json" --routing-only --stock-config
done
```

These receipts measure the isolated rank-D change. Application after ranks A, B and C, the non-interposing census, rule 17 suites and rule 22c timing have separate qualification gates.
