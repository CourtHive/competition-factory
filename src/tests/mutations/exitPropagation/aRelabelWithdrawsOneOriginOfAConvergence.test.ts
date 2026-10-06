import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * F2: a relabel withdraws ONE origin of a converged exit (census 9000008).
 *
 * The losers of `Main|1|1` and `Main|1|2` both carry a walkover into `Consolation|1|1`, where the two exits
 * converge to a DOUBLE_WALKOVER, which produces a pending WALKOVER in `Consolation|2|1`. Re-entering `Main|1|1` as a
 * played result, the winner unchanged, withdraws its carry (the 2026-10-02 relabel ruling). Before, a convergence
 * was left as it stood. Now only this origin's entry goes: `Consolation|1|1` re-derives to the kept origin's
 * WALKOVER, its carrier (`Main|1|2`'s loser) loses it, and `Main|1|1`'s loser, no longer exiting, wins it and
 * advances, replacing what the double exit produced.
 *
 * Where the convergence's produced exit was won and its winner has played on, the convergence stands, as a clear
 * of the origin is refused there: withdrawing it would leave that winner a round on, advanced out of an undecided
 * matchUp.
 */
const DRAW_ID = 'relabel-convergence';

const at = (stage: string, roundNumber: number, roundPosition: number): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.stage === stage && matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );
const occupants = (matchUp: any) => matchUp.sides.map((side: any) => side.participantId).filter(Boolean);
const loserOf = (matchUp: any) =>
  matchUp.sides.find((side: any) => side.sideNumber === 3 - matchUp.winningSide)?.participantId;
const played = (winningSide: number) =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

afterEach(() => setOutcomePipeline());

function setup() {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  resetDifferentialTally();
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });
}

function enter(matchUp: any, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
    outcome,
  });
  expect(result.error).toBeUndefined();
}

function errors() {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  return ((getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID }) as any).inconsistencies ?? []).filter(
    (issue: any) => issue.severity === 'error',
  );
}

it('re-derives the convergence to the kept exit, which the relabelled loser wins and advances from', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 });
  enter(at(MAIN, 1, 2), { matchUpStatus: WALKOVER, winningSide: 1 });
  const relabelled = loserOf(at(MAIN, 1, 1));
  const carrier = loserOf(at(MAIN, 1, 2));
  // CONTROL: the two carried exits converged, and the double exit produced a pending walkover one round on
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(at(CONSOLATION, 2, 1).matchUpStatus).toEqual(WALKOVER);

  enter(at(MAIN, 1, 1), played(1));

  const meeting = at(CONSOLATION, 1, 1);
  expect(meeting.matchUpStatus).toEqual(WALKOVER);
  expect(meeting.sides.find((side: any) => side.sideNumber === meeting.winningSide).participantId).toEqual(relabelled);
  expect(loserOf(meeting)).toEqual(carrier);
  // only the kept origin's entry stands, at its carrier's side
  expect(Object.values(meeting.sideExitProvenance).map((entry: any) => entry.sourceMatchUpId)).toEqual([
    at(MAIN, 1, 2).matchUpId,
  ]);
  // the produced walkover is gone, and the winner awaits an opponent there
  const next = at(CONSOLATION, 2, 1);
  expect(next.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(next)).toEqual([relabelled]);
  expect(errors()).toEqual([]);
  expect(getDifferentialTally()['winner:loser-withdrawn-converged']).toEqual({ compared: 1, deferred: 0 });
});

it('the reverse label follows on a convergence: DOUBLE_DEFAULT becomes a DOUBLE_WALKOVER, and so does its product', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter(at(MAIN, 1, 2), { matchUpStatus: DEFAULTED, winningSide: 1 });
  // CONTROL
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(at(CONSOLATION, 2, 1).matchUpStatus).toEqual(DEFAULTED);

  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 });

  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(at(CONSOLATION, 2, 1).matchUpStatus).toEqual(WALKOVER);
  expect(errors()).toEqual([]);
});

it('leaves the convergence standing where the winner of what it produced has played on', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 });
  enter(at(MAIN, 1, 2), { matchUpStatus: WALKOVER, winningSide: 1 });
  enter(at(MAIN, 1, 3), played(1));
  enter(at(MAIN, 1, 4), played(1));
  enter(at(CONSOLATION, 1, 2), played(1));
  enter(at(MAIN, 2, 1), played(1));
  enter(at(MAIN, 2, 2), played(1));
  // CONTROL: the produced walkover was won by the arriving loser of Main|2|1, who then won the final
  const produced = at(CONSOLATION, 2, 1);
  expect(produced.matchUpStatus).toEqual(WALKOVER);
  const advanced = produced.sides.find((side: any) => side.sideNumber === produced.winningSide).participantId;
  enter(at(CONSOLATION, 3, 1), played(1));
  expect(occupants(at(CONSOLATION, 3, 1))).toContain(advanced);

  enter(at(MAIN, 1, 1), played(1));

  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(at(CONSOLATION, 2, 1).matchUpStatus).toEqual(WALKOVER);
  expect(at(CONSOLATION, 2, 1).winningSide).toEqual(produced.winningSide);
  expect(errors()).toEqual([]);
  // Main|1|1's winner has played Main|2|1, whose loser feeds Consolation|2|1, so this relabel directs nobody (the
  // `apply-values` route, `relabelWithoutDirection`) and v2 plans no direction for it
  expect(getDifferentialTally()['apply-values:direction']).toEqual({ compared: 0, deferred: 1 });
});
