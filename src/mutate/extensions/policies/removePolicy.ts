import { modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { addExtension } from '@Mutate/extensions/addExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { MISSING_TOURNAMENT_RECORD, POLICY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION,
  EVENT,
  POLICY_TYPE,
  TOURNAMENT_RECORD,
  TOURNAMENT_RECORDS,
} from '@Constants/attributeConstants';

type RemovePolicyArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  policyType: string;
  event?: Event;
};
export function removePolicy(params: RemovePolicyArgs) {
  const checkParams = checkRequiredParameters(params, [
    {
      [POLICY_TYPE]: true,
      _anyOf: {
        [TOURNAMENT_RECORDS]: false,
        [TOURNAMENT_RECORD]: false,
        [DRAW_DEFINITION]: false,
        [EVENT]: false,
      },
    },
  ]);
  if (checkParams.error) return checkParams;
  let policyRemoved;

  const element =
    params.drawDefinition ??
    params.event ??
    ((params.tournamentId || !params.tournamentRecords) && params.tournamentRecord);
  if (element) {
    const result = policyDeletion(element, params.policyType);
    if (!result.error) announcePolicyRemoval(params, element);
    return result;
  } else if (params.tournamentRecords) {
    const tournamentIds = Object.keys(params.tournamentRecords);
    if (!tournamentIds.length) return { error: MISSING_TOURNAMENT_RECORD };
    for (const tournamentId of tournamentIds) {
      const tournamentRecord = params.tournamentRecords[tournamentId];
      const result = policyDeletion(tournamentRecord, params.policyType);
      if (result.error) return result;
      announcePolicyRemoval(params, tournamentRecord);
      policyRemoved = true;
    }
  } else {
    return { error: MISSING_TOURNAMENT_RECORD };
  }

  return policyRemoved ? { ...SUCCESS } : { error: POLICY_NOT_FOUND };
}

/**
 * Applied policies are an extension of the element they were attached to, so removing one modifies
 * that element: the draw, the event, or the tournament record itself.
 */
function announcePolicyRemoval(params: RemovePolicyArgs, element: DrawDefinition | Event | Tournament) {
  const tournamentId = params.tournamentRecord?.tournamentId;
  if (element === params.drawDefinition) {
    modifyDrawNotice({ drawDefinition: params.drawDefinition, eventId: params.event?.eventId, tournamentId });
  } else if (element === params.event) {
    modifyEventNotice({ tournamentId, event: params.event });
  } else {
    const tournamentRecord = element as Tournament;
    modifyTournamentDetailNotice({ tournamentRecord, detail: { extensions: tournamentRecord.extensions ?? [] } });
  }
}

/**
 * The element's OWN applied policies, not the inherited ones: reading them through
 * `getAppliedPolicies` merged the tournament's and the event's into the draw's (and the active
 * record's into each of a competition's records), so removing one policy wrote the others onto
 * an element that never had them.
 */
function policyDeletion(element: DrawDefinition | Event | Tournament, policyType: string) {
  const own = element.extensions?.find((extension) => extension?.name === APPLIED_POLICIES)?.value;
  const appliedPolicies = own ? makeDeepCopy(own, false, true) : {};
  if (appliedPolicies[policyType]) {
    delete appliedPolicies[policyType];

    if (Object.keys(appliedPolicies).length) {
      const extension = { name: APPLIED_POLICIES, value: appliedPolicies };
      addExtension({ element, extension });
    } else {
      removeExtension({ element, name: APPLIED_POLICIES });
    }
    return { ...SUCCESS };
  }

  return { error: POLICY_NOT_FOUND };
}
