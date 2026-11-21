# Retained structural index experiment

Use the opt-in Vitest configuration in this directory. It makes the **admission planner** read a retained structural index and updates the working view when the op reducer accepts a batch. Broad replacements, unsupported updates, fallback writes, state replacement, queue rollback and non-outcome engine mutations invalidate the cache. The cache also checks draw, event and tournament-record identity. All hooks run through the experimental Vitest transform.

The correctness test compares planner decisions, returned results, complete record hashes and ordered subscription payloads on singles and TEAM draws. It exercises a schedule write, a score, an exit correction, a failed queue with rollback and state replacement. The E2 trace arm additionally hashes the ordered plans, four outcome notice topics, result and record at every accepted workload step. Run timing separately so hashing and subscription overhead stay outside the timing evidence.

```sh
export TZ=UTC OUTCOME_PIPELINE=v2
PLANNER_INDEX_VERIFY=1 pnpm exec vitest run --config scripts/ext/outcomePlannerIndex.config.mts src/tests/mutations/exitPropagation/outcomePlannerIndex.test.ts

for planner in fresh retained; do
  for size in standard large; do
    large=''
    if [ "$size" = large ]; then large=1; fi
    PLANNER_INDEX="$planner" PLANNER_INDEX_TRACE=1 OUTCOME_EXTERNAL_LARGE_TEAM="$large" OUTCOME_EXTERNAL_COST_JSON="/tmp/trace-$planner-$size.json" pnpm exec vitest run --maxWorkers=1 --config scripts/ext/outcomePlannerIndex.config.mts src/tests/mutations/exitPropagation/outcomePlannerCost.test.ts
  done
done
node scripts/ext/summarizePlannerPilot.mjs /tmp/trace-fresh-standard.json /tmp/trace-retained-standard.json
node scripts/ext/summarizePlannerPilot.mjs /tmp/trace-fresh-large.json /tmp/trace-retained-large.json
```

For timing, repeat the workload loop with the trace variable unset and a different output prefix, on an otherwise quiet host. Mutation time sums the duration of `setMatchUpStatus` calls for each draw. Traversal includes finding the next playable matchUp. Three seeds per cell describe the measured runs and are too few for a savings estimate. Direct external writes to borrowed records and asynchronous concurrency remain outside this prototype’s coverage.
