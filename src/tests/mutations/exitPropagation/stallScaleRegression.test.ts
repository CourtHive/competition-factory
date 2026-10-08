import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * THE AT-SCALE STALL INSTANCES, replayed — a ratchet that may only shrink.
 *
 * 2026-10-08, a live census of 120,000 seeds on Button (seeds 20,000,001–20,060,000, both `allowChangePropagation`
 * arms, `dev` `cf4c6aff2`) with `STALLED_POSITION` counted, found 53 stall instances on 41 seeds: 23 with the flag
 * off and 30 with it on. Every one reproduces from the schedule frozen here at that commit. #5288 cleared 48; the
 * planning record is `Mentat/planning/STALLED_POSITION_AT_SCALE.md`.
 *
 * Each instance replays in the arm it was found in, from the schedule EMITTED IN THAT ARM: `generateSchedule` calls
 * the engine, so the flag changes the schedule itself, and 15 of the 30 flag-on schedules differ from the same seed's
 * flag-off one. A replay from the wrong arm's schedule reproduced none of 11 of those instances.
 *
 * `STALLED_POSITION` is counted directly, whatever its severity, so this holds before and after its promotion.
 *
 * ## OPEN — the instances that still stall, by name
 *
 * The set of stalling instances must EQUAL this list. A new stall fails; so does one that stops stalling, until its
 * entry is removed here — the list only shrinks, and a fix records itself by deleting a line.
 */
const OPEN = new Set([
  'off 20012942', // DOUBLE_ELIMINATION 8/6 — F2's refusal reads a cascade award onward as "played on"
  'off 20037222', // MODIFIED_FEED_IN_CHAMPIONSHIP 8/8 — a late BYE into a fed consolation round during an unwind
]);

type Instance = { arm: 'off' | 'on'; seed: number; config: any; steps: any[] };

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/stallScaleSchedules.jsonl');
const INSTANCES: Instance[] = fs
  .readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/** the census's replay: a step targets its coordinate, and only while that matchUp holds two participants */
function stallsAfter({ arm, seed, config, steps }: Instance): number {
  setSubscriptions({});
  const drawId = `stall-scale-${arm}-${seed}`;
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === key(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({
      ...(arm === 'on' ? { allowChangePropagation: true } : {}),
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
  }
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? [];
  return inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length;
}

// CONTROL: an empty or truncated fixture would pass by replaying nothing
it('holds all 53 instances, 23 flag-off and 30 flag-on', () => {
  expect(INSTANCES.length).toEqual(53);
  expect(INSTANCES.filter((instance) => instance.arm === 'off').length).toEqual(23);
  expect(INSTANCES.filter((instance) => instance.arm === 'on').length).toEqual(30);
});

it('the instances that stall are exactly the OPEN list', () => {
  const stalling = INSTANCES.filter((instance) => stallsAfter(instance) > 0).map(
    (instance) => `${instance.arm} ${instance.seed}`,
  );
  expect(stalling.filter((instance) => !OPEN.has(instance))).toEqual([]);
  expect([...OPEN].filter((instance) => !stalling.includes(instance))).toEqual([]);
}, 180_000);
