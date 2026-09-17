import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import { tournamentRow } from '@Query/readModel/readModelRows';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { globalState } from '../../..';

// constants
import { PUBLISH_TOURNAMENT_INFO, UNPUBLISH_TOURNAMENT, UNPUBLISH_TOURNAMENT_INFO } from '@Constants/topicConstants';
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Publishing a tournament's INFORMATION — punch list P23, option A.
 *
 * Before this, a tournament with no draw could not be public: every published component needed a draw
 * (events) or a schedule/roster (order of play, participants). These tests seed tournaments whose
 * events have NO draws, which is the registration-phase shape the feature exists for.
 */

function seedDrawless() {
  const {
    eventIds,
    tournamentRecord: { tournamentId },
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Open Singles' }, { eventName: 'Open Doubles', eventType: 'DOUBLES' }],
    setState: true,
  });
  return { eventIds, tournamentId };
}

function subscribe() {
  const notices: Record<string, any[]> = {};
  const capture = (topic: string) => (payloads: any[]) => (notices[topic] ??= []).push(...payloads);
  globalState.setSubscriptions({
    subscriptions: {
      [PUBLISH_TOURNAMENT_INFO]: capture(PUBLISH_TOURNAMENT_INFO),
      [UNPUBLISH_TOURNAMENT_INFO]: capture(UNPUBLISH_TOURNAMENT_INFO),
      [UNPUBLISH_TOURNAMENT]: capture(UNPUBLISH_TOURNAMENT),
    },
  });
  return notices;
}

const record = () => tournamentEngine.getTournament().tournamentRecord;
const listedEventIds = () =>
  tournamentEngine
    .getTournamentInfo({ usePublishState: true })
    .tournamentInfo.eventInfo.map((info: any) => info.eventId)
    .toSorted((a: string, b: string) => a.localeCompare(b));

describe('publishTournamentInfo', () => {
  it('makes a tournament with no draws published, everywhere the roll-up is read', () => {
    const { eventIds } = seedDrawless();
    expect(eventIds).toHaveLength(2);
    expect(isTournamentPublished(record())).toBe(false);

    const result = tournamentEngine.publishTournamentInfo();
    expect(result.success).toBe(true);

    const { publishState } = tournamentEngine.getPublishState();
    expect(publishState.tournament.info).toEqual({ published: true });
    expect(publishState.tournament.status.published).toBe(true);
    // no event gained a published state: information is not an event publish
    expect(publishState.tournament.status.publishedEventIds).toEqual([]);
    expect(isTournamentPublished(record())).toBe(true);
    expect(tournamentRow(record()).published).toBe(true);
  });

  it('lists every event when unscoped, and only the scoped events when eventIds is given', () => {
    const { eventIds } = seedDrawless();
    const sorted = [...eventIds].toSorted((a, b) => a.localeCompare(b));

    // control: nothing is listed before anything is published
    expect(listedEventIds()).toEqual([]);

    tournamentEngine.publishTournamentInfo();
    expect(listedEventIds()).toEqual(sorted);

    tournamentEngine.publishTournamentInfo({ eventIds: [eventIds[0]] });
    expect(listedEventIds()).toEqual([eventIds[0]]);
    expect(tournamentEngine.getPublishState().publishState.tournament.info).toEqual({
      eventIds: [eventIds[0]],
      published: true,
    });
  });

  it('an event with a published draw is listed whether or not it is in the information scope', () => {
    const {
      eventIds: [drawnEventId, drawlessEventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      eventProfiles: [{ eventName: 'Not yet drawn' }],
      setState: true,
    });
    expect(drawnEventId).toBeDefined();
    expect(drawlessEventId).toBeDefined();

    tournamentEngine.publishEvent({ eventId: drawnEventId });
    tournamentEngine.publishTournamentInfo({ eventIds: [drawlessEventId] });

    expect(listedEventIds()).toEqual([drawnEventId, drawlessEventId].toSorted((a, b) => a.localeCompare(b)));
  });

  it('refuses unknown or malformed eventIds and leaves the publish state untouched', () => {
    seedDrawless();
    const before = tournamentEngine.getPublishState().publishState;

    let result: any = tournamentEngine.publishTournamentInfo({ eventIds: ['no-such-event'] });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
    result = tournamentEngine.publishTournamentInfo({ eventIds: 'not-an-array' });
    expect(result.error).toEqual(INVALID_VALUES);

    expect(tournamentEngine.getPublishState().publishState).toEqual(before);
    expect(isTournamentPublished(record())).toBe(false);
  });

  it('never opens registration: the registration profile is untouched (D5)', () => {
    seedDrawless();
    const registrationProfile = { entriesOpen: '2027-05-01', entriesClose: '2027-05-20' };
    tournamentEngine.setRegistrationProfile({ registrationProfile });
    const before = record().registrationProfile;
    expect(before).toMatchObject(registrationProfile);

    tournamentEngine.publishTournamentInfo();
    expect(record().registrationProfile).toEqual(before);

    tournamentEngine.unPublishTournamentInfo();
    expect(record().registrationProfile).toEqual(before);
  });

  it('announces itself with the tournamentId', () => {
    const { tournamentId } = seedDrawless();
    const notices = subscribe();

    tournamentEngine.publishTournamentInfo();

    expect(notices[PUBLISH_TOURNAMENT_INFO]).toEqual([{ tournamentId }]);
  });
});

describe('unPublishTournamentInfo', () => {
  it('returns a tournament with nothing else published to unpublished, and announces the transition', () => {
    const { tournamentId } = seedDrawless();
    tournamentEngine.publishTournamentInfo();
    const notices = subscribe();

    const result = tournamentEngine.unPublishTournamentInfo();

    expect(result.success).toBe(true);
    expect(tournamentEngine.getPublishState().publishState.tournament.info).toBeUndefined();
    expect(isTournamentPublished(record())).toBe(false);
    expect(listedEventIds()).toEqual([]);
    expect(notices[UNPUBLISH_TOURNAMENT_INFO]).toEqual([{ tournamentId }]);
    expect(notices[UNPUBLISH_TOURNAMENT]).toHaveLength(1);
  });

  it('keeps the tournament published, and silent, while another component is published', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo();
    tournamentEngine.publishParticipants();
    const notices = subscribe();

    tournamentEngine.unPublishTournamentInfo();

    expect(isTournamentPublished(record())).toBe(true);
    expect(notices[UNPUBLISH_TOURNAMENT_INFO]).toHaveLength(1);
    expect(notices[UNPUBLISH_TOURNAMENT]).toBeUndefined();
  });

  it('does not disturb the order of play or participant publish state beside it', () => {
    seedDrawless();
    tournamentEngine.publishOrderOfPlay();
    tournamentEngine.publishParticipants();
    tournamentEngine.publishTournamentInfo();

    tournamentEngine.unPublishTournamentInfo();

    const { tournament } = tournamentEngine.getPublishState().publishState;
    expect(tournament.orderOfPlay?.published).toBe(true);
    expect(tournament.participants?.published).toBe(true);
    expect(tournament.info).toBeUndefined();
  });
});
