import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

const ajv = new Ajv({ allowUnionTypes: true, verbose: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
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
