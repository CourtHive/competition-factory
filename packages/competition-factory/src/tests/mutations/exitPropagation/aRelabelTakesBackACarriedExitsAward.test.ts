import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RELABEL TAKES BACK A CARRIED EXIT'S AWARD (found on the full history of census s14 policy-off 20512801, COMPASS
 * 16/13; reproduced under either `doubleExitPropagateBye` setting).
 *
 * `East|2|1`'s walkover carries its loser into `North|1|1`, decided for the seat `East|2|2`'s loser will take. That loser
 * arrives from a retirement and wins the walkover on arrival. `East|2|2` is then relabelled from RETIRED to WALKOVER, the
 * winner unchanged: the loser now exits at the origin, so their exit is carried in and meets the one standing there
 * (RULE 4), as it does when the walkover is entered directly or before `East|2|1`'s. The relabel took back only an award
 * of a PRODUCED exit, so the carried exit's award stood, and the participant who walked over held `North|1|1`.
 */

type Step = { at: string; outcome: any };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 13, drawSize: 16, seed: 20512801 };
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const FIRST_ROUND: Step[] = [1, 2, 3, 4, 5, 6, 7, 8].map((position) => ({
  at: `East|1|${position}`,
  outcome: { winningSide: 1 },
}));
const CARRIED: Step = { at: 'East|2|1', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } };
const RETIREMENT: Step = { at: 'East|2|2', outcome: RETIRED_6_3 };
const RELABEL: Step = { at: 'East|2|2', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } };

function northAfter(steps: Step[], policyDefinitions: any, drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, policyDefinitions);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === step.at);
    // as the census does: a first-round matchUp holding a BYE is not scored
    if ((target.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    const result: any = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId)
      .filter((matchUp: any) => matchUp.structureName !== 'East')
      .map((matchUp: any) => [
        coordinate(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
        },
      ]),
  );
}

const POLICIES = [
  {
    name: 'doubleExitPropagateBye: false',
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
  },
  { name: 'the default policy', policyDefinitions: undefined },
];

it.each(POLICIES)(
  '$name: the relabel converges the walkovers, as either direct order does',
  ({ policyDefinitions }) => {
    const relabelled = northAfter([...FIRST_ROUND, CARRIED, RETIREMENT, RELABEL], policyDefinitions, 'relabel-carried');
    expect(relabelled['North|1|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(relabelled['North|1|1'].winningSide).toBeUndefined();

    const direct = northAfter([...FIRST_ROUND, CARRIED, RELABEL], policyDefinitions, 'relabel-carried-direct');
    const reversed = northAfter(
      [...FIRST_ROUND, RETIREMENT, RELABEL, CARRIED],
      policyDefinitions,
      'relabel-carried-reversed',
    );
    expect(relabelled).toEqual(direct);
    expect(relabelled).toEqual(reversed);
  },
);
