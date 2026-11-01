import { completeDrawMatchUps } from '@Mutate/simulation/completeDrawMatchUps';
import { generateTournamentRecord } from './generateTournamentRecord';
import { decorateResult } from '@Functions/global/decorateResult';
import { generateRange } from '@Tools/arrays';

// constants and types
import { PHASE_REGULAR, SEASON_ACTIVE, SUBJECT_TEAM } from '@Constants/seasonConstants';
import type { Season, SeasonPeriod, SeasonTier } from '@Types/seasonTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { MockSeasonProfile } from '@Types/mocksTypes';
import type { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

/**
 * A season of team leagues for tests and demos: one tournamentRecord per period, holding one TEAM event per tier
 * (the record grain CourtHive uses for a league it runs: a local league season in one record, its levels as
 * events), plus the `Season` document that references them.
 *
 * Teams keep their participantIds from period to period (`<tierId>-team-<n>`), so season standings can aggregate
 * across records with the default subject resolution.
 */
export function generateSeason(params: { seasonProfile: MockSeasonProfile; random?: () => number }): ResultType & {
  tournamentRecords?: Record<string, Tournament>;
  season?: Season;
} {
  const stack = 'generateSeason';
  const { seasonProfile, random } = params ?? {};
  if (!seasonProfile?.tiers?.length) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'seasonProfile.tiers is required', stack });
  }

  const {
    completeAllMatchUps = true,
    tieFormatName = 'COLLEGE_DEFAULT',
    seasonId = 'mock-season',
    seriesId = 'mock-series',
    tierSystem = 'MOCK',
    startDate,
  } = seasonProfile;
  const periodProfiles = seasonProfile.periods?.length ? seasonProfile.periods : [{}];

  const tiers: SeasonTier[] = seasonProfile.tiers.map((tierProfile, index) => ({
    tierId: tierProfile.tierId ?? `tier-${index + 1}`,
    tier: { system: tierSystem, value: tierProfile.tierValue ?? String(index + 1), numericRank: index + 1 },
    name: tierProfile.tierValue,
  }));

  const tournamentRecords: Record<string, Tournament> = {};
  const periods: SeasonPeriod[] = [];

  for (const [index, periodProfile] of periodProfiles.entries()) {
    const periodNumber = index + 1;
    const tournamentId = `${seasonId}-P${periodNumber}`;
    const leagueProfiles = tiers.map((tier, tierIndex) => ({
      teamProfiles: generateRange(0, seasonProfile.tiers[tierIndex].teamsCount).map((n) => ({
        teamName: `${tier.name ?? tier.tierId} Team ${n + 1}`,
        teamId: `${tier.tierId}-team-${n + 1}`,
      })),
      tieFormatName: seasonProfile.tiers[tierIndex].tieFormatName ?? tieFormatName,
      eventName: tier.name ?? tier.tierId,
      leagueId: `${tournamentId}-${tier.tierId}`,
      automated: true,
    }));

    const generated = generateTournamentRecord({
      tournamentAttributes: {
        tournamentId,
        tournamentName: `${seasonProfile.seasonName ?? 'Mock Season'} ${periodNumber}`,
      },
      leagueProfiles,
      startDate,
      random,
    });
    if (generated.error) return decorateResult({ result: generated, context: { periodNumber }, stack });
    const tournamentRecord: Tournament = generated.tournamentRecord;

    if (completeAllMatchUps) {
      for (const event of tournamentRecord.events ?? []) {
        for (const drawDefinition of event.drawDefinitions ?? []) {
          const completed = completeDrawMatchUps({
            randomWinningSide: true,
            completeAllMatchUps,
            tournamentRecord,
            drawDefinition,
            event,
          });
          if (completed?.error) return decorateResult({ result: completed, context: { periodNumber }, stack });
        }
      }
    }
    tournamentRecords[tournamentId] = tournamentRecord;

    periods.push({
      periodId: `${seasonId}-period-${periodNumber}`,
      phase: periodProfile.phase ?? PHASE_REGULAR,
      includeInStandings: periodProfile.includeInStandings ?? true,
      periodNumber,
      competitions: tiers.map((tier) => ({
        tierId: tier.tierId,
        tournamentId,
        eventId: `${tournamentId}-${tier.tierId}`,
      })),
      placements: tiers.map((tier, tierIndex) => ({
        tierId: tier.tierId,
        subjects: generateRange(0, seasonProfile.tiers[tierIndex].teamsCount).map((n) => ({
          subjectType: SUBJECT_TEAM,
          subjectId: `${tier.tierId}-team-${n + 1}`,
        })),
      })),
    });
  }

  const firstRecord = tournamentRecords[`${seasonId}-P1`];
  const season: Season = {
    name: seasonProfile.seasonName ?? 'Mock Season',
    startDate: firstRecord.startDate ?? '',
    endDate: Object.values(tournamentRecords).at(-1)?.endDate,
    status: SEASON_ACTIVE,
    seasonId,
    seriesId,
    periods,
    tiers,
  };

  return { tournamentRecords, season };
}
