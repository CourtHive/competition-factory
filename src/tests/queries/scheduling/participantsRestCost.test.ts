import { getParticipantsRest } from '@Query/matchUps/scheduling/getParticipantRest';
import { getParticipantRest as oracleParticipantRest } from './oracle/participantRestOracle';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it, vi } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

/**
 * The cost the batch exists to remove: zoned conversions. Each matchUp's times take up to four
 * (`normalizeTimes`), and the single-call implementation redid them for every matchUp on every answer, so
 * a schedule render asking once per card cost matchUps × requests × 4. The batch normalizes each matchUp
 * once per call; what remains per answer is the handful of conversions that format its own rows.
 */

const conversions = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Tools/zonedDateTime', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    zonedParts: (...args: any[]) => {
      conversions.count += 1;
      return actual.zonedParts(...args);
    },
    zonedWallClockToMs: (...args: any[]) => {
      conversions.count += 1;
      return actual.zonedWallClockToMs(...args);
    },
  };
});

const day = '2026-09-12';
const asOf = `${day}T15:00:00.000Z`;

describe('getParticipantsRest — conversions grow with matchUps, not matchUps × requests', () => {
  it('a 64-draw asked about every matchUp at once stays within the per-matchUp bound', () => {
    mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfiles: [{ drawSize: 64 }],
      venueProfiles: [{ courtsCount: 8 }],
      completeAllMatchUps: false,
      startDate: day,
      endDate: day,
      nonRandom: 1,
      setState: true,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[];
    // Schedule every matchUp on the day, so each has times to normalize and a day to be measured on.
    matchUps.forEach((matchUp, i) => {
      const result = tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: day, scheduledTime: `${String(8 + (i % 10)).padStart(2, '0')}:00` },
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
      });
      expect(result.success).toEqual(true);
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const hydrated = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[];
    const requests = hydrated.map((matchUp) => ({ matchUpId: matchUp.matchUpId, asOf }));

    conversions.count = 0;
    const result: any = getParticipantsRest({
      tournamentRecord: tournamentRecord as any,
      matchUps: hydrated,
      requests,
    });
    const batchConversions = conversions.count;
    expect(result.rests.filter((rest: any) => rest.evaluated).length).toBeGreaterThan(0);

    conversions.count = 0;
    for (const request of requests) {
      oracleParticipantRest({ tournamentRecord: tournamentRecord as any, matchUps: hydrated, ...request });
    }
    const perCallConversions = conversions.count;

    const M = hydrated.length;
    const N = requests.length;
    // Four per matchUp to normalize it once, plus a few per answer to format its rows' clocks.
    expect(batchConversions).toBeLessThanOrEqual(4 * M + 4 * N);
    // And the measured gap that motivated it: the single-call path paid per matchUp per answer.
    expect(perCallConversions).toBeGreaterThan(20 * batchConversions);
  });
});
