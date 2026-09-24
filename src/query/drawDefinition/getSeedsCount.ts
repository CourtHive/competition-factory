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

/**
 * The seed count the active SEEDING policy yields for a draw size and participant count, plus the
 * allowance — if any — for seeds ABOVE that count.
 *
 * `additionalSeedsAllowed` is reported, never folded into `seedsCount`. A caller asking "how many
 * seeds does this draw have" must not silently receive a number that includes protections nobody
 * has claimed; the two are different questions and the callers that need the ceiling
 * (`initializeStructureSeedAssignments`) add them deliberately.
 *
 * It is 0 when no threshold matched. An allowance is expressed relative to a count, so there is
 * nothing to be additional TO.
 */
export function getSeedsCount(
  params: GetSeedsCountArgs,
): ResultType & { additionalSeedsAllowed?: number; seedsCount?: number } {
  let { drawSizeProgression = false, policyDefinitions, drawSize } = params ?? {};
  const { requireParticipantCount = true, tournamentRecord, drawDefinition, event } = params ?? {};
  const stack = 'getSeedsCount';

  const participantsCount = params?.participantsCount ?? params?.participantCount;

  if (!policyDefinitions) {
    // `policyTypes` defaults to [] and getPolicyDefinitions returns only the types it is asked
    // for — so omitting it returned `{ info: 'Policy not found' }` for EVERY call, and this
    // function then failed with INVALID_POLICY_DEFINITION even where a seeding policy was
    // attached. It is an engine method: a consumer asking a drawId how many seeds it gets was
    // refused unless it also passed the policy it was asking about.
    const result = getPolicyDefinitions({
      policyTypes: [POLICY_TYPE_SEEDING],
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

  const additionalSeedsAllowed = seedsCount ? (policy.additionalSeeds?.maxCount ?? 0) : 0;

  return { seedsCount, additionalSeedsAllowed };
}
