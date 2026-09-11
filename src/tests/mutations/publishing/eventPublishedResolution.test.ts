import { isEventPublished } from '@Query/readModel/readModelPublish';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { cast } from '@Query/readModel/cast';
import { describe, expect, it } from 'vitest';

/**
 * Regression: `events.published` was `!!getEventPublishStatus({ event })`. unPublishEvent
 * leaves the PUBLISH.STATUS timeItem in place with an envelope of undefined-valued keys,
 * so the flag stayed TRUE while every matchUp of the event correctly reported false — an
 * internally inconsistent read model.
 */
describe('isEventPublished resolves through the publish cascade', () => {
  it('an unpublished event projects published=false despite the retained envelope', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'evt-pub-res' },
      drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
      startDate: '2025-01-01',
      endDate: '2025-01-14',
      completeAllMatchUps: true,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    const eventId = tournamentEngine.getTournament().tournamentRecord.events[0].eventId;

    expect(tournamentEngine.publishEvent({ eventId }).success).toEqual(true);
    const published: any = cast({ tournamentRecord: tournamentEngine.getTournament().tournamentRecord })?.rows;
    expect(published.events[0].published).toEqual(true);
    expect(published.match_ups.length).toBeGreaterThan(0);
    expect(published.match_ups.every((row: any) => row.published)).toEqual(true);

    expect(tournamentEngine.unPublishEvent({ eventId }).success).toEqual(true);
    const record = tournamentEngine.getTournament().tournamentRecord;

    // the trap this exists for: the envelope is retained, truthy, and NOT key-empty —
    // JSON.stringify renders it as `{}` only because it omits undefined values.
    const status: any = getEventPublishStatus({ event: record.events[0] });
    expect(!!status).toEqual(true);
    expect(Object.keys(status).length).toBeGreaterThan(0);
    expect(JSON.stringify(status)).toEqual('{}');

    const dark: any = cast({ tournamentRecord: record })?.rows;
    expect(dark.events[0].published).toEqual(false);
    expect(dark.match_ups.length).toBeGreaterThan(0);
    expect(dark.match_ups.some((row: any) => row.published)).toEqual(false);
  });

  it('covers each envelope shape the cascade distinguishes', () => {
    expect(isEventPublished(undefined)).toEqual(false); // no PUBLISH.STATUS
    expect(isEventPublished({ structureIds: undefined, drawIds: undefined })).toEqual(false); // post-unpublish
    expect(isEventPublished({ drawDetails: {} })).toEqual(true); // empty enumeration → all published
    expect(isEventPublished({ drawDetails: { d1: { publishingDetail: { published: true } } } })).toEqual(true);
    expect(isEventPublished({ drawDetails: { d1: { publishingDetail: { published: false } } } })).toEqual(false);
    expect(
      isEventPublished({
        drawDetails: { d1: { publishingDetail: { published: false } }, d2: { publishingDetail: { published: true } } },
      }),
    ).toEqual(true); // any published draw publishes the event
    expect(isEventPublished({ drawIds: [] })).toEqual(false); // legacy v1, none listed
    expect(isEventPublished({ drawIds: ['d1'] })).toEqual(true); // legacy v1
    expect(isEventPublished({ published: true })).toEqual(true); // legacy event-level flag
    expect(isEventPublished({ published: false })).toEqual(false);
    // seeding is an INDEPENDENT surface — published seeding with no published draw still
    // makes the event published, and unPublishEventSeeding leaves the key with published:false
    expect(isEventPublished({ seeding: { published: true, drawIds: [] } })).toEqual(true);
    expect(isEventPublished({ seeding: { published: false } })).toEqual(false);
    expect(
      isEventPublished({
        seeding: { published: true },
        drawDetails: { d1: { publishingDetail: { published: false } } },
      }),
    ).toEqual(true);
  });
});
