import { getEliminationDrawSize } from '@Query/participants/getEliminationDrawSize';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { isConvertableInteger } from '@Tools/math';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import {
  MISSING_DRAW_SIZE,
  MISSING_PARTICIPANT_COUNT,
  INVALID_POLICY_DEFINITION,
  MISSING_SEEDCOUNT_THRESHOLDS,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

type GetSeedsCountArgs = {
  policyDefinitions?: PolicyDefinitions;
  requireParticipantCount?: boolean;
  drawSizeProgression?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  participantsCount?: number;
  participantCount?: number;
  drawSize?: any;
  event?: Event;
};

export function getSeedsCount(params: GetSeedsCountArgs): ResultType & { seedsCount?: number } {
  let { drawSizeProgression = false, policyDefinitions, drawSize } = params ?? {};
  const { requireParticipantCount = true, tournamentRecord, drawDefinition, event } = params ?? {};
  const stack = 'getSeedsCount';

  const participantsCount = params?.participantsCount ?? params?.participantCount;

  if (!policyDefinitions) {
    const result = getPolicyDefinitions({
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
    policyDefinitions = result.policyDefinitions;
  }
  const validParticpantCount = isConvertableInteger(participantsCount);

  if (participantsCount && !validParticpantCount)
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { participantsCount },
      stack,
    });
  if (requireParticipantCount && !validParticpantCount)
    return decorateResult({
      result: { error: MISSING_PARTICIPANT_COUNT },
      stack,
    });

  if (Number.isNaN(Number(drawSize))) {
    if (participantsCount) {
      ({ drawSize } = getEliminationDrawSize({
        participantsCount,
      }));
    } else {
      return decorateResult({ result: { error: MISSING_DRAW_SIZE }, stack });
    }
  }

  const consideredParticipantCount = (requireParticipantCount && participantsCount) || drawSize;
  if (consideredParticipantCount && consideredParticipantCount > drawSize)
    return { error: PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE };

  const policy = policyDefinitions?.[POLICY_TYPE_SEEDING];
  if (!policy) return { error: INVALID_POLICY_DEFINITION };

  const seedsCountThresholds = policy.seedsCountThresholds;
  if (!seedsCountThresholds) return { error: MISSING_SEEDCOUNT_THRESHOLDS };
  if (policy.drawSizeProgression !== undefined) drawSizeProgression = policy.drawSizeProgression;

  const relevantThresholds = seedsCountThresholds.filter((threshold) => {
    return drawSizeProgression ? threshold.drawSize <= drawSize : drawSize === threshold.drawSize;
  });

  const seedsCount = relevantThresholds.reduce((seedsCount, threshold) => {
    return participantsCount && participantsCount >= threshold.minimumParticipantCount
      ? threshold.seedsCount
      : seedsCount;
  }, 0);

  return { seedsCount };
}
