import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants and types
import { COMPASS, CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// Fixtures
import { countries } from '@Fixtures/countryData';

it('returns eventData with expected drawsData', () => {
  const drawProfiles = [{ drawSize: 4, drawType: COMPASS }];
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    setState: true,
    drawProfiles,
  });

  let result = tournamentEngine.devContext(true).modifyDrawName({
    drawName: 'This is a Draw',
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.updatedAt).not.toBeUndefined();

  result = tournamentEngine.getEventData();
  expect(result.error).toEqual(INVALID_VALUES);

  let eventData = tournamentEngine.getEventData({ eventId }).eventData;
  expect(eventData.drawsData[0].structures.length).toEqual(2);
  expect(eventData.drawsData[0].updatedAt).not.toBeUndefined();

  eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
  expect(eventData.eventInfo.published).toEqual(false);
  expect(eventData.drawsData).toBeUndefined();

  result = tournamentEngine.publishEvent({ eventId });
  expect(result.success).toEqual(true);

  eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
  expect(eventData.eventInfo.published).toEqual(true);
  expect(eventData.drawsData.length).toEqual(1);

  result = tournamentEngine.unPublishEvent({ eventId });
  expect(result.success).toEqual(true);

  eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
  expect(eventData.eventInfo.published).toEqual(false);
  expect(eventData.drawsData).toBeUndefined();

  const contextProfile = { withCompetitiveness: true };
  eventData = tournamentEngine.getEventData({ eventId, contextProfile }).eventData;
  expect(eventData.drawsData[0].structures[0].roundMatchUps[1][0].competitiveProfile.competitiveness).toBeDefined();
});

it('returns eventData when there is no drawsData', () => {
  const eventProfiles = [{ eventName: 'Test Event' }];
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });
  const { eventData } = tournamentEngine.setState(tournamentRecord).getEventData({ eventId });
  expect(eventData.drawsData.length).toEqual(0);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.drawDefinitions).toEqual([]);
});

it('returns team information for participants in SINGLES and DOUBLES matchUps in non-TEAM events', () => {
  const isoWithIOC = new Set(countries.filter(({ ioc }) => ioc).map(({ iso }) => iso));
  const mockProfile = {
    participantsProfile: {
      teamKey: { personAttribute: 'nationalityCode' },
      nationalityCodesCount: 10,
      participantsCount: 32,
    },
    drawProfiles: [{ drawSize: 32 }, { drawSize: 8, eventType: DOUBLES }],
  };
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamParticipants.length).toBeGreaterThan(0);

  let result = tournamentEngine.getEventData({
    participantsProfile: { withIOC: true, withISO2: true },
    eventId,
  });
  expect(result.eventData.drawsData[0].structures.length).toEqual(1);

  let iocCount = 0;
  result.eventData.drawsData[0].structures[0].roundMatchUps[1].forEach((matchUp) => {
    expect(matchUp.matchUpType).toEqual(SINGLES);

    // expect that each individual participant on the team also has team information
    matchUp.sides.forEach((side) => {
      expect(side.participant.person.iso2NationalityCode).not.toBeUndefined();
      if (isoWithIOC.has(side.participant.person.nationalityCode)) {
        expect(side.participant.person.iocNationalityCode).not.toBeUndefined();
        iocCount += 1;
      }
      expect(side.participant.teams.length).toEqual(1);
      expect(side.participant.groups.length).toEqual(0);
    });
  });
  expect(iocCount).toBeGreaterThan(0);

  result = tournamentEngine.getEventData({
    participantsProfile: { withIOC: true, withISO2: true },
    hydrateParticipants: false,
    eventId,
  });

  const mappedParticipants = new Map(result.participants.map((p) => [p.participantId, p]));

  result.eventData.drawsData[0].structures[0].roundMatchUps[1].forEach((matchUp) => {
    matchUp.sides.forEach((side) => {
      expect(side.participant?.participantId).toBeUndefined();
      expect(!!mappedParticipants.get(side.participantId)).toEqual(true);
    });
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    participantsProfile: { withIOC: true, withISO2: true },
  });

  iocCount = 0;
  matchUps
    .filter(({ readyToScore }) => readyToScore)
    .forEach(({ sides }) => {
      const persons = sides
        .flatMap(
          ({ participant }) => participant?.person || participant?.individualParticipants.map(({ person }) => person),
        )
        .filter(Boolean);
      persons.forEach((person) => {
        expect(person.iso2NationalityCode).not.toBeUndefined();
        if (isoWithIOC.has(person.nationalityCode)) {
          expect(person.iocNationalityCode).not.toBeUndefined();
          iocCount += 1;
        }
      });
    });
  expect(iocCount).toBeGreaterThan(0);
});

// Hydration of `competitionFormat` onto eventInfo lets consumers (e.g. epixodic
// applying INTENNSE point multipliers) read sport rules through the standard
// data flow instead of falling back to a sport-detect heuristic.
// See Mentat/planning/COMPETITION_FORMAT_HYDRATION.md.
it('hydrates competitionFormat onto eventInfo and gates it on usePublishState', () => {
  const eventId = 'cf-eid';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventId, drawType: COMPASS }],
  });

  // No public mutation exists for setting competitionFormat (planning doc
  // Phase 2 — TMX editor); the field is on the Event type already so we
  // splice it into the tournamentRecord before setState.
  const competitionFormat = { competitionFormatCode: 'INTENNSE_STANDARD' } as any;
  tournamentRecord.events!.find((e: any) => e.eventId === eventId)!.competitionFormat = competitionFormat;
  tournamentEngine.setState(tournamentRecord);

  // Default mode — competitionFormat surfaces in eventInfo
  let { eventData } = tournamentEngine.getEventData({ eventId });
  expect(eventData.eventInfo.competitionFormat).toEqual(competitionFormat);

  // usePublishState + unpublished — competitionFormat is stripped
  eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
  expect(eventData.eventInfo.published).toEqual(false);
  expect(eventData.eventInfo.competitionFormat).toBeUndefined();

  // usePublishState + published — competitionFormat returns
  tournamentEngine.publishEvent({ eventId });
  eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
  expect(eventData.eventInfo.published).toEqual(true);
  expect(eventData.eventInfo.competitionFormat).toEqual(competitionFormat);
});

test('hydrateParticipants: false reduces getEventData payload size', () => {
  const eventId = 'eid';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventId, drawType: CURTIS_CONSOLATION }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getEventData({
    participantsProfile: { withIOC: true, withISO2: true },
    eventId,
  });
  const hydratedPayload = JSON.stringify(result.eventData);

  result = tournamentEngine.getEventData({
    participantsProfile: { withIOC: true, withISO2: true },
    hydrateParticipants: false,
    eventId,
  });
  const unhydratedPayload = JSON.stringify({ eventData: result.eventData, participants: result.participants });

  // unhydrated should be meaningfully smaller since participant data is not duplicated in every matchUp
  expect(unhydratedPayload.length).toBeLessThan(hydratedPayload.length);

  // verify participants are returned separately
  expect(result.participants.length).toBeGreaterThan(0);

  // verify matchUp sides don't have embedded participant objects
  const firstMatchUp = result.eventData.drawsData[0].structures[0].roundMatchUps[1][0];
  firstMatchUp.sides.forEach((side) => {
    expect(side.participant?.participantId).toBeUndefined();
  });
});
