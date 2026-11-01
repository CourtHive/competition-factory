import { decorateResult } from '@Functions/global/decorateResult';
import { isObject } from '@Tools/objects';

// constants and types
import type { Season, SeasonAdvancement, SeasonAdvancementRule, SeasonPeriod, SeasonTier } from '@Types/seasonTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ADVANCE_BERTHS_BY_SIZE, ADVANCE_TOP_N, seasonConstants } from '@Constants/seasonConstants';
import { ResultType } from '@Types/factoryTypes';

const STATUSES: string[] = Object.values(seasonConstants.SEASON_STATUS);
const SUBJECT_TYPES: string[] = Object.values(seasonConstants.SUBJECT_TYPE);

const isNonEmptyString = (value: unknown) => typeof value === 'string' && value.length > 0;

/**
 * Structural validation of a CODES `Season`: identities, the tier lattice, the periods and what they reference,
 * placements and advancements. Every problem is reported, not only the first.
 *
 * It cannot check that a `CompetitionRef` resolves to a record that exists; the factory holds no store. Callers
 * that hold the records check that, and `getSeasonStandings` reports a reference no matchUp answered.
 */
export function validateSeason({ season }: { season?: Season }): ResultType & { valid?: boolean; errors?: string[] } {
  const stack = 'validateSeason';
  if (!isObject(season)) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { errors: ['season must be an object'] },
      stack,
    });
  }

  const errors: string[] = [
    ...identityErrors(season as Season),
    ...tierErrors(season?.tiers),
    ...periodErrors(season as Season),
    ...advancementErrors(season as Season),
  ];

  if (errors.length) return decorateResult({ result: { error: INVALID_VALUES }, context: { errors }, stack });
  return { valid: true };
}

function identityErrors(season: Season): string[] {
  const errors: string[] = [];
  for (const key of ['seasonId', 'seriesId', 'name', 'startDate'] as const) {
    if (!isNonEmptyString(season[key])) errors.push(`${key} is required`);
  }
  if (!STATUSES.includes(season.status)) errors.push(`status must be one of ${STATUSES.join(', ')}: ${season.status}`);
  if (season.endDate && season.startDate && season.endDate < season.startDate) {
    errors.push(`endDate ${season.endDate} precedes startDate ${season.startDate}`);
  }
  return errors;
}

function tierErrors(tiers?: SeasonTier[]): string[] {
  if (!Array.isArray(tiers) || !tiers.length) return ['tiers must be a non-empty array'];
  const errors: string[] = [];
  const tierIds = new Set<string>();
  for (const tier of tiers) {
    if (!isNonEmptyString(tier?.tierId)) errors.push('every tier needs a tierId');
    else if (tierIds.has(tier.tierId)) errors.push(`duplicate tierId: ${tier.tierId}`);
    else tierIds.add(tier.tierId);
    if (!isNonEmptyString(tier?.tier?.system) || !isNonEmptyString(tier?.tier?.value)) {
      errors.push(`tier ${tier?.tierId} needs a TierClassification { system, value }`);
    }
  }
  const parentOf = new Map(tiers.map((tier) => [tier?.tierId, tier?.parentTierId]));
  for (const tier of tiers) {
    if (tier?.parentTierId && !tierIds.has(tier.parentTierId)) {
      errors.push(`tier ${tier.tierId} names an unknown parentTierId: ${tier.parentTierId}`);
    } else if (tier?.parentTierId && hasCycle(tier.tierId, parentOf)) {
      errors.push(`tier ${tier.tierId} is its own ancestor`);
    }
  }
  return errors;
}

function hasCycle(tierId: string, parentOf: Map<string, string | undefined>): boolean {
  const seen = new Set<string>();
  let current: string | undefined = tierId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

function periodErrors(season: Season): string[] {
  const { periods } = season;
  if (!Array.isArray(periods) || !periods.length) return ['periods must be a non-empty array'];
  const tierIds = new Set((season.tiers ?? []).map((tier) => tier?.tierId));
  const errors: string[] = [];
  const periodIds = new Set<string>();
  const periodNumbers = new Set<number>();
  for (const period of periods) {
    if (!isNonEmptyString(period?.periodId)) errors.push('every period needs a periodId');
    else if (periodIds.has(period.periodId)) errors.push(`duplicate periodId: ${period.periodId}`);
    else periodIds.add(period.periodId);
    if (!Number.isInteger(period?.periodNumber))
      errors.push(`period ${period?.periodId} needs an integer periodNumber`);
    else if (periodNumbers.has(period.periodNumber)) errors.push(`duplicate periodNumber: ${period.periodNumber}`);
    else periodNumbers.add(period.periodNumber);
    if (typeof period?.includeInStandings !== 'boolean') {
      errors.push(`period ${period?.periodId} must declare includeInStandings`);
    }
    errors.push(...competitionErrors(period, tierIds), ...placementErrors(period, tierIds));
  }
  return errors;
}

function competitionErrors(period: SeasonPeriod, tierIds: Set<string>): string[] {
  if (!Array.isArray(period?.competitions)) return [`period ${period?.periodId} needs a competitions array`];
  const errors: string[] = [];
  for (const ref of period.competitions) {
    if (!isNonEmptyString(ref?.tournamentId))
      errors.push(`period ${period.periodId}: a competition needs a tournamentId`);
    if (!tierIds.has(ref?.tierId))
      errors.push(`period ${period.periodId}: competition names an unknown tierId: ${ref?.tierId}`);
    if (ref?.drawId && !ref.eventId)
      errors.push(`period ${period.periodId}: a drawId reference must also name its eventId`);
  }
  return errors;
}

function placementErrors(period: SeasonPeriod, tierIds: Set<string>): string[] {
  if (period?.placements === undefined) return [];
  if (!Array.isArray(period.placements)) return [`period ${period.periodId}: placements must be an array`];
  const errors: string[] = [];
  const placed = new Map<string, string>();
  for (const placement of period.placements) {
    if (!tierIds.has(placement?.tierId)) {
      errors.push(`period ${period.periodId}: placement names an unknown tierId: ${placement?.tierId}`);
    }
    for (const subject of placement?.subjects ?? []) {
      if (!SUBJECT_TYPES.includes(subject?.subjectType) || !isNonEmptyString(subject?.subjectId)) {
        errors.push(`period ${period.periodId}: invalid subject ${JSON.stringify(subject)}`);
        continue;
      }
      const key = `${subject.subjectType}:${subject.subjectId}`;
      const otherTier = placed.get(key);
      if (otherTier && otherTier !== placement.tierId) {
        errors.push(`period ${period.periodId}: ${key} is placed in two tiers (${otherTier}, ${placement.tierId})`);
      }
      placed.set(key, placement.tierId);
    }
  }
  return errors;
}

function advancementErrors(season: Season): string[] {
  if (season.advancements === undefined) return [];
  if (!Array.isArray(season.advancements)) return ['advancements must be an array'];
  const tierIds = new Set((season.tiers ?? []).map((tier) => tier?.tierId));
  const periodNumber = new Map((season.periods ?? []).map((period) => [period?.periodId, period?.periodNumber]));
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const advancement of season.advancements) {
    const id = advancement?.advancementId;
    if (!isNonEmptyString(id)) errors.push('every advancement needs an advancementId');
    else if (ids.has(id)) errors.push(`duplicate advancementId: ${id}`);
    else ids.add(id);
    errors.push(...advancementReferenceErrors(advancement, tierIds, periodNumber));
  }
  return errors;
}

function advancementReferenceErrors(
  advancement: SeasonAdvancement,
  tierIds: Set<string>,
  periodNumber: Map<string, number>,
): string[] {
  const errors: string[] = [];
  const id = advancement?.advancementId;
  const from = periodNumber.get(advancement?.fromPeriodId);
  const to = periodNumber.get(advancement?.to?.periodId);
  if (from === undefined) errors.push(`advancement ${id} names an unknown fromPeriodId: ${advancement?.fromPeriodId}`);
  if (to === undefined) errors.push(`advancement ${id} names an unknown to.periodId: ${advancement?.to?.periodId}`);
  if (from !== undefined && to !== undefined && to <= from) {
    errors.push(`advancement ${id} must advance into a later period`);
  }
  if (!tierIds.has(advancement?.fromTierId)) errors.push(`advancement ${id} names an unknown fromTierId`);
  if (!tierIds.has(advancement?.to?.tierId)) errors.push(`advancement ${id} names an unknown to.tierId`);
  if (!isValidRule(advancement?.rule)) {
    errors.push(
      `advancement ${id} needs rule { type: '${ADVANCE_TOP_N}', n >= 1 } or { type: '${ADVANCE_BERTHS_BY_SIZE}', berths: [{ minSubjects >= 0, n >= 1 }] }`,
    );
  }
  return errors;
}

const isBerthCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 1;

function isValidRule(rule?: SeasonAdvancementRule): boolean {
  if (rule?.type === ADVANCE_TOP_N) return isBerthCount(rule.n);
  if (rule?.type !== ADVANCE_BERTHS_BY_SIZE || !Array.isArray(rule.berths) || !rule.berths.length) return false;
  return rule.berths.every(
    (berth) => Number.isInteger(berth?.minSubjects) && berth.minSubjects >= 0 && isBerthCount(berth.n),
  );
}
