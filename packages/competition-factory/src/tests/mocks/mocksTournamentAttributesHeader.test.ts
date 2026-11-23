import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * `tournamentAttributes.startDate` / `endDate` / `tournamentName` are read, not silently overwritten.
 *
 * Before, `generateTournamentRecord` spread `tournamentAttributes` and then wrote its own top-level
 * `startDate` / `endDate` / `tournamentName` over them, and those default to today and a random mock
 * name. A caller that put its dates in `tournamentAttributes` got a tournament dated this week, whatever
 * it asked for: a TMX e2e journey passed only near the day it was written. A value supplied in both
 * places that disagrees is refused, naming both, rather than one of them being picked.
 */

const TODAY = '2026-10-17T12:00:00Z';

const generate = (params: any) => {
  setClock(TODAY);
  try {
    return mocksEngine.generateTournamentRecord(params) as any;
  } finally {
    setClock();
  }
};
const datesOf = (result: any) => [result.tournamentRecord?.startDate, result.tournamentRecord?.endDate];

describe('generateTournamentRecord: dates and name in tournamentAttributes', () => {
  it('both dates in tournamentAttributes are the tournament dates, not today', () => {
    const result = generate({ tournamentAttributes: { startDate: '2025-06-01', endDate: '2025-06-30' } });
    expect(datesOf(result)).toEqual(['2025-06-01', '2025-06-30']);
  });

  it('an endDate alone in tournamentAttributes is the end, and the start is a week before it', () => {
    const result = generate({ tournamentAttributes: { endDate: '2026-01-15' } });
    expect(datesOf(result)).toEqual(['2026-01-08', '2026-01-15']);
  });

  it('a startDate alone in tournamentAttributes is the start, and the end is a week after it', () => {
    const result = generate({ tournamentAttributes: { startDate: '2026-01-15' } });
    expect(datesOf(result)).toEqual(['2026-01-15', '2026-01-22']);
  });

  it('one date at the top level and the other in tournamentAttributes are combined', () => {
    const result = generate({ startDate: '2025-06-01', tournamentAttributes: { endDate: '2025-06-10' } });
    expect(datesOf(result)).toEqual(['2025-06-01', '2025-06-10']);
  });

  it('the same date in both places is accepted', () => {
    const result = generate({
      tournamentAttributes: { startDate: '2025-06-01', endDate: '2025-06-10' },
      startDate: '2025-06-01',
      endDate: '2025-06-10',
    });
    expect(datesOf(result)).toEqual(['2025-06-01', '2025-06-10']);
  });

  it('events are generated within the honoured dates', () => {
    const result = generate({
      tournamentAttributes: { startDate: '2025-06-01', endDate: '2025-06-30' },
      drawProfiles: [{ drawSize: 4 }],
    });
    const [event] = result.tournamentRecord.events;
    expect(event.startDate >= '2025-06-01').toEqual(true);
    expect(event.endDate <= '2025-06-30').toEqual(true);
  });

  it('an inverted range in tournamentAttributes is refused', () => {
    const result = generate({ tournamentAttributes: { startDate: '2025-06-30', endDate: '2025-06-01' } });
    expect(result.error).toEqual(INVALID_DATE);
  });

  it('an invalid date in tournamentAttributes is refused', () => {
    expect(generate({ tournamentAttributes: { startDate: 'not-a-date' } }).error).toEqual(INVALID_DATE);
  });

  it('a tournamentName in tournamentAttributes is the name, and the seeded stream is unchanged by it', () => {
    const named = generate({ tournamentAttributes: { tournamentName: 'Summer Championships' }, nonRandom: 3 });
    expect(named.tournamentRecord.tournamentName).toEqual('Summer Championships');
    // the mock name is still drawn (and discarded), so everything generated after it is what it was
    const unnamed = generate({ nonRandom: 3, participantsProfile: { participantsCount: 4 } });
    const namedWithParticipants = generate({
      tournamentAttributes: { tournamentName: 'Summer Championships' },
      participantsProfile: { participantsCount: 4 },
      nonRandom: 3,
    });
    const names = (result: any) => result.tournamentRecord.participants.map((p: any) => p.participantName);
    expect(names(namedWithParticipants)).toEqual(names(unnamed));
  });

  it('a value supplied in both places that disagrees is refused, naming both, and nothing is installed', () => {
    mocksEngine.generateTournamentRecord({ tournamentAttributes: { tournamentId: 'kept' }, setState: true });
    const values = {
      startDate: ['2025-06-05', '2025-06-06'],
      endDate: ['2025-06-05', '2025-06-06'],
      tournamentName: ['A', 'B'],
    };
    for (const [field, [attribute, topLevel]] of Object.entries(values)) {
      const result = generate({
        tournamentAttributes: { [field]: attribute },
        [field]: topLevel,
        drawProfiles: [{ drawSize: 4 }],
        setState: true,
      });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.tournamentRecord).toBeUndefined();
      expect(result.context).toEqual({ option: `tournamentAttributes.${field}`, conflictsWith: field });
      expect(result.info).toContain(`tournamentAttributes.${field}`);
      expect(tournamentEngine.getTournament().tournamentRecord?.tournamentId).toEqual('kept');
    }
  });
});
