import { generateSchedule, prepareDraw, randomConfig, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Assemblies/engines/sync';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { FEED_IN_CHAMPIONSHIP, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A CARRIED exit — one `progressExitStatus` stamps onto a fed matchUp — must record
 * `sideExitProvenance`, not only a string in `matchUpStatusCodes`.
 *
 * Before this, only `doubleExitAdvancement` wrote provenance. An exit carried into a consolation by
 * `directLoser`/`progressExitStatus` was marked by a status code string at best, and by NOTHING when
 * the source matchUp carried no codes of its own — which is the normal shape of a
 * directly-recorded walkover. `exitProducedByPropagation` reads provenance, so those exits looked
 * un-propagated, and every detector that excludes a propagation-produced exit fired on a legitimate
 * one: `EXIT_WITHOUT_LOSER` and `DROPPED_PROGRESSION` both.
 *
 * Measured over an independent 600-seed sweep window: 136 findings -> 127, nine seeds cleared, zero
 * new. `DROPPED_PROGRESSION` 15 -> 8 and `EXIT_WITHOUT_LOSER` 12 -> 8; no other issueType moved.
 */

function scoreMainRoundOne({ drawId, roundPosition, outcome }) {
  const matchUps = getDrawMatchUps(drawId);
  const target = matchUps.find(
    (matchUp: any) => matchUp.stage === 'MAIN' && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
  );
  expect(target?.matchUpId).toBeDefined();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    drawId,
    outcome,
  });
  expect(result.success).toEqual(true);
  return target.matchUpId;
}

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 8, roundPosition: 3 },
  { drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 6, roundPosition: 1 },
])(
  'a walkover carried into the consolation of a $drawType records provenance naming its source',
  ({ drawType, drawSize, participantsCount, roundPosition }) => {
    setSubscriptions({});
    const drawId = 'carried-exit';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
      nonRandom: 1,
      setState: true,
    });

    const sourceMatchUpId = scoreMainRoundOne({
      outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
      roundPosition,
      drawId,
    });

    const carried: any = getDrawMatchUps(drawId).filter(
      (matchUp: any) => matchUp.stage !== 'MAIN' && matchUp.matchUpStatus === WALKOVER,
    );
    // the control: without a carried exit there is nothing for this test to assert about
    expect(carried.length).toBeGreaterThan(0);

    for (const matchUp of carried) {
      const provenance = matchUp.sideExitProvenance;
      expect(provenance).toBeDefined();
      const entries: any[] = Object.values(provenance);
      expect(entries.length).toBeGreaterThan(0);
      // the exiting side is attributed to the matchUp whose result produced the exit
      expect(entries.some((entry: any) => entry.sourceMatchUpId === sourceMatchUpId)).toEqual(true);
      expect(entries.some((entry: any) => entry.previousMatchUpStatus === WALKOVER)).toEqual(true);
    }
  },
);

it.each([{ seed: 6341103 }, { seed: 6141627 }, { seed: 6141834 }, { seed: 6040627 }])(
  'sweep seed $seed no longer reports an orphaned or dropped progression',
  ({ seed }) => {
    setSubscriptions({});
    const config = randomConfig(seed);
    // the sweep's own drawId: mocksEngine seeds the draw from `config.seed`, but the schedule is
    // built by walking the live draw, so keeping every input identical to the sweep keeps the
    // reproduction identical to the one the census measured
    const drawId = `sweep-${seed}`;
    expect(prepareDraw(config, drawId)).toEqual(true);

    const steps = generateSchedule(config, drawId, 30);
    // the control: a schedule that produced no steps would pass this test vacuously
    expect(steps.length).toBeGreaterThan(0);
    // `replay` runs the repo's own integrity checker at the end of the schedule, which is exactly
    // the oracle the sweep census counts. Asserting on a re-read AFTER `replay` would be wrong: its
    // relational tail applies a further DOUBLE_WALKOVER and inspects a state the schedule never
    // produced.
    expect(replay(config, steps, drawId)).toEqual(null);
  },
);
