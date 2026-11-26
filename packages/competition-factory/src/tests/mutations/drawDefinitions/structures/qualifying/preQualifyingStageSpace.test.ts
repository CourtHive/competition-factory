import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A pre-qualifying structure (stageSequence 1) feeding a qualifying structure (stageSequence 2).
 *
 * A stage's space was its sequence's draw positions less the entries of EVERY sequence of the stage: pre-qualifying's
 * 32 positions less qualifying's 24 entries left 8 places, and 24 pre-qualifiers were left out of the draw without an
 * error. A sequence's space is now its own positions less its own entries, as its positions already were.
 */
it("places every pre-qualifier: a sequence's space is not taken by another sequence's entries", () => {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 80 }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  let result: any = tournamentEngine.addEvent({ event: { eventName: 'Open' } });
  const { eventId } = result.event;

  tournamentEngine.addEventEntries({ eventId, participantIds: participantIds.slice(0, 24), entryStage: MAIN });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(24, 48),
    entryStage: QUALIFYING,
    entryStageSequence: 2,
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(48, 80),
    entryStage: QUALIFYING,
    entryStageSequence: 1,
    eventId,
  });

  result = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    qualifyingPlaceholder: true,
    automated: true,
    drawSize: 32,
    eventId,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [
          { stageSequence: 1, drawSize: 32, qualifyingPositions: 8 },
          { stageSequence: 2, drawSize: 32, qualifyingPositions: 8 },
        ],
      },
    ],
  });
  expect(result.success).toEqual(true);
  const { drawDefinition } = result;

  const placed = (stage: string, stageSequence: number) => {
    const structure = drawDefinition.structures.find(
      (s: any) => s.stage === stage && s.stageSequence === stageSequence,
    );
    const assignments = structure.positionAssignments;
    return {
      participants: assignments.filter((a: any) => a.participantId).length,
      qualifiers: assignments.filter((a: any) => a.qualifier).length,
      byes: assignments.filter((a: any) => a.bye).length,
    };
  };
  // pre-qualifying: all 32, none on a bye
  expect(placed(QUALIFYING, 1)).toEqual({ participants: 32, qualifiers: 0, byes: 0 });
  // qualifying: its own 24 and the 8 pre-qualifiers
  expect(placed(QUALIFYING, 2)).toEqual({ participants: 24, qualifiers: 8, byes: 0 });
  expect(placed(MAIN, 1)).toEqual({ participants: 24, qualifiers: 8, byes: 0 });

  const sequence1 = drawDefinition.entries.filter(
    (entry: any) => entry.entryStage === QUALIFYING && entry.entryStageSequence === 1,
  );
  expect(sequence1).toHaveLength(32);
});
