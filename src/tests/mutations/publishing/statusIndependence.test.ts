import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';

/**
 * Publish STATUS keys are independent. Every publish method takes a `status` (default PUBLIC) and the PUBLISH.STATUS
 * time item holds one entry per key, `{ PUBLIC: {...}, INTERNAL: {...} }`. Whatever a method does under one key, the
 * entry under every other key must read exactly as it did before.
 *
 * The matrix: each publish/unpublish pair x both key orders. Under key A, publish; under key B, publish, unpublish,
 * publish again; then unpublish A. After every step the entry of the key NOT being written is compared, whole, with
 * its snapshot. A whole-entry comparison also covers the other methods' sub-entries (event, seeding, display,
 * orderOfPlay, participants, info), so one method writing another's area under the wrong key fails here too.
 */

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const START_DATE = '2025-06-15';
const INTERNAL = 'INTERNAL';
const eventId = 'event1';
const drawId = 'draw1';

const itemType = `${PUBLISH}.${STATUS}`;
const latest = (timeItems?: any[]) => (timeItems ?? []).filter((item) => item.itemType === itemType).at(-1);

// the stored entry for one key, read from the record itself (not through a publish query, which could mask a write)
const storedEntry = (element: 'event' | 'tournament', status: string) => {
  const timeItems =
    element === 'event'
      ? tournamentEngine.getEvent({ eventId }).event?.timeItems
      : tournamentEngine.getTournament().tournamentRecord?.timeItems;
  const value = latest(timeItems)?.itemValue?.[status];
  return value === undefined ? undefined : structuredClone(value);
};

type Op = {
  element: 'event' | 'tournament';
  publish: (status: string) => any;
  unPublish: (status: string) => any;
  name: string;
};

const ops: Op[] = [
  {
    name: 'publishEvent / unPublishEvent',
    element: 'event',
    publish: (status) => tournamentEngine.publishEvent({ eventId, status }),
    unPublish: (status) => tournamentEngine.unPublishEvent({ eventId, status }),
  },
  {
    name: 'publishEvent with an embargo',
    element: 'event',
    publish: (status) =>
      tournamentEngine.publishEvent({ eventId, status, drawDetails: { [drawId]: { embargo: FUTURE_EMBARGO } } }),
    unPublish: (status) => tournamentEngine.unPublishEvent({ eventId, status }),
  },
  {
    name: 'publishEventSeeding / unPublishEventSeeding',
    element: 'event',
    publish: (status) => tournamentEngine.publishEventSeeding({ eventId, status, drawIds: [drawId] }),
    unPublish: (status) => tournamentEngine.unPublishEventSeeding({ eventId, status }),
  },
  {
    name: 'setEventDisplay',
    element: 'event',
    publish: (status) =>
      tournamentEngine.setEventDisplay({ eventId, status, displaySettings: { draws: { default: { visible: true } } } }),
    unPublish: (status) =>
      tournamentEngine.setEventDisplay({
        eventId,
        status,
        displaySettings: { draws: { default: { visible: false } } },
      }),
  },
  {
    name: 'publishOrderOfPlay / unPublishOrderOfPlay',
    element: 'tournament',
    publish: (status) => tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status }),
    unPublish: (status) => tournamentEngine.unPublishOrderOfPlay({ status }),
  },
  {
    name: 'publishOrderOfPlay with an embargo',
    element: 'tournament',
    publish: (status) =>
      tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], embargo: FUTURE_EMBARGO, status }),
    unPublish: (status) => tournamentEngine.unPublishOrderOfPlay({ status }),
  },
  {
    name: 'publishParticipants / unPublishParticipants',
    element: 'tournament',
    publish: (status) => tournamentEngine.publishParticipants({ status }),
    unPublish: (status) => tournamentEngine.unPublishParticipants({ status }),
  },
  {
    name: 'publishTournamentInfo / unPublishTournamentInfo',
    element: 'tournament',
    publish: (status) => tournamentEngine.publishTournamentInfo({ status }),
    unPublish: (status) => tournamentEngine.unPublishTournamentInfo({ status }),
  },
];

const orders = [
  [PUBLIC, INTERNAL],
  [INTERNAL, PUBLIC],
];

function setup() {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate: START_DATE,
    setState: true,
  });
}

describe('publish STATUS keys are independent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(ops)('$name', (op) => {
    it.each(orders)('%s first, then %s: the other key is untouched by every step', (first, second) => {
      setup();
      let result: any = op.publish(first);
      expect(result.success).toEqual(true);
      const firstEntry = storedEntry(op.element, first);
      expect(firstEntry).toBeDefined();

      result = op.publish(second);
      expect(result.success).toEqual(true);
      expect(storedEntry(op.element, first)).toEqual(firstEntry);
      expect(storedEntry(op.element, second)).toBeDefined();

      result = op.unPublish(second);
      expect(result.success).toEqual(true);
      expect(storedEntry(op.element, first)).toEqual(firstEntry);

      result = op.publish(second);
      expect(result.success).toEqual(true);
      const secondEntry = storedEntry(op.element, second);
      expect(storedEntry(op.element, first)).toEqual(firstEntry);

      result = op.unPublish(first);
      expect(result.success).toEqual(true);
      expect(storedEntry(op.element, second)).toEqual(secondEntry);
    });
  });

  // interleaved: everything published under PUBLIC, then every method run under INTERNAL in turn
  it('every method under INTERNAL leaves a fully published PUBLIC entry exactly as it was', () => {
    setup();
    for (const op of ops) expect(op.publish(PUBLIC).success).toEqual(true);
    const publicEvent = storedEntry('event', PUBLIC);
    const publicTournament = storedEntry('tournament', PUBLIC);

    for (const op of ops) {
      expect(op.publish(INTERNAL).success).toEqual(true);
      expect(op.unPublish(INTERNAL).success).toEqual(true);
      expect(storedEntry('event', PUBLIC)).toEqual(publicEvent);
      expect(storedEntry('tournament', PUBLIC)).toEqual(publicTournament);
    }
  });

  // the matrix checks the key NOT written; these check that the written key gets what was asked. unPublishEventSeeding
  // read the PUBLIC entry whatever status it was given, so under another key it unpublished nothing (no PUBLIC entry)
  // or rebuilt that key from PUBLIC's seeding
  it('unPublishEventSeeding under INTERNAL unpublishes INTERNAL seeding when PUBLIC has none', () => {
    setup();
    tournamentEngine.publishEventSeeding({ eventId, status: INTERNAL, drawIds: [drawId] });
    expect(storedEntry('event', INTERNAL)?.seeding?.published).toEqual(true);

    const result: any = tournamentEngine.unPublishEventSeeding({ eventId, status: INTERNAL });
    expect(result.success).toEqual(true);
    expect(storedEntry('event', INTERNAL)?.seeding?.published).toEqual(false);
    expect(storedEntry('event', PUBLIC)).toBeUndefined();
  });

  it("unPublishEventSeeding removes drawIds from its own key's list, not from PUBLIC's", () => {
    setup();
    tournamentEngine.publishEventSeeding({ eventId, status: PUBLIC, drawIds: ['publicOnly'] });
    tournamentEngine.publishEventSeeding({ eventId, status: INTERNAL, drawIds: [drawId, 'internalOnly'] });

    tournamentEngine.unPublishEventSeeding({ eventId, status: INTERNAL, drawIds: [drawId] });
    expect(storedEntry('event', INTERNAL)?.seeding?.drawIds).toEqual(['internalOnly']);
    expect(storedEntry('event', PUBLIC)?.seeding?.drawIds).toEqual(['publicOnly']);
  });

  // getPublishState read PUBLIC only: an event published under INTERNAL read as unpublished, whatever was asked
  it.each(orders)('getPublishState answers for the key it is given (%s published, %s not)', (published, other) => {
    setup();
    tournamentEngine.publishEvent({ eventId, status: published });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: published });

    const own: any = tournamentEngine.getPublishState({ status: published }).publishState;
    expect(own[eventId].status.published).toEqual(true);
    expect(own.tournament.orderOfPlay?.published).toEqual(true);
    expect(tournamentEngine.getPublishState({ eventId, status: published }).publishState.status.published).toEqual(
      true,
    );

    const others: any = tournamentEngine.getPublishState({ status: other }).publishState;
    expect(others[eventId].status.published).toEqual(false);
    expect(others.tournament.orderOfPlay?.published).toBeUndefined();
  });

  // reads: a draw published under one key is visible to that key's read and invisible to the other's
  it.each(orders)('getEventData reads only its own key (%s published, %s not)', (published, other) => {
    setup();
    tournamentEngine.publishEvent({ eventId, status: published });

    const own = tournamentEngine.getEventData({ eventId, usePublishState: true, status: published });
    expect(own.eventData?.drawsData?.map((draw) => draw.drawId)).toEqual([drawId]);

    const others = tournamentEngine.getEventData({ eventId, usePublishState: true, status: other });
    expect(others.eventData?.drawsData ?? []).toEqual([]);
  });
});
