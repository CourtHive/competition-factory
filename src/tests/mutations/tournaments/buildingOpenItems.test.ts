import { describe, expect, test } from 'vitest';

import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants
import { MODIFY_PARTICIPANTS, PUBLISH_EVENT } from '@Constants/topicConstants';
import { DRAW_DEFINITION_NOT_FOUND, INVALID_VALUES, VENUE_EXISTS } from '@Constants/errorConditionConstants';

const LATER = '2030-01-01T00:00:00.000Z';

/**
 * building-a-tournament.md § 8, items 11 to 14: what a write stores does not depend on who is listening, a refusal
 * writes nothing, an unresolved drawId names nothing, and the caller's objects are not written.
 */
function factoryStampAfter(subscribed: boolean, topic: string, write: (ids: any) => any) {
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);
  const participantId = tournamentRecord.participants[0].participantId;
  setSubscriptions({ subscriptions: subscribed ? { [topic]: () => undefined } : {} });
  setClock(LATER);
  const result = write({ eventId, participantId });
  setClock();
  setSubscriptions({ subscriptions: {} });
  expect(result.success).toEqual(true);
  return tournamentEngine.getTournament().tournamentRecord.factory?.timeStamp;
}

describe('notices independent of subscriptions (item 11)', () => {
  test('publishEvent stamps the record with or without a subscriber', () => {
    const publish = ({ eventId }) => tournamentEngine.publishEvent({ eventId });
    const stamped = new Date(LATER).getTime();
    expect(factoryStampAfter(true, PUBLISH_EVENT, publish)).toEqual(stamped);
    expect(factoryStampAfter(false, PUBLISH_EVENT, publish)).toEqual(stamped);
  });

  test('setParticipantScaleItem stamps a changed value with or without a subscriber, and an unchanged one not at all', () => {
    const scaleItem = { scaleType: 'RATING', eventType: 'SINGLES', scaleName: 'WTN', scaleValue: 8.3 };
    const set = ({ participantId }) => tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
    const stamped = new Date(LATER).getTime();
    expect(factoryStampAfter(true, MODIFY_PARTICIPANTS, set)).toEqual(stamped);
    expect(factoryStampAfter(false, MODIFY_PARTICIPANTS, set)).toEqual(stamped);

    const unchanged = factoryStampAfter(false, MODIFY_PARTICIPANTS, ({ participantId }) => {
      tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
      setClock('2031-01-01T00:00:00.000Z');
      const result: any = tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
      expect(result.info).toBeDefined();
      return result;
    });
    // the second call changed nothing, and so did not restamp the record
    expect(unchanged).toEqual(stamped);
  });
});

describe('addCourts writes all its courts or none (item 12)', () => {
  const venueWith = () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const venueId = 'v';
    tournamentEngine.addVenue({ venue: { venueId, venueName: 'V' } });
    return venueId;
  };
  const courtsOf = (venueId: string) => tournamentEngine.findVenue({ venueId }).venue.courts ?? [];

  test('a numeric string courtsCount is its number', () => {
    const venueId = venueWith();
    const result: any = tournamentEngine.addCourts({ venueId, courtsCount: '2' as any });
    expect(result.success).toEqual(true);
    expect(courtsOf(venueId).length).toEqual(2);
  });

  test('a court that cannot be added refuses the call before any court is stored', () => {
    const venueId = venueWith();
    let result: any = tournamentEngine.addCourts({ venueId, courtsCount: 3, courtIds: ['c1', 'c2', 'c1'] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(courtsOf(venueId)).toEqual([]);

    result = tournamentEngine.addCourts({ venueId, courtsCount: 1, courtIds: ['c1'] });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addCourts({ venueId, courtsCount: 2, courtIds: ['c2', 'c1'] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(courtsOf(venueId).map(({ courtId }) => courtId)).toEqual(['c1']);
  });
});

describe('attachPolicies with an unresolved drawId (item 13)', () => {
  test('refuses, and attaches nothing', () => {
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const before = tournamentEngine.getTournament().tournamentRecord.extensions;
    const result: any = tournamentEngine.attachPolicies({
      policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
      drawId: 'nowhere',
    });
    expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
    expect(tournamentEngine.getTournament().tournamentRecord.extensions).toEqual(before);
  });
});

describe("the caller's objects are not written (item 14)", () => {
  test('addVenue mints the id onto its own copy, and a refusal creates no venues', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const venue: any = { venueName: 'V', defaultStartTime: '08:00' };
    let result: any = tournamentEngine.addVenue({ venue });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getTournament().tournamentRecord.venues).toBeUndefined();

    delete venue.defaultStartTime;
    result = tournamentEngine.addVenue({ venue });
    expect(result.success).toEqual(true);
    expect(venue.venueId).toBeUndefined();
    const { venueId } = result.venue;
    expect(tournamentEngine.addVenue({ venue: { venueId } }).error).toEqual(VENUE_EXISTS);

    // the stored venue is not the caller's object
    venue.venueName = 'changed';
    expect(tournamentEngine.findVenue({ venueId }).venue.venueName).toEqual('V');
  });

  test('addTournamentExtension stamps createdAt onto its own copy', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const extension: any = { name: 'note', value: { a: 1 } };
    const result: any = tournamentEngine.addTournamentExtension({ extension });
    expect(result.success).toEqual(true);
    expect(extension.createdAt).toBeUndefined();
    const stored = tournamentEngine.getTournament().tournamentRecord.extensions.find(({ name }) => name === 'note');
    expect(stored.createdAt).toBeDefined();
  });
});
