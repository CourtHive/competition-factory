import { PREDICTED_CALL } from '@Mutate/matchUps/outcome/settleWork';

type SettleRow = { step: number; site: string; kind: string };

/**
 * S2's HAS-WORK PREDICATES against v1's PER-PASS WRITES, per call (outcome v2 executor plan § 6 S2). Read from the
 * settle telemetry a census step records: `predicted` events (v2, `differential`, a complete plan) and `wrote` events
 * (v1's passes, `SETTLE_PASSES=1`). Counted into `counts` as:
 *  - `s2:predicted-call`: calls a prediction was made for;
 *  - `s2:local`: predicted no work, and v1's passes wrote nothing (a call S2 could own);
 *  - `s2:missed:<site>`: v1's pass wrote where no work was predicted (a predicate too weak; the one that must be 0);
 *  - `s2:over:<site>`: work predicted where v1's pass wrote nothing (a safe abstention);
 *  - `s2:abstained-v1-wrote-nothing`: work predicted for the call, and none of v1's passes wrote.
 */
export function tallySettlePredictions(rows: SettleRow[], counts: Record<string, number>) {
  const bump = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  const steps = new Map<number, { predicted: Set<string>; wrote: Set<string>; called: boolean }>();
  for (const { step, kind, site } of rows) {
    const entry = steps.get(step) ?? { predicted: new Set<string>(), wrote: new Set<string>(), called: false };
    steps.set(step, entry);
    if (kind === 'predicted' && site === PREDICTED_CALL) entry.called = true;
    else if (kind === 'predicted') entry.predicted.add(site);
    else if (kind === 'wrote') entry.wrote.add(site);
  }
  for (const { predicted, wrote, called } of steps.values()) {
    if (!called) continue;
    bump('s2:predicted-call');
    if (!predicted.size && !wrote.size) bump('s2:local');
    if (predicted.size && !wrote.size) bump('s2:abstained-v1-wrote-nothing');
    for (const site of wrote) if (!predicted.has(site)) bump(`s2:missed:${site}`);
    for (const site of predicted) if (!wrote.has(site)) bump(`s2:over:${site}`);
  }
}
