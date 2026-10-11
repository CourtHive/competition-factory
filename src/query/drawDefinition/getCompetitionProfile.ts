import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import type { CompetitionProfile } from '@Types/competitionProfile';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function getCompetitionProfile({ drawDefinition }: { drawDefinition?: DrawDefinition }): ResultType & {
  competitionProfile?: CompetitionProfile;
} {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  return { ...SUCCESS, competitionProfile: makeDeepCopy(drawDefinition.competitionProfile, undefined, true) };
}
