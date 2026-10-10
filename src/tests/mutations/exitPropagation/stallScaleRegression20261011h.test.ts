import { stallsAfterSchedule } from '@Tests/testHarness/exitPropagation/stallCount';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * THE EIGHTH AT-SCALE RUN'S STALLING SEEDS, replayed — a ratchet that may only shrink.
 *
 * 2026-10-11, the first census from a `dev` on which `STALLED_POSITION` was already an `error` (#5351; `dev`
 * b679437145, seeds 20,260,001–20,300,000, 40,000 per arm, 24 workers): **off 1, on 0, policy-off 1** — the first
 * default-arm stall in 120,000 scenarios. Both shapes need a double exit landing LATE beside a carrier or a reservation,
 * which the frozen census arms had never produced:
 *
 *  - 20267598 FEED_IN_CHAMPIONSHIP_TO_SF 16/15 (off): a carry written past a late BYE named the BYE matchUp as its
 *    source, so a dissolved convergence's winner was never re-advanced — #5353 (`aLateByesCarryNamesItsOrigin`);
 *  - 20278127 FIRST_MATCH_LOSER_CONSOLATION 16/16 (policy-off): a RULE 2 reservation that had crossed a BYE into a
 *    PENDING exit stayed when its exit was withdrawn — #5354 (`aReservationGoesPastTheByeItCrossed`).
 *
 * Each seed replays in the arm it was found in, from the schedule EMITTED IN THAT ARM; a `policyoff` line carries the
 * `policyDefinitions` it was emitted under, and the replay attaches them. The planning record is
 * `Mentat/planning/STALLED_POSITION_AT_SCALE.md`.
 *
 * ## OPEN — the seeds that still stall, by arm
 *
 * The set of stalling seeds must EQUAL this list. A new stall fails; so does a seed that stops stalling, until its
 * entry is removed here — the list only shrinks, and a fix records itself by deleting a line.
 */
const OPEN = new Set<string>([]);

type Arm = 'off' | 'on' | 'policyoff';
type Instance = { arm: Arm; seed: number; config: any; steps: any[]; policyDefinitions?: any };

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/stallScaleSchedules20261011h.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

/** the census's replay, in the seed's own arm */
function stallsAfter(instance: Instance): number {
  const drawId = `stall-scale-h-${instance.arm}-${instance.seed}`;
  const stalls = stallsAfterSchedule({ allowChangePropagation: instance.arm === 'on', scenario: instance, drawId });
  expect(stalls).toBeDefined();
  return stalls?.length ?? 0;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing, and a policy-off line without its policy
// would replay in the default arm
it('holds both instances, one flag-off and one policy-off, the policy-off line under its policy', () => {
  expect(INSTANCES.map((instance) => `${instance.arm}:${instance.seed}`)).toEqual([
    'off:20267598',
    'policyoff:20278127',
  ]);
  expect(INSTANCES.find((instance) => instance.arm === 'policyoff')?.policyDefinitions).toEqual({
    progression: { doubleExitPropagateBye: false },
  });
  expect(INSTANCES.find((instance) => instance.arm === 'off')?.policyDefinitions).toBeUndefined();
});

it('the seeds that stall are exactly the OPEN list', () => {
  const stalling = INSTANCES.filter((instance) => stallsAfter(instance) > 0).map(
    (instance) => `${instance.arm}:${instance.seed}`,
  );
  expect(stalling.filter((instance) => !OPEN.has(instance))).toEqual([]);
  expect([...OPEN].filter((instance) => !stalling.includes(instance))).toEqual([]);
});
