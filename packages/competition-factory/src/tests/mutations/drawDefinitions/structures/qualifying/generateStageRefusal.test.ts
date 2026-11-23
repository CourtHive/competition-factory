import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_STAGE } from '@Constants/errorConditionConstants';

/**
 * generateDrawDefinition builds a draw from its MAIN stage. A `stage` other than MAIN is refused with INVALID_STAGE and
 * names the route that does work (NOC-717): a qualifying-only draw is `qualifyingOnly` with `qualifyingProfiles`.
 * Before, `stage: QUALIFYING` reached the structure generators and was refused as STRUCTURE_NOT_FOUND.
 */
function setup() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    eventProfiles: [{ eventName: 'E' }],
    setState: true,
  });
  const { participants } = tournamentEngine.getParticipants();
  const participantIds = participants.map(({ participantId }) => participantId);
  tournamentEngine.addEventEntries({ participantIds, entryStage: QUALIFYING, eventId });
  return { eventId };
}

it('refuses a stage other than MAIN, and points to qualifyingOnly', () => {
  const { eventId } = setup();
  const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 16, stage: QUALIFYING });
  expect(result.error).toEqual(INVALID_STAGE);
  expect(result.context).toEqual({ stage: QUALIFYING });
  expect(result.info).toMatch(/qualifyingOnly/);
});

it('still accepts stage MAIN', () => {
  const { eventId } = setup();
  const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 16, stage: MAIN });
  expect(result.success).toEqual(true);
});

it('generates a qualifying-only draw by qualifyingOnly and qualifyingProfiles', () => {
  const { eventId } = setup();
  const result: any = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      { structureProfiles: [{ drawSize: 16, qualifyingPositions: 4, drawType: SINGLE_ELIMINATION, stageSequence: 1 }] },
    ],
    qualifyingOnly: true,
    automated: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifying.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(16);
});
