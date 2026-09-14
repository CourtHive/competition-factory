import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { INVALID_STRUCTURE, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';
import { MatchUp } from '@Types/tournamentTypes';

export function checkRoundsArgs(
  params,
  additionalChecks?: any,
): ResultType & { structure?: any; roundMatchUps?: { [key: string]: MatchUp[] }; roundNumbers?: number[] } {
  const checks = [{ drawDefinition: true, structureId: true }];
  if (Array.isArray(additionalChecks)) checks.push(...additionalChecks);
  const paramsCheck = checkRequiredParameters(params, checks);
  if (paramsCheck.error) return paramsCheck;

  const result = findStructure(params);
  if (result.error) return result;

  const structure = result.structure;
  const structureIsAdHoc = isAdHoc({ structure });
  if (!structureIsAdHoc)
    return decorateResult({ result: { error: INVALID_STRUCTURE, message: 'structure must be adHoc' } });

  const { roundMatchUps = [], roundNumbers } = getRoundMatchUps({ matchUps: structure?.matchUps });
  if (!roundNumbers?.length) return { error: MISSING_MATCHUPS };

  return { valid: true, structure, roundMatchUps, roundNumbers };
}
