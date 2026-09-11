import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { policyComposer } from '@Global/policyComposer';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { parseScoreString } from '@Tools/parseScoreString';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { MISSING_ASSIGNMENTS } from '@Constants/errorConditionConstants';
import { eventConstants } from '@Constants/eventConstants';

const { SINGLES } = eventConstants;

// `POLICY_SEEDING_NATIONAL` used to supply this. It was ITF seeding with one key omitted, and the
// composer says so in a way a fixture never could: leaving `validSeedPositions` unset is what keeps
// manual seed placement inside a valid seed block.
const SEEDING_POSITIONS_ENFORCED = policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_ITF)
  .unset('validSeedPositions')
  .set('policyName', 'ITF SEEDING, POSITIONS ENFORCED')
  .build();

it('can generate a tournament with events and draws', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2020-01-01',
    endDate: '2020-01-06',
  });
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Test Event',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    policyDefinitions: { ...SEEDING_POSITIONS_ENFORCED },
    event: eventResult,
    automated: true,
    seedsCount: 8,
    drawSize: 32,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  const { drawId } = drawDefinition;

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const { appliedPolicies } = getAppliedPolicies({ drawDefinition });
  expect(appliedPolicies?.seeding?.policyName).toEqual('ITF SEEDING, POSITIONS ENFORCED');

  // find main structureId more intelligently
  const mainStructureId = drawDefinition.structures[0].structureId;

  const { seedAssignments } = getStructureSeedAssignments({
    structureId: mainStructureId,
    drawDefinition,
  });
  expect(seedAssignments?.length).toEqual(8);

  result = tournamentEngine.assignSeedPositions({
    structureId: mainStructureId,
    eventId,
    drawId,
  });
  expect(result?.error).toEqual(MISSING_ASSIGNMENTS);

  const { positionAssignments } = drawDefinition.structures[0];
  function getPositionParticipantId(drawPosition) {
    const targetAssignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
    return targetAssignment?.participantId;
  }

  let assignments = [
    {
      seedNumber: 1,
      seedValue: '1',
      participantId: getPositionParticipantId(1),
    },
  ];
  result = tournamentEngine.assignSeedPositions({
    structureId: mainStructureId,
    assignments,
    eventId,
    drawId,
  });
  expect(result?.success).toEqual(true);

  // drawPositions are already assigned, so drawPosition 2 is not valid for 1st seed
  assignments = [
    {
      seedNumber: 1,
      seedValue: '1',
      participantId: getPositionParticipantId(2),
    },
  ];
  result = tournamentEngine.assignSeedPositions({
    structureId: mainStructureId,
    assignments,
    eventId,
    drawId,
  });
  expect(result?.error).not.toBeUndefined();

  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();

  const matchUp = upcomingMatchUps[0];
  const { matchUpId } = matchUp;
  const matchUpFormat = 'SET1-S:T10';
  tournamentEngine.setMatchUpStatus({
    matchUpFormat,
    matchUpId,
    drawId,
  });
  const { upcomingMatchUps: modifiedUpcoming } = tournamentEngine.tournamentMatchUps();
  const modifiedMatchUp = modifiedUpcoming[0];
  expect(modifiedMatchUp.matchUpId).toEqual(matchUpId);
  expect(modifiedMatchUp.matchUpFormat).toEqual(matchUpFormat);

  const secondMatchUpFormat = 'SET3-S:T10';
  const sets = parseScoreString({ scoreString: '6-3' });
  const score = { sets };
  result = tournamentEngine.setMatchUpStatus({
    matchUpFormat: secondMatchUpFormat,
    outcome: { score },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(targetMatchUp.matchUpFormat).toEqual(secondMatchUpFormat);
  expect(targetMatchUp.winningSide).toBeUndefined();
});

it('can set tournament names', () => {
  let result = tournamentEngine.newTournamentRecord({ startDate: 'invalid' });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.newTournamentRecord({ endDate: 'invalid' });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);

  const tournamentName = 'CourtHive Challenge';
  result = tournamentEngine.setTournamentName({
    tournamentName,
  });
  expect(result?.success).toEqual(true);

  let { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.tournamentName).toEqual(tournamentName);

  result = tournamentEngine.setTournamentName({ formalName: tournamentName });
  expect(result?.success).toEqual(true);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  expect(tournamentRecord.formalName).toBeUndefined();

  result = tournamentEngine.setTournamentName({ formalName: 'Formal Name' });
  expect(result?.success).toEqual(true);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  expect(tournamentRecord.formalName).toEqual('Formal Name');

  result = tournamentEngine.setTournamentName({
    promotionalName: tournamentName,
  });
  expect(result?.success).toEqual(true);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  expect(tournamentRecord.promotionalName).toBeUndefined();

  result = tournamentEngine.setTournamentName({
    formalName: 'Promotional Name',
  });
  expect(result?.success).toEqual(true);

  ({ tournamentRecord } = tournamentEngine.getTournament());
  expect(tournamentRecord.formalName).toEqual('Promotional Name');
});

it('can set tournament categories', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result?.success).toEqual(true);

  const categories = [
    {
      categoryName: 'U18',
      type: eventConstants.AGE,
    },
    {
      categoryName: 'U16',
      type: eventConstants.AGE,
    },
    {
      categoryName: 'WTN',
      type: eventConstants.RATING,
    },
    {
      categoryName: 'FAILURE',
    },
  ];
  result = tournamentEngine.setTournamentCategories({ categories });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.tournamentCategories.length).toEqual(3);

  result = tournamentEngine.setTournamentCategories();
  expect(result.success).toEqual(true);
});
