import { makeDeepCopy } from '@Tools/makeDeepCopy';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { RegistrationProfile, Tournament } from '@Types/tournamentTypes';

export function getRegistrationProfile(params?: { tournamentRecord: Tournament }): {
  registrationProfile?: RegistrationProfile;
  error?: any;
} {
  if (!params?.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { tournamentRecord } = params;
  const registrationProfile = tournamentRecord.registrationProfile
    ? makeDeepCopy(tournamentRecord.registrationProfile)
    : undefined;

  return { registrationProfile };
}
