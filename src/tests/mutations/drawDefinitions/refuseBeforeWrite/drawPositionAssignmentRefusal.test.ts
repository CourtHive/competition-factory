import { drawPositionAssignmentRefusal } from '@Query/drawDefinition/drawPositionAssignmentRefusal';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  INVALID_DRAW_POSITION,
  MISSING_PARTICIPANT_ID,
  STRUCTURE_NOT_FOUND,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';

const policyDefinitions = {
  [POLICY_TYPE_SEEDING]: { ...POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING], validSeedPositions: { ignore: false } },
};

// The validator is asked INSTEAD of assignDrawPosition's own guards, before a seat is emptied. The two
// must agree, or a position action refuses what assignDrawPosition would accept (or the reverse). Every
// case is put to both: the validator, and assignDrawPosition on a copy of the record.
function agreement({ drawId, ...args }: any) {
  const tournamentRecord = structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));
  const event = tournamentRecord.events?.find((event) => event.drawDefinitions?.some((d) => d.drawId === drawId));
  const drawDefinition = event?.drawDefinitions?.find((d) => d.drawId === drawId);
  const refusal: any = drawPositionAssignmentRefusal({ tournamentRecord, drawDefinition, event, ...args });
  const assigned: any = assignDrawPosition({ tournamentRecord, drawDefinition, event, ...args });
  expect(refusal?.error?.code).toEqual(assigned.error?.code);
  return refusal?.error;
}

test('drawPositionAssignmentRefusal agrees with assignDrawPosition on a seat that is empty', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8, seedsCount: 2 }],
    policyDefinitions,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments, seedAssignments } = drawDefinition.structures[0];
  const seedIds = seedAssignments.map(({ participantId }) => participantId);
  const unseeded = positionAssignments.filter(({ participantId }) => !seedIds.includes(participantId));
  const [emptied, seated] = unseeded;

  let result: any = tournamentEngine.removeDrawPositionAssignment({
    drawPosition: emptied.drawPosition,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const drawPosition = emptied.drawPosition;
  const seedOne = seedAssignments.find(({ seedNumber }) => seedNumber === 1).participantId;

  expect(agreement({ drawId, structureId, drawPosition })).toEqual(MISSING_PARTICIPANT_ID);
  expect(agreement({ drawId, structureId: 'bogus', drawPosition, participantId: seated.participantId })).toEqual(
    STRUCTURE_NOT_FOUND,
  );
  expect(agreement({ drawId, structureId, drawPosition: 99, participantId: emptied.participantId })).toEqual(
    INVALID_DRAW_POSITION,
  );
  expect(agreement({ drawId, structureId, drawPosition, participantId: seated.participantId })).toEqual(
    EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  );
  expect(agreement({ drawId, structureId, drawPosition, participantId: seedOne })).toEqual(
    INVALID_DRAW_POSITION_FOR_SEEDING,
  );
  // a participant whose own seat the caller empties first may be placed: the swap case
  result = drawPositionAssignmentRefusal({
    drawDefinition: getTournamentRecord(tournamentEngine.getTournamentId()).events[0].drawDefinitions[0],
    vacatedDrawPositions: [seated.drawPosition],
    participantId: seated.participantId,
    structureId,
    drawPosition,
  });
  expect(result).toBeUndefined();
  // the placement that succeeds is refused by neither
  expect(agreement({ drawId, structureId, drawPosition, participantId: emptied.participantId })).toBeUndefined();
  // a qualifier seat needs no participantId
  expect(agreement({ drawId, structureId, drawPosition, isQualifierPosition: true })).toBeUndefined();
});

test('drawPositionAssignmentRefusal agrees with assignDrawPosition on an AD_HOC structure', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: AD_HOC }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId } = drawDefinition.structures[0];
  const participantId = drawDefinition.entries[0].participantId;
  expect(agreement({ drawId, structureId, drawPosition: 1, participantId })).toEqual(INVALID_MATCHUP);
});
