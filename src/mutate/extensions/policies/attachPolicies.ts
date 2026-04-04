import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { addExtension } from '@Mutate/extensions/addExtension';

// constants and types
import { PolicyDefinitions, TournamentRecords, ResultType } from '@Types/factoryTypes';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { isObject, isString } from '@Tools/objects';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_POLICY_TYPE,
  INVALID_VALUES,
  MISSING_POLICY_DEFINITION,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';
import {
  DRAW_DEFINITION,
  EVENT,
  POLICY_DEFINITIONS,
  TOURNAMENT_RECORD,
  TOURNAMENT_RECORDS,
} from '@Constants/attributeConstants';

type AttachPoliciesArgs = {
  tournamentRecords?: TournamentRecords;
  policyDefinitions: PolicyDefinitions;
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  allowReplacement?: boolean;
  tournamentId?: string;
  event?: Event;
};

export function attachPolicies(params: AttachPoliciesArgs): ResultType & { applied?: string[] } {
  const checkParams = checkRequiredParameters(params, [
    {
      _anyOf: {
        [TOURNAMENT_RECORDS]: false,
        [TOURNAMENT_RECORD]: false,
        [DRAW_DEFINITION]: false,
        [EVENT]: false,
      },
      [POLICY_DEFINITIONS]: true,
    },
  ]);
  if (checkParams.error) return checkParams;

  const applied: string[] = [];

  const element =
    params.drawDefinition ??
    params.event ??
    ((params.tournamentId || !params.tournamentRecords) && params.tournamentRecord);

  if (element) {
    const result = policyAttachement(params, element);
    if (result.error) return result;
    applied.push(...(result?.applied ?? []));

    if (params.drawDefinition) {
      modifyDrawNotice({
        drawDefinition: params.drawDefinition,
        tournamentId: params.tournamentId,
      });
    }
  } else if (params.tournamentRecords) {
    const tournamentIds = Object.keys(params.tournamentRecords);
    if (!tournamentIds.length) return { error: MISSING_TOURNAMENT_RECORD };
    for (const tournamentId of tournamentIds) {
      const tournamentRecord = params.tournamentRecords[tournamentId];
      const result = policyAttachement(params, tournamentRecord);
      if (result.error) return result;
      applied.push(...(result?.applied ?? []));
    }
  } else {
    return { error: MISSING_TOURNAMENT_RECORD };
  }

  return !applied.length ? { error: EXISTING_POLICY_TYPE } : { ...SUCCESS, applied };
}

function policyAttachement(params: any, element: any): ResultType & { applied?: string[] } {
  const appliedPolicies = getAppliedPolicies(params).appliedPolicies ?? {};
  element.extensions ??= [];
  const applied: string[] = [];

  const policyTypes = Object.keys(params.policyDefinitions);
  if (!policyTypes.length) return { error: MISSING_POLICY_DEFINITION };

  for (const policyType of policyTypes) {
    if (!appliedPolicies[policyType] || params.allowReplacement) {
      const policy = params.policyDefinitions[policyType];
      if (!policy) continue;
      if (!isObject(policy)) return { error: INVALID_VALUES };
      const { policyName, ...values } = policy;
      if (!values || !Object.keys(values).length || (policyName && !isString(policyName)))
        return { error: INVALID_VALUES };
      appliedPolicies[policyType] = params.policyDefinitions[policyType];
      applied.push(policyType);
    }
  }

  if (applied?.length) {
    const extension = { name: APPLIED_POLICIES, value: appliedPolicies };
    return { ...addExtension({ element, extension }), applied };
  }

  return { applied, error: EXISTING_POLICY_TYPE };
}
