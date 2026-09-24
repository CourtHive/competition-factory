import { getTournamentVisibleFrom, isTournamentVisible } from '@Query/publishing/tournamentVisibility';
import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import { tournamentRow } from '@Query/readModel/readModelRows';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * The read-time information EMBARGO — punch list P23, D4(b).
 *
 * "Announce on a date." The publish is recorded immediately (intent) and readers withhold the
 * tournament until the embargo lifts, so nothing has to run at midnight to make it appear.
 *
 * The case these tests exist for is the one the original design note got wrong. D4(b) proposed that
 * readers apply `embargo IS NULL OR embargo <= now()`, which hides a tournament whose DRAW is published
 * and whose information page happens to be embargoed — a tournament that is already, legitimately,
 * public. Visibility is therefore answered here, where the roll-up lives, and the answer is a single
 * instant.
 */

const PAST = '2020-01-01T00:00:00Z';
const FUTURE = '2099-01-01T00:00:00Z';

/** A tournament whose events have NO draws: the registration-phase shape information publish is for. */
function seedDrawless() {
  const {
    eventIds,
    tournamentRecord: { tournamentId },
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Open Singles' }],
    setState: true,
  });
  return { eventIds, tournamentId };
}

/** A tournament with a draw, so it can be published by something OTHER than its information. */
function seedWithDraw() {
  const {
    eventIds,
    drawIds,
    tournamentRecord: { tournamentId },
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  return { eventIds, drawIds, tournamentId };
}

const record = () => tournamentEngine.getTournament().tournamentRecord;

describe('information embargo — storage and validation', () => {
  it('stores the embargo alongside the publish, and publishes INTENT immediately', () => {
    seedDrawless();
    expect(tournamentEngine.publishTournamentInfo({ embargo: FUTURE }).success).toEqual(true);

    const status: any = tournamentEngine.getTournamentPublishStatus({ tournamentRecord: record() });
    expect(status.info).toMatchObject({ published: true, embargo: FUTURE });
    // Intent is immediate — the roll-up does not wait for the clock.
    expect(isTournamentPublished(record())).toEqual(true);
  });

  it('REFUSES a malformed embargo rather than publishing immediately', () => {
    seedDrawless();
    const result: any = tournamentEngine.publishTournamentInfo({ embargo: 'next tuesday' });
    expect(result.error).toEqual(INVALID_VALUES);
    // Nothing was published: silently dropping the embargo would expose what was meant to be withheld.
    expect(isTournamentPublished(record())).toEqual(false);
  });

  it('omits the embargo entirely when none is given', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({});
    const status: any = tournamentEngine.getTournamentPublishStatus({ tournamentRecord: record() });
    expect(status.info.published).toEqual(true);
    expect('embargo' in status.info).toEqual(false);
  });

  it('CLEARS a previous embargo when re-published without one — "announce now"', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(FUTURE);

    tournamentEngine.publishTournamentInfo({});

    // The write REPLACES `info` rather than merging into it, so omitting the embargo removes it.
    // This is the whole of "announce now" for a caller — no separate mutation, no null sentinel —
    // and TMX's publishing panel depends on it, which is why it is pinned here rather than left as
    // an emergent property of how the object happens to be built.
    const status: any = tournamentEngine.getTournamentPublishStatus({ tournamentRecord: record() });
    expect('embargo' in status.info).toEqual(false);
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(null);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(true);
  });

  it('keeps the event scope and the embargo independent of each other', () => {
    const { eventIds } = seedDrawless();
    tournamentEngine.publishTournamentInfo({ eventIds, embargo: FUTURE });

    // Re-publishing to change the SCOPE alone also clears the embargo, for the same reason. Stated
    // so the next reader does not assume a partial update: there is no partial update.
    tournamentEngine.publishTournamentInfo({ eventIds });

    const status: any = tournamentEngine.getTournamentPublishStatus({ tournamentRecord: record() });
    expect(status.info.eventIds).toEqual(eventIds);
    expect('embargo' in status.info).toEqual(false);
  });

  it('reports the embargo among the publish state embargoes, with its active flag', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });
    const { publishState }: any = tournamentEngine.getPublishState({ tournamentRecord: record() });
    expect(publishState.embargoes).toContainEqual({ type: 'information', embargo: FUTURE, embargoActive: true });
  });
});

describe('information embargo — when the tournament becomes visible', () => {
  it('withholds an information-only tournament until the embargo lifts', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });

    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(FUTURE);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(false);
    // …and shows it once the clock passes, with no further mutation.
    expect(isTournamentVisible({ tournamentRecord: record(), asOf: '2099-01-02T00:00:00Z' })).toEqual(true);
  });

  it('accepts the instant as a Date or an ISO string, and ignores an unusable one', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });

    expect(isTournamentVisible({ tournamentRecord: record(), asOf: new Date('2099-06-01T00:00:00Z') })).toEqual(true);
    expect(isTournamentVisible({ tournamentRecord: record(), asOf: new Date('2026-01-01T00:00:00Z') })).toEqual(false);
    // An unusable `asOf` falls back to the real clock rather than being read as the epoch, which
    // would make every embargo look pending.
    expect(isTournamentVisible({ tournamentRecord: record(), asOf: 'whenever' })).toEqual(false);
    expect(isTournamentVisible({ tournamentRecord: record(), asOf: 'whenever' })).toEqual(
      isTournamentVisible({ tournamentRecord: record() }),
    );
  });

  it('treats an embargo already in the past as no embargo at all', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: PAST });

    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(null);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(true);
  });

  it('does NOT withhold a tournament whose draw is published — the case the design note got wrong', () => {
    const { drawIds, eventIds } = seedWithDraw();
    expect(tournamentEngine.publishEvent({ eventId: eventIds[0], drawIdsToAdd: drawIds }).success).toEqual(true);
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });

    // Published by the draw, and the draw is out: the information embargo withholds the information
    // page, not the tournament's existence.
    expect(isTournamentPublished(record())).toEqual(true);
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(null);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(true);
  });

  it('withholds again if that draw is unpublished, leaving information the only reason', () => {
    const { drawIds, eventIds } = seedWithDraw();
    expect(tournamentEngine.publishEvent({ eventId: eventIds[0], drawIdsToAdd: drawIds }).success).toEqual(true);
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(null);

    expect(tournamentEngine.unPublishEvent({ eventId: eventIds[0] }).success).toEqual(true);

    expect(isTournamentPublished(record())).toEqual(true); // still published — by information
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(FUTURE);
  });

  it('says nothing about an unpublished tournament: null, not a future date', () => {
    seedDrawless();
    // `published` already withholds it; returning an instant would invite a reader to treat
    // "not published" as "published later".
    expect(getTournamentVisibleFrom({ tournamentRecord: record() })).toEqual(null);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(false);
  });

  it('reports null for a record whose information carries an embargo but is NOT published', () => {
    // No engine path produces this — `unPublishTournamentInfo` deletes `info` wholesale — but an
    // IMPORTED record can carry any shape, and answering "visible from 2099" for something that is
    // not published at all invites a reader to treat "not published" as "published later".
    const imported: any = {
      tournamentId: 'imported-1',
      timeItems: [
        { itemType: 'PUBLISH.STATUS', itemValue: { PUBLIC: { info: { published: false, embargo: FUTURE } } } },
      ],
    };

    expect(isTournamentPublished(imported)).toEqual(false);
    expect(getTournamentVisibleFrom({ tournamentRecord: imported })).toEqual(null);
    expect(isTournamentVisible({ tournamentRecord: imported })).toEqual(false);
  });

  it('is unpublished, not merely invisible, once information is unpublished', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });
    tournamentEngine.unPublishTournamentInfo({});

    expect(isTournamentPublished(record())).toEqual(false);
    expect(isTournamentVisible({ tournamentRecord: record() })).toEqual(false);
  });

  it('leaves the caller’s record untouched while deriving the answer', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });
    const before = JSON.stringify(record());

    getTournamentVisibleFrom({ tournamentRecord: record() });

    expect(JSON.stringify(record())).toEqual(before);
  });
});

describe('information embargo — the read model row', () => {
  it('carries the instant, so a reader needs one clause and no roll-up arithmetic', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({ embargo: FUTURE });

    const row = tournamentRow(record());
    expect(row.published).toEqual(true);
    expect(row.visible_from).toEqual(FUTURE);
  });

  it('is null when the tournament is visible now, which is almost always', () => {
    seedDrawless();
    tournamentEngine.publishTournamentInfo({});

    const row = tournamentRow(record());
    expect(row.published).toEqual(true);
    expect(row.visible_from).toEqual(null);
  });

  it('is null for an unpublished tournament', () => {
    seedDrawless();
    expect(tournamentRow(record()).visible_from).toEqual(null);
  });
});
