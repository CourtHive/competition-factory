import { modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { validateDrawTallyOptions } from '@Query/matchUps/roundRobinTally/drawnResults';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { addExtension } from '@Mutate/extensions/addExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, TournamentRecords, ResultType } from '@Types/factoryTypes';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { DrawDefinition, Event, Extension, Tournament } from '@Types/tournamentTypes';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { isObject, isString } from '@Tools/objects';
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
  const tallyValidation = validateDrawTallyOptions(params.policyDefinitions?.[POLICY_TYPE_ROUND_ROBIN_TALLY]);
  if (tallyValidation.error) return tallyValidation;

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
    } else if (params.event && params.tournamentRecord) {
      // applied policies are an event extension. Only a call that names its tournament is announced:
      // the mock generators attach policies to an event before it is added to any record.
      modifyEventNotice({
        tournamentId: params.tournamentRecord.tournamentId,
        event: params.event,
      });
    } else if (element === params.tournamentRecord) {
      // the tournament's own policies are a root extension
      modifyTournamentDetailNotice({ tournamentRecord: element, detail: { extensions: element.extensions ?? [] } });
    }
  } else if (params.tournamentRecords) {
    const tournamentIds = Object.keys(params.tournamentRecords);
    if (!tournamentIds.length) return { error: MISSING_TOURNAMENT_RECORD };
    for (const tournamentId of tournamentIds) {
      const tournamentRecord = params.tournamentRecords[tournamentId];
      const result = policyAttachement(params, tournamentRecord);
      // a record that already holds every policy given takes none, and the others still take theirs: refusing here
      // returned an error after the records before it were written (an error changes nothing, CA 2026-10-18)
      if (result.error && result.error !== EXISTING_POLICY_TYPE) return result;
      if (!result.applied?.length) continue;
      applied.push(...result.applied);
      modifyTournamentDetailNotice({ tournamentRecord, detail: { extensions: tournamentRecord.extensions ?? [] } });
    }
  } else {
    return { error: MISSING_TOURNAMENT_RECORD };
  }

  return !applied.length ? { error: EXISTING_POLICY_TYPE } : { ...SUCCESS, applied };
}

/**
 * The ELEMENT's own policies, never the merged tournament + event + draw view (CA 2026-10-18: a bug). Reading the
 * merged view wrote every inherited policy onto the element with the one attached, and let a policy inherited from
 * the tournament refuse a draw- or event-level attach (EXISTING_POLICY_TYPE). Only a policy already attached to this
 * element refuses, unless `allowReplacement`; one attached here overrides an inherited one, as readers resolve it.
 */
function ownAppliedPolicies(element?: { extensions?: Extension[] }): PolicyDefinitions {
  const value = element?.extensions?.find((extension) => extension?.name === APPLIED_POLICIES)?.value;
  return value ? makeDeepCopy(value, false, true) : {};
}

function policyAttachement(params: any, element: any): ResultType & { applied?: string[] } {
  const appliedPolicies = ownAppliedPolicies(element);
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
