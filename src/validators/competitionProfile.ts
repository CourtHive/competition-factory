import { isRotatingPartnerScoringVariant } from './rotatingPartnerScoringPolicy';

// constants and types
import type { CompetitionProfile } from '@Types/competitionProfile';

function objectWithKeys(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => [...required, ...optional].includes(key))
  );
}

function positiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Closed, versioned JSON configuration; never accept an unknown format as a default. */
export function isCompetitionProfile(value: unknown): value is CompetitionProfile {
  if (
    !objectWithKeys(
      value,
      ['version', 'format'],
      ['entrantScope', 'matchUpType', 'scoring', 'standings', 'pairing', 'completion'],
    )
  )
    return false;
  if (value.version !== 1) return false;
  if (value.format === 'LADDER') return objectWithKeys(value, ['version', 'format']);
  if (value.format !== 'AMERICANO' && value.format !== 'MEXICANO') return false;
  return (
    value.entrantScope === 'INDIVIDUAL' &&
    value.matchUpType === 'DOUBLES' &&
    validScoring(value.scoring) &&
    validStandings(value.standings) &&
    validPairing(value.pairing, value.format) &&
    validCompletion(value.completion, value.format)
  );
}

function validScoring(value: unknown): boolean {
  return (
    objectWithKeys(value, ['combinedPointTotal'], ['selectedVariant']) &&
    positiveInteger(value.combinedPointTotal) &&
    (value.selectedVariant === undefined || isRotatingPartnerScoringVariant(value.selectedVariant))
  );
}

function validStandings(value: unknown): boolean {
  return (
    objectWithKeys(value, ['metric', 'attribution']) &&
    value.metric === 'SIDE_POINTS' &&
    value.attribution === 'EACH_INDIVIDUAL'
  );
}

function validPairing(value: unknown, format: unknown): boolean {
  const keys =
    format === 'AMERICANO' ? ['seed', 'algorithmVersion'] : ['seed', 'algorithmVersion', 'groupBy', 'partners'];
  if (!objectWithKeys(value, keys) || !Number.isSafeInteger(value.seed) || value.algorithmVersion !== 1) return false;
  return (
    format === 'AMERICANO' || (value.groupBy === 'ADJACENT_STANDINGS' && value.partners === 'FIRST_FOURTH_SECOND_THIRD')
  );
}

function validCompletion(value: unknown, format: unknown): boolean {
  if (format === 'AMERICANO') return objectWithKeys(value, ['kind']) && value.kind === 'PARTNERSHIP_COVERAGE';
  return objectWithKeys(value, ['kind', 'rounds']) && value.kind === 'ROUND_COUNT' && positiveInteger(value.rounds);
}
