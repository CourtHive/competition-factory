import { CANNOT_RESET_STRUCTURE, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import {
  CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  MAIN,
  QUALIFYING,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

const structureOf = (drawId: string, stage: string) =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((structure) => structure.stage === stage);
const matchUpsOf = (stage: string) => {
  const matchUps =
    tournamentEngine.allTournamentMatchUps().matchUps?.filter((matchUp) => matchUp.stage === stage) ?? [];
  expect(matchUps.length).toBeGreaterThan(0);
  return matchUps;
};
const statusesOf = (stage: string) =>
  matchUpsOf(stage).map(({ matchUpId, matchUpStatus }) => [matchUpId, matchUpStatus]);
const participantIdsOf = (structure) => structure.positionAssignments.map(({ participantId }) => participantId);

describe('resetStructure', () => {
  it('resets a qualifying structure until its qualifiers are placed in the main draw', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          qualifyingProfiles: [
            { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 8, qualifyingPositions: 2 }] },
          ],
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const qualifying = structureOf(drawId, QUALIFYING);
    expect(matchUpsOf(QUALIFYING).every(({ matchUpStatus }) => matchUpStatus === COMPLETED)).toEqual(true);
    const mainBefore = statusesOf(MAIN);

    let result: any = tournamentEngine.resetStructure({ drawId, structureId: qualifying.structureId });
    expect(result.success).toEqual(true);

    // every result is gone; the positions stay, and only the first round still holds both sides
    const reset = matchUpsOf(QUALIFYING);
    expect(reset.every(({ matchUpStatus, winningSide }) => matchUpStatus === TO_BE_PLAYED && !winningSide)).toEqual(
      true,
    );
    expect(
      reset
        .filter(({ roundNumber }) => (roundNumber ?? 0) > 1)
        .every(({ drawPositions }) => !drawPositions?.filter(Boolean).length),
    ).toEqual(true);
    expect(participantIdsOf(structureOf(drawId, QUALIFYING))).toEqual(participantIdsOf(qualifying));
    expect(statusesOf(MAIN)).toEqual(mainBefore);

    // played again, and its qualifiers placed in the main draw, it can no longer be reset on its own
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    for (const roundNumber of [1, 2]) {
      for (const { matchUpId } of matchUpsOf(QUALIFYING).filter((m) => m.roundNumber === roundNumber)) {
        result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
        expect(result.success).toEqual(true);
      }
    }
    result = tournamentEngine.qualifierProgression({ drawId });
    expect(result.assignedParticipants.length).toEqual(2);

    result = tournamentEngine.resetStructure({ drawId, structureId: qualifying.structureId });
    expect(result.error).toEqual(CANNOT_RESET_STRUCTURE);
    expect(result.context.delivered.length).toEqual(2);
  });

  it('resets a consolation structure and leaves the main structure, which feeds it, as it was', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP }],
      completeAllMatchUps: true,
      setState: true,
    });

    const main = structureOf(drawId, MAIN);
    const consolation = structureOf(drawId, CONSOLATION);
    const mainBefore = statusesOf(MAIN);
    expect(matchUpsOf(CONSOLATION).every(({ matchUpStatus }) => matchUpStatus === COMPLETED)).toEqual(true);

    let result: any = tournamentEngine.resetStructure({ drawId, structureId: main.structureId });
    expect(result.error).toEqual(CANNOT_RESET_STRUCTURE);

    result = tournamentEngine.resetStructure({ drawId, structureId: consolation.structureId });
    expect(result.success).toEqual(true);

    expect(matchUpsOf(CONSOLATION).every(({ matchUpStatus }) => matchUpStatus === TO_BE_PLAYED)).toEqual(true);
    expect(statusesOf(MAIN)).toEqual(mainBefore);
    // the participants fed in by main's results stay where they were placed
    expect(participantIdsOf(structureOf(drawId, CONSOLATION))).toEqual(participantIdsOf(consolation));

    // every consolation matchUp still holds the positions fed into it; only the positions consolation wins delivered went
    const fedPositions = new Set(consolation.positionAssignments.map(({ drawPosition }) => drawPosition));
    const reset = matchUpsOf(CONSOLATION);
    const firstRound = reset.filter(({ roundNumber }) => roundNumber === 1);
    expect(firstRound.every(({ drawPositions }) => (drawPositions ?? []).filter(Boolean).length === 2)).toEqual(true);
    expect(
      reset.flatMap(({ drawPositions }) => (drawPositions ?? []).filter(Boolean)).every((p) => fedPositions.has(p)),
    ).toEqual(true);
  });

  it('resets an unlinked main structure, and refuses a structure that is not in the draw', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      setState: true,
    });

    let result: any = tournamentEngine.resetStructure({ drawId, structureId: 'bogus' });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);

    result = tournamentEngine.resetStructure({ drawId, structureId: structureOf(drawId, MAIN).structureId });
    expect(result.success).toEqual(true);
    expect(matchUpsOf(MAIN).every(({ matchUpStatus }) => matchUpStatus === TO_BE_PLAYED)).toEqual(true);
  });
});
