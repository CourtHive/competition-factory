# Reproducing the stamped lucky-repeat qualification

Use disposable factory checkouts with installed dependencies. The reference is `0408a87119` and the ownership candidate is `c30a26ef04`. The ordinary suites run against the candidate's own tests. For the paired census use the same reference test workload in both checkouts. The candidate's ownership assertion disables the recorder deliberately, so using that assertion as input to just one census arm would confound the measurement.

## Ordinary suites and recorder-off control

From the candidate checkout:

```sh
for mode in v1 v2 differential; do
  TZ=UTC OUTCOME_PIPELINE="$mode" pnpm exec vitest run --reporter=dot
done
TZ=UTC pnpm exec vitest run src/tests/mutations/outcome/luckyDoubleExit.test.ts
```

The focused repeat tests subscribe to the outcome topics, disable whole-call recording and observe the v1 writer. They assert material result equality and conditional array shape on the public return. They also compare the complete record and ordered notice payloads.

## Paired census

In each disposable arm, place the report's two instrumentation files at their original paths. On the candidate only, put the reference version of `src/tests/mutations/outcome/luckyDoubleExit.test.ts` in the checkout. This gives both arms exactly the same calls, including their explicit pipeline selections. Set `COUNTS` to a separate, empty JSONL file for each arm.

```sh
mkdir -p scripts/ext src/tests/testHarness
git show ext/report:scripts/ext/outcomeCensus.config.mts > scripts/ext/outcomeCensus.config.mts
git show ext/report:src/tests/testHarness/outcomeExternalCensus.ts > src/tests/testHarness/outcomeExternalCensus.ts
TZ=UTC OUTCOME_PIPELINE=v2 OUTCOME_EXTERNAL_CENSUS_JSONL="$COUNTS" pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts --reporter=dot
```

Run `node scripts/ext/summarizeOutcomeCensus.mjs reference="$REFERENCE_COUNTS" candidate="$CANDIDATE_COUNTS"` in the report checkout. Sum each tuple key over all input lines. The evidence records every changed tuple and each arm's total.

## Step replay

The nine supplied JSONL records come from the public test harvest of `luckyDoubleExit.test.ts`. Each selected occurrence matches the census source test, matchUp ID, bare outcome directive and stamped pre-call state. Copies from multiple source modes are deduplicated. Five calls are explicit repeated entries; four come from the 7-, 8- and 12-position walks. The broader status-and-stamp filter also selected equivalent replays and calls with extra wrapper parameters; the nine-record input preserves the exact public directives.

From the candidate checkout, with the local `ext/report` ref available:

```sh
REPLAY_DIR=$(mktemp -d)
git show ext/report:ext-report/followup/v3-1/lucky-repeat-records.jsonl.gz | gzip -dc > "$REPLAY_DIR/moved.jsonl"
git show ext/report:src/tests/corpus/outcomeExternalReplay.test.ts > src/tests/corpus/outcomeExternalReplay.test.ts
TZ=UTC OUTCOME_EXTERNAL_CORPUS="$REPLAY_DIR" OUTCOME_EXTERNAL_REPLAY_JSON="$REPLAY_DIR/summary.json" pnpm exec vitest run src/tests/corpus/outcomeExternalReplay.test.ts
cat "$REPLAY_DIR/summary.json"
```

The report driver restores the recorded clock and RNG, compares every step against its recorded result code and record hash in all three modes, and separately counts mode disagreement. The recorder-off public comparison covers fields and notices outside the replay format.
