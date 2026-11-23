import { isRotatingPartnerTallyPolicy } from '@Validators/rotatingPartnerTallyPolicy';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';

// constants and types
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_ROTATING_PARTNER_TALLY } from '@Constants/policyConstants';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const defaultPolicy: RotatingPartnerTallyPolicy = {
  version: 1,
  decidingPoints: 'INCLUDE',
  overtimePoints: 'INCLUDE',
  statusTreatments: {},
};

/** The whole governing policy is copied into each round before any results are recorded. */
export function getRotatingPartnerTallyPolicy(params: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  structureId?: string;
  event?: Event;
}): ResultType & { tallyPolicy?: RotatingPartnerTallyPolicy } {
  if (!isRotatingPartnerDraw(params.drawDefinition, params.event)) return { error: INVALID_VALUES };
  const structure =
    params.structure ??
    params.drawDefinition?.structures?.find((candidate) => candidate.structureId === params.structureId);
  if (params.structureId && !structure) return { error: INVALID_VALUES, info: 'unknown tally policy structure' };
  const { appliedPolicies } = getAppliedPolicies({ ...params, structure });
  const configured = appliedPolicies?.[POLICY_TYPE_ROTATING_PARTNER_TALLY];
  const present = appliedPolicies && Object.hasOwn(appliedPolicies, POLICY_TYPE_ROTATING_PARTNER_TALLY);
  const tallyPolicy = present ? configured : defaultPolicy;
  if (!isRotatingPartnerTallyPolicy(tallyPolicy))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner tally policy' };
  return { ...SUCCESS, tallyPolicy: structuredClone(tallyPolicy) };
}
