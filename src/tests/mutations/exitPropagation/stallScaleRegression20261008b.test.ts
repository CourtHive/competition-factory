import { stallsAfterSchedule } from '@Tests/testHarness/exitPropagation/stallCount';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * THE SECOND AT-SCALE RUN'S STALLING SEEDS, replayed — a ratchet that may only shrink.
 *
 * 2026-10-08, after `stallScaleRegression`'s 53 instances were cleared, a fresh live census on Button (seeds
 * 20,060,001–20,100,000, 40,000 per arm) counted `STALLED_POSITION` directly in three arms and found 43 stalling
 * seeds: 4 with `allowChangePropagation` off, 3 with it on, and 36 under `doubleExitPropagateBye: false` (60
 * instances). CA, 2026-10-08: that policy arm must ALSO reach zero before `STALLED_POSITION` is promoted to `error`.
 * The planning record is `Mentat/planning/STALLED_POSITION_AT_SCALE.md`.
 *
 * Each seed replays in the arm it was found in, from the schedule EMITTED IN THAT ARM (`generateSchedule` calls the
 * engine, so the arm changes the schedule itself). A `policyoff` line carries the `policyDefinitions` it was emitted
 * under, and the replay attaches them.
 *
 * ## OPEN — the seeds that still stall, by arm
 *
 * The set of stalling seeds must EQUAL this list. A new stall fails; so does a seed that stops stalling, until its
 * entry is removed here — the list only shrinks, and a fix records itself by deleting a line.
 */
const OPEN = new Set<string>([]);

type Arm = 'off' | 'on' | 'policyoff';
type Instance = { arm: Arm; seed: number; config: any; steps: any[]; policyDefinitions?: any };

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/stallScaleSchedules20261008b.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

/** the census's replay, in the seed's own arm */
function stallsAfter(instance: Instance): number {
  const drawId = `stall-scale-b-${instance.arm}-${instance.seed}`;
  const stalls = stallsAfterSchedule({ allowChangePropagation: instance.arm === 'on', scenario: instance, drawId });
  expect(stalls).toBeDefined();
  return stalls?.length ?? 0;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing, and a policy-off line without its policy
// would replay in the default arm
it('holds all 43 seeds, 4 flag-off, 3 flag-on and 36 policy-off, each policy-off line under its policy', () => {
  const byArm = (arm: Arm) => INSTANCES.filter((instance) => instance.arm === arm);
  expect(INSTANCES.length).toEqual(43);
  expect(byArm('off').length).toEqual(4);
  expect(byArm('on').length).toEqual(3);
  expect(byArm('policyoff').length).toEqual(36);
  expect(
    byArm('policyoff').every((instance) => instance.policyDefinitions?.progression?.doubleExitPropagateBye === false),
  ).toEqual(true);
  expect(INSTANCES.filter((instance) => instance.arm !== 'policyoff' && instance.policyDefinitions)).toEqual([]);
});

it('the seeds that stall are exactly the OPEN list', () => {
  const stalling = INSTANCES.filter((instance) => stallsAfter(instance) > 0).map(
    (instance) => `${instance.arm} ${instance.seed}`,
  );
  expect(stalling.filter((instance) => !OPEN.has(instance))).toEqual([]);
  expect([...OPEN].filter((instance) => !stalling.includes(instance))).toEqual([]);
}, 180_000);
