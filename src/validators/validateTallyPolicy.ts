import { validateDrawTallyOptions } from '@Query/matchUps/roundRobinTally/drawnResults';
import { TALLY_MEASURES, V1_PRIMARY_KEYS } from '@Query/standings/fromV1';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

type ValidateTallyPolicyArgs = {
  tallyPolicy?: RoundRobinTallyPolicy;
  /** measures beyond the round-robin ledger's that this caller's ledger carries (a season's tie-score values) */
  extraMeasures?: string[];
};

/**
 * A round-robin tally (standings) policy, checked where it is SAVED: attached to a record, or declared on a season. The
 * engine never refuses at calculation for these (spec § 5.10); a saved policy that would have been silently
 * reinterpreted (an unknown primary key fell back to matchUpsWon, K3) is refused here instead.
 */
export function validateTallyPolicy({ tallyPolicy, extraMeasures = [] }: ValidateTallyPolicyArgs): ResultType & {
  errors?: string[];
} {
  if (tallyPolicy === undefined) return { valid: true } as ResultType;
  const errors = tallyPolicyErrors(tallyPolicy, extraMeasures);
  if (errors.length) {
    return decorateResult({
      result: { error: INVALID_VALUES, info: errors[0] },
      context: { errors },
      stack: 'validateTallyPolicy',
    });
  }
  return { valid: true } as ResultType;
}

export function tallyPolicyErrors(tallyPolicy: RoundRobinTallyPolicy, extraMeasures: string[] = []): string[] {
  if (!tallyPolicy || typeof tallyPolicy !== 'object') return ['tallyPolicy must be an object'];
  const errors: string[] = [];
  const primaryKeys = [...V1_PRIMARY_KEYS, ...extraMeasures];
  const measures = [...TALLY_MEASURES, ...extraMeasures];

  const { groupOrderKey, tallyDirectives, headToHead, precision } = tallyPolicy;
  if (groupOrderKey !== undefined && !primaryKeys.includes(groupOrderKey)) {
    errors.push(`unknown groupOrderKey: ${groupOrderKey}`);
  }
  if (tallyDirectives !== undefined) {
    if (!Array.isArray(tallyDirectives)) errors.push('tallyDirectives must be an array');
    else {
      tallyDirectives.forEach((directive, index) => {
        if (!directive || typeof directive !== 'object') errors.push(`tallyDirectives[${index}] must be an object`);
        else if (!measures.includes(directive.attribute)) {
          errors.push(`tallyDirectives[${index}]: unknown attribute ${directive.attribute}`);
        }
      });
    }
  }
  if (headToHead !== undefined && (headToHead === null || typeof headToHead !== 'object')) {
    errors.push('headToHead must be an object');
  }
  if (precision !== undefined && !(Number.isInteger(precision) && (precision as number) >= 0)) {
    errors.push('precision must be a whole number of decimal places');
  }

  const drawOptions = validateDrawTallyOptions(tallyPolicy);
  if (drawOptions.error) errors.push(drawOptions.info as string);
  return errors;
}
