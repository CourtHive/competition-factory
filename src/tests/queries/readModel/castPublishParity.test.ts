import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { cast } from '@Query/readModel/cast';
import { expect, it, describe } from 'vitest';

import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

// The read model's publish resolution must agree with getEventData (the oracle a
// public consumer would otherwise re-query). These assert parity for the two
// disclosure gaps the adversarial challenge confirmed.
describe('cast() publish parity with getEventData', () => {
  // #4 — a per-structure roundLimit hides rounds beyond the limit in getEventData;
  // cast() must mark those match_ups published:false, not expose them.
  it('roundLimit: cast published match_ups == getEventData visible matchUps (AD_HOC)', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: SINGLES_EVENT, drawType: AD_HOC, automated: true, roundsCount: 3, drawSize: 20 }],
      participantsProfile: { idPrefix: 'P' },
    });
    tournamentEngine.setState(tournamentRecord);
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;

    tournamentEngine.publishEvent({
      eventId,
      removePriorValues: true,
      drawDetails: { [drawId]: { structureDetails: { [structureId]: { roundLimit: 1, published: true } } } },
    });

    // getEventData oracle: the matchUpIds it actually exposes under usePublishState.
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const structure = eventData.drawsData[0].structures.find((s: any) => s.structureId === structureId);
    const visibleIds = new Set<string>(
      Object.values(structure?.roundMatchUps ?? {}).flatMap((ms: any) => ms.map((m: any) => m.matchUpId)),
    );

    // cast(): the match_ups it marks published for the same structure.
    const record = tournamentEngine.getTournament().tournamentRecord;
    const rows: any = cast({ tournamentRecord: record }).rows;
    const castPublishedIds = new Set<string>(
      rows.match_ups.filter((r: any) => r.structure_id === structureId && r.published).map((r: any) => r.match_up_id),
    );

    expect([...castPublishedIds].sort()).toEqual([...visibleIds].sort());
    // sanity: rounds beyond the limit exist but are NOT published by cast.
    const beyondLimit = rows.match_ups.filter((r: any) => r.structure_id === structureId && (r.round_number ?? 0) > 1);
    expect(beyondLimit.length).toBeGreaterThan(0);
    expect(beyondLimit.every((r: any) => r.published === false)).toBe(true);
  });

  // #3 — multi-level embargo. A lifted (earlier) draw embargo must not unmask a
  // later structure embargo; cast() stores the LATEST applicable release.
  it('embargo: cast stores the max of draw + structure embargoes, not the higher-precedence one', () => {
    const EARLY = '2020-01-01T00:00:00.000Z';
    const LATE = '2999-01-01T00:00:00.000Z';
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, eventName: 'S' }] });
    tournamentEngine.setState(tournamentRecord);
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;

    tournamentEngine.publishEvent({
      eventId,
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: EARLY },
          structureDetails: { [structureId]: { published: true, embargo: LATE } },
        },
      },
    });

    const record = tournamentEngine.getTournament().tournamentRecord;
    const rows: any = cast({ tournamentRecord: record }).rows;
    const structureMatchUps = rows.match_ups.filter((r: any) => r.structure_id === structureId);
    expect(structureMatchUps.length).toBeGreaterThan(0);
    // the read gate (published AND embargo<=now) must stay hidden while the LATE
    // structure embargo is active — so every row carries the LATE release, not EARLY.
    expect(structureMatchUps.every((r: any) => r.embargo === LATE)).toBe(true);
  });

  // #9 — a scheduledRounds embargo redacts a round's placement in getEventData while
  // the matchUp stays visible. cast() keeps the raw venue_id (usePublishState:false)
  // but now carries schedule_embargo so a consumer can gate venue_id/court_id at read time.
  it('scheduledRounds embargo: cast carries schedule_embargo for the embargoed round', () => {
    const LATE = '2099-01-01T00:00:00.000Z';
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventName: 'S' }],
      venueProfiles: [{ venueId: 'v1', venueName: 'Club', courtsCount: 4, idPrefix: 'c' }],
      startDate: '2025-01-05',
      endDate: '2025-01-08',
    });
    tournamentEngine.setState(tournamentRecord);
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.publishEvent({
      eventId,
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: { [structureId]: { published: true, scheduledRounds: { 2: { embargo: LATE } } } },
        },
      },
    });
    const record = tournamentEngine.getTournament().tournamentRecord;
    const rows: any = cast({ tournamentRecord: record }).rows;
    const round2 = rows.match_ups.filter((r: any) => r.structure_id === structureId && r.round_number === 2);
    const round1 = rows.match_ups.filter((r: any) => r.structure_id === structureId && r.round_number === 1);
    expect(round2.length).toBeGreaterThan(0);
    expect(round2.every((r: any) => r.schedule_embargo === LATE)).toBe(true); // gated round carries the release
    expect(round1.every((r: any) => r.schedule_embargo === null)).toBe(true); // other rounds unaffected
  });

  // #10 — a matchUp scheduled with scheduledTime ONLY (a full ISO datetime, no
  // scheduledDate) must project a derived scheduled_date, not null (so the slim
  // MODIFY_MATCHUP result row cannot clobber it).
  it('scheduledTime-only matchUp: cast derives scheduled_date (not null)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventName: 'S' }],
      startDate: '2025-01-05',
      endDate: '2025-01-07',
    });
    tournamentEngine.setState(tournamentRecord);
    const mu = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.roundNumber === 1);
    tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId: mu.matchUpId, scheduledTime: '2025-01-06T14:00' });
    const record = tournamentEngine.getTournament().tournamentRecord;
    const rows: any = cast({ tournamentRecord: record }).rows;
    const row = rows.match_ups.find((r: any) => r.match_up_id === mu.matchUpId);
    expect(row.scheduled_date).toBe('2025-01-06');
  });

  // #11 — a per-matchUp matchUpFormat override is projected to match_up_format.
  it('per-matchUp matchUpFormat override is projected', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, eventName: 'S' }] });
    tournamentEngine.setState(tournamentRecord);
    const mu = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.roundNumber === 1);
    tournamentEngine.setMatchUpFormat({ drawId, matchUpId: mu.matchUpId, matchUpFormat: 'SET5-S:6/TB7' });
    const record = tournamentEngine.getTournament().tournamentRecord;
    const rows: any = cast({ tournamentRecord: record }).rows;
    const row = rows.match_ups.find((r: any) => r.match_up_id === mu.matchUpId);
    expect(row.match_up_format).toBe('SET5-S:6/TB7');
  });
});
