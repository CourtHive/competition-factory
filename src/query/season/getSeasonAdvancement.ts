import { getSeasonStandings, SubjectResolver } from './getSeasonStandings';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import type {
  Season,
  SeasonAdvancement,
  SeasonAdvancementRule,
  SeasonStandingsTally,
  SeasonSubject,
} from '@Types/seasonTypes';
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import type { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

type GetSeasonAdvancementArgs = {
  season: Season;
  /** IN-CONTEXT matchUps the caller has already selected */
  matchUps: HydratedMatchUp[];
  /** one declared advancement; when omitted, every advancement the season declares */
  advancementId?: string;
  getSubjectId?: SubjectResolver;
  orderBy?: (keyof SeasonStandingsTally)[];
  tallyPolicy?: RoundRobinTallyPolicy;
};

export type SeasonAdvancementOutcome = {
  advancement: SeasonAdvancement;
  /** the berths the rule gives this tier */
  berths: number;
  /** the subjects who advance, best first */
  advancing: SeasonSubject[];
  /**
   * Subjects level on rank across the cut: with n = 1 and two subjects sharing first, which one advances is a
   * tie-break the season's rules decide, not this function. `advancing` then holds only those clear of the tie.
   */
  tiedAtCut?: SeasonSubject[];
};

/**
 * R10: who advances out of a period into a later competition of the same season (local league to area playoff,
 * area to sectionals). Applies each declared rule to the from-period's standings. Pure; it proposes and records
 * nothing, so the caller places the advancing subjects (an entry, a placement in the to-period).
 */
export function getSeasonAdvancement(params: GetSeasonAdvancementArgs): ResultType & {
  outcomes?: SeasonAdvancementOutcome[];
} {
  const stack = 'getSeasonAdvancement';
  const { season, matchUps, advancementId, getSubjectId, orderBy, tallyPolicy } = params;
  const advancements = (season?.advancements ?? []).filter(
    (advancement) => !advancementId || advancement.advancementId === advancementId,
  );

  const outcomes: SeasonAdvancementOutcome[] = [];
  for (const advancement of advancements) {
    const result = getSeasonStandings({
      periodId: advancement.fromPeriodId,
      tierId: advancement.fromTierId,
      getSubjectId,
      tallyPolicy,
      matchUps,
      orderBy,
      season,
    });
    if (result.error) return decorateResult({ result, context: { advancementId: advancement.advancementId }, stack });

    const rows = result.standings?.[advancement.fromTierId] ?? [];
    const n = berthCount(advancement.rule, rows.length);
    const cutRank = rows[n - 1]?.rank;
    const straddles = cutRank !== undefined && rows[n]?.rank === cutRank;
    const advancing = (straddles ? rows.filter((row) => row.rank < cutRank) : rows.slice(0, n)).map(
      (row) => row.subject,
    );
    const tiedAtCut = straddles ? rows.filter((row) => row.rank === cutRank).map((row) => row.subject) : undefined;

    outcomes.push({ advancement, berths: n, advancing, ...(tiedAtCut && { tiedAtCut }) });
  }

  return { outcomes };
}

function berthCount(rule: SeasonAdvancementRule, tierSize: number): number {
  if (rule.type === 'TOP_N') return rule.n;
  const applicable = rule.berths.filter((berth) => berth.minSubjects <= tierSize);
  return (
    applicable.reduce((best, berth) => (berth.minSubjects >= best.minSubjects ? berth : best), applicable[0])?.n ?? 0
  );
}
