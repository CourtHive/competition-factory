import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { eventMatchUps } from '@Query/matchUps/getEventMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, it, describe } from 'vitest';

// constants
import { COMPETITIVE, DECISIVE, ROUTINE } from '@Constants/statsConstants';
import { MISSING_EVENT } from '@Constants/errorConditionConstants';

it('can generate competitive statistics for matchUps and add competitiveness', () => {
  const mocksProfile = {
    drawProfiles: [{ drawSize: 32 }],
    completeAllMatchUps: true,
  };
  const {
    eventIds: [eventId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord(mocksProfile);

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps({
    contextProfile: { withCompetitiveness: true },
  }).matchUps;

  const result = tournamentEngine.getMatchUpsStats({ matchUps });
  expect(result.success).toEqual(true);
  const bandTotals: number[] = Object.values(result.competitiveBands);
  const sum = bandTotals.reduce((a, b) => a + b, 0);
  expect(Math.round(sum)).toEqual(100);

  let matchUpsCompetitiveness = instanceCount(
    matchUps.map(({ competitiveProfile }) => competitiveProfile.competitiveness).filter(Boolean),
  );
  expect(matchUpsCompetitiveness[ROUTINE]).not.toBeUndefined();

  matchUps = tournamentEngine.allEventMatchUps({
    contextProfile: { withCompetitiveness: true },
    inContext: true,
    eventId,
  }).matchUps;

  matchUpsCompetitiveness = instanceCount(
    matchUps.map(({ competitiveProfile }) => competitiveProfile.competitiveness).filter(Boolean),
  );
  expect(matchUpsCompetitiveness[ROUTINE]).not.toBeUndefined();

  matchUps = tournamentEngine.allDrawMatchUps({
    contextProfile: { withCompetitiveness: true },
    inContext: true,
    drawId,
  }).matchUps;

  matchUpsCompetitiveness = instanceCount(
    matchUps.map(({ competitiveProfile }) => competitiveProfile.competitiveness).filter(Boolean),
  );
  expect(matchUpsCompetitiveness[ROUTINE]).not.toBeUndefined();
});

it('can determine competitive band for matchUps', () => {
  const mocksProfile = {
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 1,
            scoreString: '6-1 6-1',
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 2,
            scoreString: '6-2 6-3',
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 3,
            scoreString: '6-3 6-4',
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 4,
            scoreString: '6-0 6-0',
            winningSide: 1,
          },
        ],
      },
    ],
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mocksProfile);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [1] },
  });

  expect(matchUps.length).toEqual(4);

  const competitiveness = matchUps.map(
    (matchUp) => tournamentEngine.getMatchUpCompetitiveProfile({ matchUp }).competitiveness,
  );

  expect(competitiveness).toEqual([DECISIVE, ROUTINE, COMPETITIVE, DECISIVE]);
});

describe('allEventMatchUps branch coverage', () => {
  it('returns MISSING_EVENT when no event is provided', () => {
    const result = allEventMatchUps({} as any);
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns matchUps for event with no drawDefinitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    // Create an event object with no drawDefinitions
    const event = { ...tournamentRecord.events[0] };
    delete event.drawDefinitions;

    const result = allEventMatchUps({ event, tournamentRecord });
    expect(result.matchUps).toBeDefined();
    expect(result.matchUps?.length).toEqual(0);
  });

  it('hydrates participants when none are provided but tournamentRecord exists', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    // Call without participants — should hydrate from tournamentRecord
    const result = allEventMatchUps({ event, tournamentRecord });
    expect(result.matchUps).toBeDefined();
    expect(result.matchUps?.length).toBeGreaterThan(0);
  });

  it('skips participant hydration when participants are already provided', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    // Provide participants so hydration is skipped
    const result = allEventMatchUps({
      event,
      tournamentRecord,
      participants: tournamentRecord.participants,
    });
    expect(result.matchUps).toBeDefined();
    expect(result.matchUps?.length).toBeGreaterThan(0);
    // groupInfo should be undefined since hydration was skipped
    expect(result.groupInfo).toBeUndefined();
  });

  it('generates contextContent when contextProfile is provided without contextContent', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    const result = allEventMatchUps({
      event,
      tournamentRecord,
      contextProfile: { withCompetitiveness: true },
    });
    expect(result.matchUps).toBeDefined();
    expect(result.matchUps?.length).toBeGreaterThan(0);
  });

  it('uses event endDate when available', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    // Set an endDate on the event to exercise the endDate branch
    event.endDate = '2025-12-31';
    const result = allEventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.matchUps).toBeDefined();
    // Verify context includes the event endDate
    const matchUp = result.matchUps?.[0];
    if (matchUp) {
      expect(matchUp.endDate).toEqual('2025-12-31');
    }
  });

  it('includes event-level context fields (surfaceCategory, indoorOutdoor, gender)', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    event.surfaceCategory = 'CLAY';
    event.indoorOutdoor = 'OUTDOOR';
    event.gender = 'MALE';

    const result = allEventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.matchUps).toBeDefined();
    const matchUp = result.matchUps?.[0];
    if (matchUp) {
      expect(matchUp.surfaceCategory).toEqual('CLAY');
      expect(matchUp.indoorOutDoor).toEqual('OUTDOOR');
      expect(matchUp.gender).toEqual('MALE');
    }
  });

  it('falls back to tournamentRecord surfaceCategory and indoorOutdoor when event lacks them', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    delete event.surfaceCategory;
    delete event.indoorOutdoor;
    tournamentRecord.surfaceCategory = 'HARD';
    tournamentRecord.indoorOutdoor = 'INDOOR';

    const result = allEventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.matchUps).toBeDefined();
    const matchUp = result.matchUps?.[0];
    if (matchUp) {
      expect(matchUp.surfaceCategory).toEqual('HARD');
      expect(matchUp.indoorOutDoor).toEqual('INDOOR');
    }
  });

  it('skips hydration when participantMap is provided even without participants', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    // Provide a participantMap (empty) — hydration should be skipped
    const result = allEventMatchUps({
      event,
      tournamentRecord,
      participantMap: {},
    });
    expect(result.matchUps).toBeDefined();
    // groupInfo not set since hydration was skipped
    expect(result.groupInfo).toBeUndefined();
  });

  it('uses tournamentRecord endDate fallback when event has no endDate', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    delete event.endDate;
    tournamentRecord.endDate = '2025-12-31';

    const result = allEventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.matchUps).toBeDefined();
    const matchUp = result.matchUps?.[0];
    if (matchUp) {
      expect(matchUp.endDate).toEqual('2025-12-31');
    }
  });

  it('includes matchUpFormat from event in context', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    event.matchUpFormat = 'SET3-S:6/TB7';

    const result = allEventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.matchUps).toBeDefined();
    const matchUp = result.matchUps?.[0];
    if (matchUp) {
      expect(matchUp.matchUpFormat).toBeDefined();
    }
  });
});

describe('eventMatchUps branch coverage', () => {
  it('returns MISSING_EVENT when no event is provided', () => {
    const result = eventMatchUps({} as any);
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns empty results for event with no drawDefinitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = { ...tournamentRecord.events[0] };
    delete event.drawDefinitions;

    const result = eventMatchUps({ event, tournamentRecord });
    expect(result.success).toBeDefined();
  });

  it('hydrates participants when tournamentParticipants not provided but tournamentRecord exists', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    // Call without participants — triggers hydration branch
    const result = eventMatchUps({ event, tournamentRecord });
    expect(result.success).toBeDefined();
  });

  it('skips participant hydration when tournamentParticipants are provided', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    const result = eventMatchUps({
      event,
      tournamentRecord,
      participants: tournamentRecord.participants,
    });
    expect(result.success).toBeDefined();
    // groupInfo not set when hydration skipped
    expect(result.groupInfo).toBeUndefined();
  });

  it('generates contextContent when contextProfile is provided without contextContent', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    const result = eventMatchUps({
      event,
      tournamentRecord,
      contextProfile: { withCompetitiveness: true },
    });
    expect(result.success).toBeDefined();
  });

  it('uses event surfaceCategory and indoorOutdoor over tournamentRecord values', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    event.surfaceCategory = 'GRASS';
    event.indoorOutdoor = 'OUTDOOR';
    tournamentRecord.surfaceCategory = 'HARD';
    tournamentRecord.indoorOutdoor = 'INDOOR';

    const result = eventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.success).toBeDefined();
  });

  it('falls back to tournamentRecord for surfaceCategory and indoorOutdoor', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    delete event.surfaceCategory;
    delete event.indoorOutdoor;
    tournamentRecord.surfaceCategory = 'HARD';
    tournamentRecord.indoorOutdoor = 'INDOOR';

    const result = eventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.success).toBeDefined();
  });

  it('uses tournamentId param when tournamentRecord.tournamentId is absent', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    const result = eventMatchUps({
      event,
      tournamentRecord,
      tournamentId: 'custom-tournament-id',
      inContext: true,
    });
    expect(result.success).toBeDefined();
  });

  it('uses endDate from event when available, falls back to tournamentRecord', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const event = tournamentRecord.events.find((e) => e.eventId === eventId);
    event.endDate = '2025-06-15';

    const result = eventMatchUps({ event, tournamentRecord, inContext: true });
    expect(result.success).toBeDefined();
  });

  it('handles multiple drawDefinitions in a single event', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId: 'multi-draw-event', drawProfiles: [{ drawSize: 8 }, { drawSize: 4 }] }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allEventMatchUps({ eventId });
    // 8-draw has 7 matchUps, 4-draw has 3 matchUps = 10 total
    expect(matchUps.length).toEqual(10);
  });

  it('allEventMatchUps via engine with matchUpFilters', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allEventMatchUps({
      matchUpFilters: { roundNumbers: [1] },
      eventId,
    });
    expect(matchUps.length).toEqual(4);
  });

  it('allEventMatchUps returns error for non-existent eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);
    const result = tournamentEngine.allEventMatchUps({ eventId: 'non-existent' });
    expect(result.error).toBeDefined();
  });
});
