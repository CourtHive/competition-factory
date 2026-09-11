import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

const ajv = new Ajv({ allowUnionTypes: true, verbose: true, allErrors: true });

/**
 * Ajv `date-time` format validator. Accepts ISO 8601 strings and `Date`
 * instances (which are stringified via `.toISOString()` before parsing).
 * Returns `false` for unparseable input. Exported for direct unit-testing —
 * Ajv only invokes this when a schema asserts `format: 'date-time'`, which
 * the current rankingPolicy schema does not, so the callback is otherwise
 * dead from a coverage standpoint.
 */
export function dateTimeFormat(dateTime: any): boolean {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
}
ajv.addFormat('date-time', dateTimeFormat);
addFormats(ajv);

const schema = JSON.parse(fs.readFileSync('./src/global/schema/rankingPolicy.schema.json', { encoding: 'utf8' }));

const compiledValidator = ajv.compile(schema);

/**
 * Validates a wrapped policy definitions object (keyed by POLICY_TYPE_RANKING_POINTS)
 * against the rankingPolicy JSON schema. Returns the inner policy plus the
 * compiled validator result for assertion convenience.
 */
export function validateRankingPolicy(wrapped: Record<string, any>) {
  const policy = wrapped[POLICY_TYPE_RANKING_POINTS];
  const valid = compiledValidator(policy);
  return {
    policy,
    valid,
    errors: compiledValidator.errors,
    errorsText: compiledValidator.errors
      ? ajv.errorsText(compiledValidator.errors, { dataVar: 'policy', separator: '\n' })
      : '',
  };
}
