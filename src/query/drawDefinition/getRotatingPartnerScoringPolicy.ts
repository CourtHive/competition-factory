import { getRotatingPartnerTallyPolicy } from '@Query/drawDefinition/getRotatingPartnerTallyPolicy';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isCompetitionProfile } from '@Validators/competitionProfile';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  isRotatingPartnerScoringPolicyWithTimed,
  resolveRotatingPartnerScoringConfiguration,
} from '@Helpers/rotatingPartners/scoringContract';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import type { ResultType } from '@Types/factoryTypes';
import type {
  RotatingPartnerScoreContractWithTimed,
  RotatingPartnerScoringPolicyWithTimed,
  RotatingPartnerScoringVariant,
} from '@Types/rotatingPartnerScoring';

const defaultPolicy: RotatingPartnerScoringPolicyWithTimed = {
  defaultVariant: { tieResolution: 'ALLOW' },
  permittedVariants: [
    { tieResolution: 'ALLOW' },
    { tieResolution: 'DECIDING_POINT' },
    { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 },
  ],
};

/** Resolved whole-policy precedence is shared with all other factory policy queries. */
export function getRotatingPartnerScoringPolicy(params: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  event?: Event;
  selectedVariant?: RotatingPartnerScoringVariant;
}): ResultType & {
  scoringPolicy?: RotatingPartnerScoringPolicyWithTimed;
  contract?: RotatingPartnerScoreContractWithTimed;
  selectionLocked?: boolean;
} {
  const profile = params.drawDefinition?.competitionProfile;
  if (!params.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!isCompetitionProfile(profile) || profile.format === 'LADDER') return { error: INVALID_VALUES };
  // A timed draw with one known structure resolves its inherited rules before organizer selection.
  const structure =
    params.structure ??
    (profile.scoring.kind === 'TIMED' && params.drawDefinition.structures?.length === 1
      ? params.drawDefinition.structures[0]
      : undefined);
  const context = { ...params, structure };
  const { appliedPolicies } = getAppliedPolicies(context);
  const scoring = appliedPolicies?.[POLICY_TYPE_SCORING];
  const section: unknown = scoring?.rotatingPartners;
  if (scoring && Object.hasOwn(scoring, 'rotatingPartners') && section === undefined)
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy section' };
  if (section !== undefined && (!section || typeof section !== 'object' || Array.isArray(section)))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy section' };
  const configured: unknown = section === undefined ? undefined : (section as Record<string, unknown>)[profile.format];
  const hasConfigured = section !== undefined && Object.hasOwn(section, profile.format);
  const scoringPolicy = hasConfigured ? configured : defaultPolicy;
  if (!isRotatingPartnerScoringPolicyWithTimed(scoringPolicy))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy' };
  const tally = getRotatingPartnerTallyPolicy(context);
  if (tally.error) return tally;
  const resolved = resolveRotatingPartnerScoringConfiguration({
    scoring: {
      ...profile.scoring,
      ...(params.selectedVariant === undefined ? {} : { selectedVariant: params.selectedVariant }),
    },
    policy: scoringPolicy,
    tallyPolicy: tally.tallyPolicy,
  });
  if (resolved.error) return resolved;
  return { ...resolved, scoringPolicy: makeDeepCopy(scoringPolicy, undefined, true) };
}
