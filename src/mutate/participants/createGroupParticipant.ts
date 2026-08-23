import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addParticipant } from './addParticipant';
import { UUID } from '@Tools/UUID';

import { ErrorType, INVALID_PARTICIPANT_TYPE, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { OTHER } from '@Constants/participantRoles';

type CreateGroupParticipantType = {
  participantRoleResponsibilities?: string[];
  individualParticipantIds: string[];
  tournamentRecord: Tournament;
  participantRole?: string;
  participantId: string;
  groupName: string;
};

export function createGroupParticipant({
  individualParticipantIds = [],
  participantRoleResponsibilities,
  participantRole = OTHER,
  tournamentRecord,
  participantId,
  groupName,
}: CreateGroupParticipantType): {
  participant?: Participant;
  participantId?: string;
  success?: boolean;
  error?: ErrorType;
  info?: any;
} {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!groupName) return { error: MISSING_VALUE, info: 'Missing groupName' };
  if (!Array.isArray(individualParticipantIds))
    return {
      info: 'Invalid individualParticipantIds',
      error: INVALID_VALUES,
    };

  const participants =
    getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
      tournamentRecord,
    }).participants ?? [];
  const tournamentIndividualParticipantIds = participants.map((participant) => participant.participantId);

  for (const participantId of individualParticipantIds) {
    if (!tournamentIndividualParticipantIds.includes(participantId)) {
      return { error: INVALID_PARTICIPANT_TYPE, participantId };
    }
  }

  const groupParticipant = definedAttributes({
    participantId: participantId || UUID(),
    participantRoleResponsibilities,
    participantName: groupName,
    individualParticipantIds,
    participantType: GROUP,
    participantRole,
  });

  // `addParticipant` emits ADD_PARTICIPANTS itself (addParticipant.ts:232) with an identical payload —
  // `{ tournamentId, participants: [participant] }` on the same topic. This function used to emit a
  // second, hand-rolled copy on top of it, so creating one group queued the notice TWICE.
  //
  // The cost is not an extra callback: subscribers are invoked ONCE per flush with an ARRAY of
  // payloads, so the duplicate showed up as a two-element array where every other single-participant
  // mutation produces one. Consumers that iterate the payloads therefore did the work twice.
  //
  // Fixed by deleting the duplicate rather than by passing `disableNotice: true`. The batch emitters
  // (`addParticipants`) disable the per-participant notice because they collapse N additions into one;
  // a group is a single addition, so there is nothing to batch and the callee's notice is already right.
  const result = addParticipant({
    participant: groupParticipant,
    tournamentRecord,
  });
  if (result.error) return result;

  return { ...SUCCESS, participant: makeDeepCopy(groupParticipant) };
}
