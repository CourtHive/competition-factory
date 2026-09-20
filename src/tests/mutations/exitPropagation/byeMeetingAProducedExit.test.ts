import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, BYE, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A BYE MEETING A PRODUCED EXIT.
 *
 * CA's rule, 2026-09-20, arrived at by driving both of these in TMX:
 *
 *   *"An advancing participant encountering a BYE should always be advanced; a propagated exit
 *   encountering a BYE should be advanced. In both cases the BYE remains a BYE"* — and, to be
 *   explicit, *"the BYE remains a BYE means the `matchUpStatus: BYE` does not change."*
 *
 * Three things therefore hold at once, and they are independent:
 *
 *   1. the matchUp's `matchUpStatus` stays `BYE` — the produced exit never overwrites it;
 *   2. the arriving exit is recorded on ITS OWN side in `matchUpStatusCodes`;
 *   3. the exit is carried onward, exactly as a participant would be.
 *
 * Both scenarios below are hand-drivable in TMX with ordinary scores — no policy, no
 * `propagateExitStatus`, no `allowChangePropagation` — which is what the client sends.
 */

const at = (drawId: string, stage: string, roundNumber: number, roundPosition: number): any =>
  getDrawMatchUps(drawId).find(
    (m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );

const codeFor = (matchUp: any, sideNumber: number) =>
  (matchUp?.matchUpStatusCodes ?? []).find((code: any) => code?.sideNumber === sideNumber);

test('a converged double exit reaches the BYE, and the BYE stays a BYE', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-fmlc';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  // CONTROL: the draw must exist, or every assertion below is about nothing
  expect(getDrawMatchUps(drawId).length).toBeGreaterThan(0);

  for (const roundPosition of [1, 2]) {
    const target = at(drawId, 'MAIN', 1, roundPosition);
    expect(target, `MAIN|1|${roundPosition}`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.error, `MAIN|1|${roundPosition}`).toBeUndefined();
  }

  // the two exits converge: nobody wins it
  const convergence = at(drawId, 'CONSOLATION', 1, 1);
  expect(convergence.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(convergence.winningSide).toBeUndefined();

  // 1. the BYE is still a BYE — this is the assertion the rule is about
  const meetsTheBye = at(drawId, 'CONSOLATION', 2, 1);
  expect(meetsTheBye.matchUpStatus).toEqual(BYE);

  // 2. and it records the arriving exit on the side the exit arrived on. The fed position is
  //    sideNumber 1 (draw-positions.md rule 4), so the side advanced from CONSOLATION|1|1 is 2.
  expect(codeFor(meetsTheBye, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });

  // 3. and the exit is carried ONWARD through the BYE
  const onward = at(drawId, 'CONSOLATION', 3, 1);
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  // the side carrying the exit does not win it; the side yet to arrive does
  expect(onward.winningSide).toEqual(2);
});

test('a BYE that meets a produced exit keeps BOTH origins, and stays a BYE', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-se';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 7, idPrefix: 'match', seedsCount: 1, drawSize: 8, drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const { validActions } = tournamentEngine.positionActions({ drawPosition: 1, structureId, drawId });
  const assignBye: any = validActions.find((action: any) => action.type === BYE);
  // CONTROL: the BYE action must be offered, or the scenario never sets itself up
  expect(assignBye, 'no BYE action offered at drawPosition 1').toBeTruthy();
  expect(tournamentEngine[assignBye.method](assignBye.payload).success).toEqual(true);

  for (const matchUpId of ['match-1-3', 'match-1-4']) {
    const result: any = tournamentEngine.setMatchUpStatus({ outcome: { winningSide: 1 }, matchUpId, drawId });
    expect(result.success, matchUpId).toEqual(true);
  }

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-1-2',
    drawId,
  });
  expect(result.success).toEqual(true);

  const meetsTheBye = getDrawMatchUps(drawId).find((m: any) => m.matchUpId === 'match-2-1');
  // the BYE is untouched by the exit that arrived beside it
  expect(meetsTheBye.matchUpStatus).toEqual(BYE);
  // and BOTH origins are recorded: the BYE's own, and the exit's
  expect(codeFor(meetsTheBye, 1)).toEqual({ previousMatchUpStatus: BYE, matchUpStatus: BYE, sideNumber: 1 });
  expect(codeFor(meetsTheBye, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });
});
