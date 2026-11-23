import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';

export const POLICY_AVOIDANCE_COUNTRY = {
  [POLICY_TYPE_AVOIDANCE]: {
    roundsToSeparate: undefined,
    policyName: 'Nationality Code',
    policyAttributes: [{ key: 'person.nationalityCode' }, { key: 'individualParticipants.person.nationalityCode' }],
  },
};

export default POLICY_AVOIDANCE_COUNTRY;
