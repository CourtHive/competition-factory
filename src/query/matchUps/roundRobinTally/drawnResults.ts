import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

export function validateDrawTallyOptions(policy?: RoundRobinTallyPolicy): ResultType {
  if (
    policy?.drawCredit !== undefined &&
    (typeof policy.drawCredit !== 'number' ||
      !Number.isFinite(policy.drawCredit) ||
      policy.drawCredit < 0 ||
      policy.drawCredit > 1)
  )
    return { error: INVALID_VALUES, info: 'drawCredit must be a finite number between 0 and 1' };
  if (
    policy?.outcomePoints !== undefined &&
    (!policy.outcomePoints ||
      (['win', 'draw', 'loss'] as const).some(
        (key) => typeof policy.outcomePoints?.[key] !== 'number' || !Number.isFinite(policy.outcomePoints[key]),
      ))
  )
    return { error: INVALID_VALUES, info: 'outcomePoints requires finite win, draw and loss values' };
  const usesStandingsPoints =
    policy?.groupOrderKey === 'standingsPoints' ||
    (Array.isArray(policy?.tallyDirectives) &&
      policy.tallyDirectives.some((directive) => directive?.attribute === 'standingsPoints'));
  if (usesStandingsPoints && !policy?.outcomePoints)
    return { error: INVALID_VALUES, info: 'standingsPoints ranking requires outcomePoints' };
  return {};
}

/** Only a complete tie permitted by the scoring contract is a drawn result. */
export function isDrawnResult(matchUp: MatchUp, fallbackFormat?: string): boolean {
  if (matchUp.matchUpStatus !== COMPLETED || matchUp.winningSide !== undefined || matchUp.score?.sets?.length !== 1)
    return false;
  const setFormat = parse(matchUp.matchUpFormat ?? fallbackFormat ?? '')?.setFormat;
  if (!setFormat?.combinedPointTotal || setFormat.tieResolution !== 'ALLOW') return false;
  const result = analyzeCombinedPointSet(matchUp.score.sets[0], {
    combinedPointTotal: setFormat.combinedPointTotal,
    tieResolution: 'ALLOW',
  });
  return !!(result.valid && result.complete && result.tied);
}

export function isCombinedPointFormat(format?: string): boolean {
  return !!parse(format ?? '')?.setFormat?.combinedPointTotal;
}
