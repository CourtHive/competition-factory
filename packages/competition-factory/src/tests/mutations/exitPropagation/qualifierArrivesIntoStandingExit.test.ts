import { playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN EXIT AWARDED TO THE QUALIFIER STILL TO COME SURVIVES THE QUALIFIER'S ARRIVAL — assessment G3.
 *
 * `exitAwardable` admits, by name, a walkover whose winning side is an unfilled QUALIFIER seat: the
 * opponent withdrew, whoever qualifies walks through. That branch had never executed in a test.
 * Measured 2026-10-01: recording the walkover first and placing the qualifier second ended with the
 * matchUp TO_BE_PLAYED and the qualifier in the first round; placing first and recording second ended
 * with the walkover standing and the qualifier in the second round.
 *
 * `qualifierDrawPositionAssignment` cleared the seat before placing, and clearing a seat walks
 * `positionClear` over its matchUp, which collapses the matchUp's status. A bare qualifier placeholder
 * holds nothing to clear, so it is not cleared.
 *
 * `propagateExitStatus` is on: without it `checkParticipants` requires two participants for an exit,
 * and the award to an empty seat is refused outright (ERR_INVALID_MATCHUP_STATUS) — the documented
 * rule, and not what this file is about.
 */

const all = (drawId: string): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
const signature = (matchUp: any) => ({
  sides: (matchUp.sides ?? []).map((side: any) => side.participantId ?? (side.qualifier ? 'Q' : '-')),
  drawPositions: matchUp.drawPositions,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

function setUp(drawId: string) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [
          {
            structureProfiles: [
              { stageSequence: 1, drawSize: 8, qualifyingPositions: 2, drawType: SINGLE_ELIMINATION },
            ],
            roundTarget: 1,
          },
        ],
        participantsCount: 14,
        drawSize: 16,
        drawId,
      },
    ],
    nonRandom: 400101,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const main = drawDefinition.structures.find((s: any) => s.stage === MAIN);
  const qualifying = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
  const qualifierSeat = main.positionAssignments.find((a: any) => a.qualifier).drawPosition;

  // qualifying is played out, so a qualifier exists to place
  playForward({ propagateExitStatus: true, exitOutcome: undefined, drawId });
  const qualifyingFinal = all(drawId).find(
    (m) => m.structureId === qualifying.structureId && m.finishingRound === 1 && m.winningSide,
  );
  const qualifierId = qualifyingFinal.sides.find(
    (s: any) => s.sideNumber === qualifyingFinal.winningSide,
  ).participantId;

  const seatMatchUp = () =>
    all(drawId).find(
      (m) => m.structureId === main.structureId && m.roundNumber === 1 && m.drawPositions?.includes(qualifierSeat),
    );
  const qualifierSide = seatMatchUp().sides.find((s: any) => s.drawPosition === qualifierSeat).sideNumber;
  // CONTROL: the seat is a qualifier placeholder beside a participant
  expect(seatMatchUp().sides.find((s: any) => s.sideNumber === qualifierSide).qualifier).toEqual(true);
  expect(seatMatchUp().sides.find((s: any) => s.sideNumber !== qualifierSide).participantId).toBeDefined();

  const nextRound = () => all(drawId).find((m) => m.matchUpId === seatMatchUp().winnerMatchUpId);
  const recordExit = (matchUpStatus: string) =>
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus, winningSide: qualifierSide },
      matchUpId: seatMatchUp().matchUpId,
      propagateExitStatus: true,
      drawId,
    });
  const placeQualifier = () =>
    tournamentEngine.qualifierDrawPositionAssignment({
      qualifyingParticipantId: qualifierId,
      structureId: main.structureId,
      drawPosition: qualifierSeat,
      drawId,
    });
  return { seatMatchUp, nextRound, recordExit, placeQualifier, qualifierId, qualifierSide };
}

it.each([WALKOVER, DEFAULTED])('keeps a %s awarded to the qualifier seat when the qualifier is placed', (status) => {
  const first = setUp(`exit-first-${status}`);
  let result: any = first.recordExit(status);
  expect(result.success).toEqual(true);
  // CONTROL: the exit was awarded to the empty qualifier seat
  expect(first.seatMatchUp().matchUpStatus).toEqual(status);
  expect(first.seatMatchUp().winningSide).toEqual(first.qualifierSide);

  result = first.placeQualifier();
  expect(result.success).toEqual(true);

  // THE DEFECT: the matchUp read TO_BE_PLAYED and the qualifier sat in the first round
  expect(first.seatMatchUp().matchUpStatus, 'the recorded exit stands').toEqual(status);
  expect(first.seatMatchUp().winningSide).toEqual(first.qualifierSide);
  expect(
    first.nextRound().sides.map((s: any) => s.participantId),
    'the qualifier walked through',
  ).toContain(first.qualifierId);

  // THE INVARIANT: the other order ends the same way. The engine holds one tournament at a time, so
  // the first route's end state is captured before the second is set up.
  const firstSeat = signature(first.seatMatchUp());
  const firstNext = signature(first.nextRound());
  const second = setUp(`qualifier-first-${status}`);
  expect(second.placeQualifier().success).toEqual(true);
  expect(second.recordExit(status).success).toEqual(true);
  expect(firstSeat).toEqual(signature(second.seatMatchUp()));
  expect(firstNext).toEqual(signature(second.nextRound()));
});
