import { translateAvailabilityToPersonRequests } from '@Mutate/matchUps/schedule/scheduleMatchUps/personRequests/translateAvailabilityToPersonRequests';
import { getMatchUpId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { AVAILABLE, IF_NEEDED, UNAVAILABLE } from '@Constants/availabilityConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { AvailabilityPayload } from '@Types/declarationTypes';

const dates = ['2026-08-10', '2026-08-11', '2026-08-12'];

function payload(overrides: Partial<AvailabilityPayload> = {}): AvailabilityPayload {
  return {
    span: { from: '2026-08-10', to: '2026-08-16' },
    days: {},
    ...overrides,
  };
}

describe('translateAvailabilityToPersonRequests — day states', () => {
  it('maps UNAVAILABLE to a whole-day DO_NOT_SCHEDULE request', () => {
    const { requests, ifNeededDates } = translateAvailabilityToPersonRequests({
      availability: payload({ days: { '2026-08-11': UNAVAILABLE } }),
      dates,
    });
    expect(requests).toEqual([
      { date: '2026-08-11', startTime: '00:00', endTime: '23:59', requestType: DO_NOT_SCHEDULE },
    ]);
    expect(ifNeededDates).toEqual([]);
  });

  it('carries IF_NEEDED as advisory only (no request)', () => {
    const { requests, ifNeededDates } = translateAvailabilityToPersonRequests({
      availability: payload({ days: { '2026-08-11': IF_NEEDED } }),
      dates,
    });
    expect(requests).toEqual([]);
    expect(ifNeededDates).toEqual(['2026-08-11']);
  });

  it('emits no constraint for AVAILABLE or NOT_SET (absent) days', () => {
    const { requests, ifNeededDates } = translateAvailabilityToPersonRequests({
      availability: payload({ days: { '2026-08-10': AVAILABLE } }), // 08-11/08-12 absent = NOT_SET
      dates,
    });
    expect(requests).toEqual([]);
    expect(ifNeededDates).toEqual([]);
  });
});

describe('translateAvailabilityToPersonRequests — windowing, timeAway, ordering', () => {
  it('windows to the provided dates — UNAVAILABLE days outside the window are ignored', () => {
    const { requests } = translateAvailabilityToPersonRequests({
      availability: payload({ days: { '2026-08-11': UNAVAILABLE, '2026-08-25': UNAVAILABLE } }),
      dates, // 08-25 is not a tournament date
    });
    expect(requests.map((r) => r.date)).toEqual(['2026-08-11']);
  });

  it('treats a timeAway range as a hard UNAVAILABLE override, even over an explicit AVAILABLE day', () => {
    const { requests } = translateAvailabilityToPersonRequests({
      availability: payload({
        days: { '2026-08-11': AVAILABLE }, // explicitly available…
        timeAway: [{ from: '2026-08-10', to: '2026-08-11', reason: 'travel' }], // …but away
      }),
      dates,
    });
    // 08-10 and 08-11 fall inside the away range → both blocked; 08-12 untouched
    expect(requests.map((r) => r.date)).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('returns requests in ascending date order and dedupes duplicate input dates', () => {
    const { requests } = translateAvailabilityToPersonRequests({
      availability: payload({ days: { '2026-08-12': UNAVAILABLE, '2026-08-10': UNAVAILABLE } }),
      dates: ['2026-08-12', '2026-08-10', '2026-08-12'], // out of order + duplicate
    });
    expect(requests.map((r) => r.date)).toEqual(['2026-08-10', '2026-08-12']);
  });

  it('is defensive against missing availability or dates', () => {
    expect(translateAvailabilityToPersonRequests({ availability: undefined as any, dates })).toEqual({
      requests: [],
      ifNeededDates: [],
    });
    expect(translateAvailabilityToPersonRequests({ availability: payload(), dates: undefined as any })).toEqual({
      requests: [],
      ifNeededDates: [],
    });
  });
});

it('produces personRequests that the real scheduler honors (end-to-end shape proof)', () => {
  const participantsCount = 16;
  const drawProfiles = [{ drawSize: participantsCount, drawName: 'PRQ' }];
  const venueProfiles = [{ courtsCount: 6 }];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    participantsProfile: { participantsCount },
  });

  const personId = tournamentRecord.participants[0].person.personId;
  competitionEngine.setState([tournamentRecord]);
  const { startDate } = competitionEngine.getCompetitionDateRange();

  // Translate an UNAVAILABLE declaration for the tournament's start date…
  const { requests } = translateAvailabilityToPersonRequests({
    availability: { span: { from: startDate, to: startDate }, days: { [startDate]: UNAVAILABLE } },
    dates: [startDate],
  });
  expect(requests.length).toEqual(1);

  // …apply it exactly as the CFS commit adapter will, then schedule.
  let result: any = competitionEngine.addPersonRequests({ personId, requests });
  expect(result.success).toEqual(true);

  const { matchUps } = competitionEngine.allCompetitionMatchUps();
  const matchUpIds = matchUps.filter(({ roundNumber }) => roundNumber < 3).map(getMatchUpId);

  result = competitionEngine.scheduleMatchUps({ scheduleDate: startDate, matchUpIds });
  expect(result.requestConflicts.length).toBeGreaterThan(0);
});
