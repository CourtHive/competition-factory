import { getStructureRoundProfile } from '@Query/structure/getStructureRoundProfile';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { eventConstants } from '@Constants/eventConstants';

import SEEDING_ITF_POLICY from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const { SINGLES } = eventConstants;

it('can clear matchUp schedules', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-07',
  });
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const myCourts = { venueName: 'My Courts' };
  let result = tournamentEngine.addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const event = {
    eventName: 'Test Event',
    eventType: SINGLES,
  };

  result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const values = {
    automated: true,
    drawSize: 32,
    eventId,
    seedsCount: 8,
    event: eventResult,
    policyDefinitions: { ...SEEDING_ITF_POLICY },
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const { structureId } = drawDefinition.structures[0];
  const { roundMatchUps } = getStructureRoundProfile({
    drawDefinition,
    structureId,
  });

  const matchUpIds = roundMatchUps?.[1].map((matchUp) => matchUp.matchUpId);

  const schedule = {
    scheduledTime: '08:00',
    scheduledDate: '2021-01-01',
    venueId,
  };
  result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds,
    schedule,
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let matchUpsWithScheduledTime = matchUps.filter((matchUp) => matchUp.schedule?.scheduledTime);

  expect(matchUpsWithScheduledTime.length).toEqual(matchUpIds?.length);

  result = tournamentEngine.clearScheduledMatchUps({
    ignoreMatchUpStatuses: 'invalid value',
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.clearScheduledMatchUps();
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUpsWithScheduledTime = matchUps.filter((matchUp) => matchUp.schedule?.scheduledTime);
  expect(matchUpsWithScheduledTime.length).toEqual(0);
});
