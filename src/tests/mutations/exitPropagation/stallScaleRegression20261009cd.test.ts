import { stallsAfterSchedule } from '@Tests/testHarness/exitPropagation/stallCount';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * THE THIRD AND FOURTH AT-SCALE RUNS' STALLING SEEDS, replayed — a ratchet that may only shrink.
 *
 * 2026-10-09, after `stallScaleRegression20261008b`'s 43 seeds were cleared, two more live censuses on Button (seeds
 * 20,100,001–20,140,000 and 20,140,001–20,180,000; 40,000 per arm each) counted `STALLED_POSITION` directly in three
 * arms and found 13 and 15 stalling instances: 4 with `allowChangePropagation` off, 4 with it on, and 20 under
 * `doubleExitPropagateBye: false`. By the time the ratchet was written (dev 59a40e00cd, #5327–#5331 merged) every
 * default-arm instance replayed clean; the 8 policy-off seeds below did not. CA, 2026-10-08: that policy arm must ALSO
 * reach zero before `STALLED_POSITION` is promoted to `error`. The planning record is
 * `Mentat/planning/STALLED_POSITION_AT_SCALE.md`.
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
const OPEN = new Set<string>([
  // doubleExitPropagateBye: false
  'policyoff 20162213', // MODIFIED_FEED_IN_CHAMPIONSHIP 8/5
  'policyoff 20168928', // COMPASS 16/13
  'policyoff 20177818', // CURTIS_CONSOLATION 16/11
]);

type Arm = 'off' | 'on' | 'policyoff';
type Instance = { arm: Arm; seed: number; config: any; steps: any[]; policyDefinitions?: any };

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/stallScaleSchedules20261009cd.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

/** the census's replay, in the seed's own arm */
function stallsAfter(instance: Instance): number {
  const drawId = `stall-scale-cd-${instance.arm}-${instance.seed}`;
  const stalls = stallsAfterSchedule({ allowChangePropagation: instance.arm === 'on', scenario: instance, drawId });
  expect(stalls).toBeDefined();
  return stalls?.length ?? 0;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing, and a policy-off line without its policy
// would replay in the default arm
it('holds all 28 instances, 4 flag-off, 4 flag-on and 20 policy-off, each policy-off line under its policy', () => {
  const byArm = (arm: Arm) => INSTANCES.filter((instance) => instance.arm === arm);
  expect(INSTANCES.length).toEqual(28);
  expect(byArm('off').length).toEqual(4);
  expect(byArm('on').length).toEqual(4);
  expect(byArm('policyoff').length).toEqual(20);
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
