import { setSubscriptions } from '@Global/state/globalState';
import * as readModel from '@Query/readModel';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `drawOtherIds` is the draw-grain member of the `Unified*ID` family, added because an
 * outside organisation's draw-grain object is often the only grain that carries identity
 * worth addressing.
 *
 * UTR is the motivating case and drives the shape: a UTR "flight" is a real remote object
 * with its own GUID, and UTR has **no event-grain object at all** — the CODES event above
 * it is a synthetic gender × matchUpType grouping. So `eventId` must be legitimately
 * absent rather than unknown, which is why every id attribute is independently optional.
 */
describe('addDrawOtherId', () => {
  function seed() {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    return { drawId, eventId };
  }

  const drawOf = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;

  it('records the UTR shape — tournament + draw, NO event, because UTR has no event grain', () => {
    const { drawId } = seed();

    const result: any = tournamentEngine.addDrawOtherId({
      uniqueOrganisationName: 'Universal Tennis',
      otherDrawId: '77f3990b-83c8-4d2b-8bd9-8ca3c646d879',
      otherTournamentId: '306618',
      organisationId: 'UTR',
      isOrigin: true,
      drawId,
    });
    expect(result.success).toEqual(true);

    const [entry] = drawOf(drawId).drawOtherIds;
    expect(entry.organisationId).toEqual('UTR');
    expect(entry.tournamentId).toEqual('306618');
    expect(entry.drawId).toEqual('77f3990b-83c8-4d2b-8bd9-8ca3c646d879');
    expect(entry.isOrigin).toEqual(true);
    expect(entry.createdAt).toBeDefined();
    // absent, not null — the attribute is omitted when the origin does not model it
    expect('eventId' in entry).toEqual(false);
    // theirs, never ours
    expect(entry.drawId).not.toEqual(drawId);
  });

  it('carries eventId when the origin DOES model events', () => {
    const { drawId } = seed();

    tournamentEngine.addDrawOtherId({
      otherTournamentId: 'ita-4471',
      otherEventId: 'ita-ev-9',
      otherDrawId: 'ita-draw-3',
      organisationId: 'ITA',
      drawId,
    });

    const [entry] = drawOf(drawId).drawOtherIds;
    expect(entry.eventId).toEqual('ita-ev-9');
  });

  it('upserts on organisationId and is idempotent', () => {
    const { drawId } = seed();

    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', drawId });
    const result: any = tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', drawId });
    expect(result.success).toEqual(true);
    expect(drawOf(drawId).drawOtherIds).toHaveLength(1);
    expect(drawOf(drawId).drawOtherIds[0].updatedAt).toBeUndefined();

    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-2', drawId });
    expect(drawOf(drawId).drawOtherIds).toHaveLength(1);
    expect(drawOf(drawId).drawOtherIds[0].drawId).toEqual('flight-2');
    expect(drawOf(drawId).drawOtherIds[0].updatedAt).toBeDefined();
  });

  it('REFUSES to move isOrigin to a second organisation', () => {
    const { drawId } = seed();

    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', isOrigin: true, drawId });
    const result: any = tournamentEngine.addDrawOtherId({
      organisationId: 'ITA',
      otherDrawId: 'ita-draw-3',
      isOrigin: true,
      drawId,
    });
    expect(result.error).toBeDefined();
    expect(result.info).toContain('UTR');
    expect(readModel.drawOrigin(drawOf(drawId))?.organisationId).toEqual('UTR');
  });

  it('requires organisationId and at least one origin-side id', () => {
    const { drawId } = seed();
    expect(tournamentEngine.addDrawOtherId({ otherDrawId: 'x', drawId }).error).toBeDefined();
    expect(tournamentEngine.addDrawOtherId({ organisationId: 'UTR', drawId }).error).toBeDefined();
  });

  it('fires MODIFY_DRAW_DEFINITION on a real change and stays silent on a no-op', () => {
    const { drawId } = seed();

    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: (n: any[]) => notices.push(...n) } });

    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', drawId });
    const afterFirst = notices.length;
    expect(afterFirst).toBeGreaterThan(0);

    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', drawId });
    expect(notices.length).toEqual(afterFirst); // idempotent re-apply emitted nothing

    setSubscriptions({ subscriptions: {} });
  });
});

describe('setDrawOtherIds', () => {
  function seed() {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    return drawId;
  }

  const drawOf = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;

  it('replaces wholesale, which is how the origin is re-pointed', () => {
    const drawId = seed();
    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', isOrigin: true, drawId });

    const result: any = tournamentEngine.setDrawOtherIds({
      drawOtherIds: [{ organisationId: 'ITA', drawId: 'ita-draw-3', isOrigin: true }],
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(readModel.drawOrigin(drawOf(drawId))?.organisationId).toEqual('ITA');
  });

  it('clears on null', () => {
    const drawId = seed();
    tournamentEngine.addDrawOtherId({ organisationId: 'UTR', otherDrawId: 'flight-1', drawId });

    const result: any = tournamentEngine.setDrawOtherIds({ drawOtherIds: null, drawId });
    expect(result.success).toEqual(true);
    expect(drawOf(drawId).drawOtherIds).toBeUndefined();
  });

  it('REJECTS two isOrigin entries and leaves the draw untouched', () => {
    const drawId = seed();

    const result: any = tournamentEngine.setDrawOtherIds({
      drawOtherIds: [
        { organisationId: 'UTR', drawId: 'flight-1', isOrigin: true },
        { organisationId: 'ITA', drawId: 'ita-draw-3', isOrigin: true },
      ],
      drawId,
    });
    expect(result.error).toBeDefined();
    expect(drawOf(drawId).drawOtherIds).toBeUndefined();
  });
});

describe('drawOrigin + the draws read-model row', () => {
  it('projects each grain independently — UTR leaves origin_event_id null', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    tournamentEngine.addDrawOtherId({
      otherDrawId: '77f3990b-83c8-4d2b-8bd9-8ca3c646d879',
      otherTournamentId: '306618',
      organisationId: 'UTR',
      isOrigin: true,
      drawId,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const draw = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const row = readModel.drawRow(draw, tournamentRecord.tournamentId, eventId, 'PROV');

    expect(row.origin_organisation_id).toEqual('UTR');
    expect(row.origin_tournament_id).toEqual('306618');
    expect(row.origin_draw_id).toEqual('77f3990b-83c8-4d2b-8bd9-8ca3c646d879');
    expect(row.origin_event_id).toBeNull(); // UTR has no event grain
    expect(row.origin_draw_id).not.toEqual(row.draw_id);
    expect(row.origin_tournament_id).not.toEqual(row.tournament_id);
  });

  it('is undefined / null when nothing is flagged', () => {
    expect(readModel.drawOrigin({ drawOtherIds: [{ organisationId: 'UTR', drawId: 'x' }] })).toBeUndefined();
    expect(readModel.drawOrigin({})).toBeUndefined();
    expect(readModel.drawOrigin(undefined)).toBeUndefined();

    const row = readModel.drawRow(
      { drawId: 'd1', drawOtherIds: [{ organisationId: 'UTR', drawId: 'x' }] },
      't1',
      null,
      undefined,
    );
    expect(row.origin_organisation_id).toBeNull();
    expect(row.origin_draw_id).toBeNull();
  });
});
