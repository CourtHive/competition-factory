import { getSeasonStandings, SubjectResolver } from './getSeasonStandings';
import { getTierMovement } from '@Query/tournaments/getTierMovement';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import type {
  Season,
  SeasonMovementProposal,
  SeasonMovementTie,
  SeasonStandingRow,
  SeasonStandingsTally,
  SeasonTier,
} from '@Types/seasonTypes';
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import { STANDINGS_PURPOSE_MOVEMENT } from '@Constants/seasonConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

type GetSeasonMovementArgs = {
  season: Season;
  /** the period whose close the movement is computed for */
  periodId: string;
  /** IN-CONTEXT matchUps the caller has already selected */
  matchUps: HydratedMatchUp[];
  getSubjectId?: SubjectResolver;
  orderBy?: (keyof SeasonStandingsTally)[];
  tallyPolicy?: RoundRobinTallyPolicy;
};

export type SeasonMovementResult = ResultType & {
  proposals?: SeasonMovementProposal[];
  /** subjects level across a cut; they have no proposal until the season's rules (or an operator) decide */
  tiedAtCut?: SeasonMovementTie[];
};

/**
 * R7: who moves up, down or stays at the close of a period, under the season's declared `movementRules`. Pure; it
 * proposes and records nothing. Each proposal is labelled by `getTierMovement`, so direction is answered by the
 * same function that labels movement between any two seasons.
 *
 * Every subject in a tier's standings gets a proposal (HELD included), except subjects level on rank across a
 * cut: those are returned in `tiedAtCut`, never decided here.
 */
export function getSeasonMovement(params: GetSeasonMovementArgs): SeasonMovementResult {
  const stack = 'getSeasonMovement';
  const { season, periodId, matchUps, getSubjectId, orderBy, tallyPolicy } = params;
  if (!season?.periods?.some((period) => period.periodId === periodId)) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { periodId },
      info: 'unknown periodId',
      stack,
    });
  }
  if (!season.movementRules?.length) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'the season declares no movementRules', stack });
  }

  const result = getSeasonStandings({
    purpose: STANDINGS_PURPOSE_MOVEMENT,
    getSubjectId,
    tallyPolicy,
    periodId,
    matchUps,
    orderBy,
    season,
  });
  if (result.error) return decorateResult({ result, stack });

  const proposals: SeasonMovementProposal[] = [];
  const tiedAtCut: SeasonMovementTie[] = [];
  for (const tier of season.tiers) {
    const rows = result.standings?.[tier.tierId] ?? [];
    if (!rows.length) continue;
    const ladder = siblingLadder(season.tiers, tier);
    const position = ladder.indexOf(tier);
    const better = ladder[position - 1];
    const worse = ladder[position + 1];
    const { promote, relegate } = tierRule(season, tier.tierId);

    const promoteCut = cut({ rows, placesAtCut: better ? promote : 0 });
    const relegateCut = cut({
      rows: [...rows].reverse(),
      placesAtCut: worse ? Math.min(relegate, rows.length - promoteCut.taken.length) : 0,
    });

    const decided = new Map<SeasonStandingRow, SeasonTier>();
    for (const row of promoteCut.taken) decided.set(row, better);
    for (const row of relegateCut.taken) if (!decided.has(row)) decided.set(row, worse);
    const tied = new Set([...promoteCut.tied, ...relegateCut.tied]);
    if (promoteCut.tied.length) {
      tiedAtCut.push({
        tierId: tier.tierId,
        cut: 'PROMOTE',
        placesAtCut: promoteCut.placesAtCut,
        subjects: promoteCut.tied.map((row) => row.subject),
      });
    }
    if (relegateCut.tied.length) {
      tiedAtCut.push({
        tierId: tier.tierId,
        cut: 'RELEGATE',
        placesAtCut: relegateCut.placesAtCut,
        subjects: relegateCut.tied.map((row) => row.subject),
      });
    }

    for (const row of rows) {
      if (tied.has(row)) continue;
      const toTier = decided.get(row) ?? tier;
      const { movement } = getTierMovement({ fromTier: tier.tier, toTier: toTier.tier });
      proposals.push({
        subject: row.subject,
        fromTierId: tier.tierId,
        toTierId: toTier.tierId,
        movement,
        rank: row.rank,
      });
    }
  }

  return { proposals, tiedAtCut };
}

/** the tiers this tier moves among: its siblings, most prestigious first */
export function siblingLadder(tiers: SeasonTier[], tier: SeasonTier): SeasonTier[] {
  return tiers
    .filter((other) => other.parentTierId === tier.parentTierId)
    .sort((a, b) => (a.tier.numericRank ?? 0) - (b.tier.numericRank ?? 0));
}

function tierRule(season: Season, tierId: string) {
  const rules = season.movementRules ?? [];
  const rule = rules.find((r) => r.tierId === tierId) ?? rules.find((r) => r.tierId === undefined);
  return { promote: rule?.promote ?? 0, relegate: rule?.relegate ?? 0 };
}

/**
 * The first `placesAtCut` rows (rows ordered best-first for promotion, worst-first for relegation). When rows level on
 * rank straddle the cut, those clear of the tie are taken and the tied rows are returned undecided.
 */
function cut({ rows, placesAtCut }: { rows: SeasonStandingRow[]; placesAtCut: number }) {
  if (placesAtCut <= 0) return { taken: [] as SeasonStandingRow[], tied: [] as SeasonStandingRow[], placesAtCut: 0 };
  const cutRank = rows[placesAtCut - 1]?.rank;
  if (cutRank === undefined) return { taken: rows, tied: [] as SeasonStandingRow[], placesAtCut };
  if (rows[placesAtCut]?.rank !== cutRank)
    return { taken: rows.slice(0, placesAtCut), tied: [] as SeasonStandingRow[], placesAtCut };
  const taken = rows.slice(0, placesAtCut).filter((row) => row.rank !== cutRank);
  const tied = rows.filter((row) => row.rank === cutRank);
  return { taken, tied, placesAtCut: placesAtCut - taken.length };
}
