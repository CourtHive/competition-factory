import { getStageParticipantsCount } from '@Query/drawDefinition/getStageParticipantsCount';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

/**
 * A drawProfile with qualifyingProfiles inside an eventProfile planned its MAIN direct entries from drawSize
 * minus a top-level drawProfile.qualifyingPositions, and never read qualifyingProfiles: 16 direct entries for
 * the 12 places left by 4 qualifiers (ERR_UNCHANGED_NO_AVAILABLE_STAGE_SPACE) and no QUALIFYING entries. The
 * same drawProfile at the top level generates QUALIFYING 8 + MAIN 16.
 */

const drawProfile = () => ({
  drawSize: 16,
  qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
});

function structureFill(drawDefinition, stage) {
  const structure = drawDefinition.structures.find((s) => s.stage === stage);
  const assignments = structure.positionAssignments ?? [];
  return {
    positions: assignments.length,
    participants: assignments.filter(({ participantId }) => participantId).length,
    qualifiers: assignments.filter(({ qualifier }) => qualifier).length,
  };
}

function expectQualifyingDraw(tournamentRecord) {
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  expect(structureFill(drawDefinition, QUALIFYING)).toEqual({ positions: 8, participants: 8, qualifiers: 0 });
  expect(structureFill(drawDefinition, MAIN)).toEqual({ positions: 16, participants: 12, qualifiers: 4 });

  const stageEntries = (stage) => event.entries.filter(({ entryStage }) => entryStage === stage);
  expect(stageEntries(QUALIFYING).length).toEqual(8);
  expect(stageEntries(MAIN).length).toEqual(12);
  const mainIds = new Set(stageEntries(MAIN).map(({ participantId }) => participantId));
  expect(stageEntries(QUALIFYING).some(({ participantId }) => mainIds.has(participantId))).toEqual(false);
}

describe('eventProfile drawProfile with qualifyingProfiles', () => {
  it('generates QUALIFYING 8 + MAIN 16 and fills them', () => {
    const result = mocksEngine.generateTournamentRecord({ eventProfiles: [{ drawProfiles: [drawProfile()] }] });
    expect(result.error).toBeUndefined();
    expectQualifyingDraw(result.tournamentRecord);
  });

  it('generates and fills them for an event with a category', () => {
    const result = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ category: { ageCategoryCode: 'U18' }, drawProfiles: [drawProfile()] }],
    });
    expect(result.error).toBeUndefined();
    expectQualifyingDraw(result.tournamentRecord);
  });

  it('draws QUALIFYING and MAIN from preset participants', () => {
    const participants = mocksEngine.generateParticipants({ participantsCount: 20 }).participants;
    const presetIds = new Set(participants.map(({ participantId }) => participantId));
    const result = mocksEngine.generateTournamentRecord({
      participants,
      eventProfiles: [{ drawProfiles: [drawProfile()] }],
    });
    expect(result.error).toBeUndefined();
    expectQualifyingDraw(result.tournamentRecord);
    // nothing generated: the 20 supplied fill QUALIFYING 8 and MAIN 12
    expect(result.tournamentRecord.participants.length).toEqual(20);
    expect(
      result.tournamentRecord.events[0].entries.every(({ participantId }) => presetIds.has(participantId)),
    ).toEqual(true);
  });

  it('getStageParticipantsCount derives qualifying positions and the QUALIFYING count from qualifyingProfiles', () => {
    const { stageParticipantsCount, uniqueParticipantsCount } = getStageParticipantsCount({
      drawProfiles: [drawProfile()],
      category: undefined,
      gender: undefined,
    });
    // MAIN draws its 12 direct entries from the tournament pool; the 8 QUALIFYING entries are generated
    expect(stageParticipantsCount).toEqual({ [MAIN]: 12 });
    expect(uniqueParticipantsCount).toEqual({ [QUALIFYING]: 8 });
  });

  it('getStageParticipantsCount follows chained qualifying structures', () => {
    const { stageParticipantsCount, uniqueParticipantsCount } = getStageParticipantsCount({
      drawProfiles: [
        {
          drawSize: 32,
          qualifyingProfiles: [
            {
              structureProfiles: [
                { stageSequence: 1, drawSize: 16, qualifyingPositions: 8 },
                { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
              ],
            },
          ],
        },
      ],
      category: undefined,
      gender: undefined,
    });
    // stage 2 takes 8 qualifiers from stage 1 and 8 direct entries; MAIN keeps 28 places for direct entries
    expect(stageParticipantsCount).toEqual({ [MAIN]: 28 });
    expect(uniqueParticipantsCount).toEqual({ [QUALIFYING]: 24 });
  });
});
