import { expectedParticipantType } from '@Query/event/participantTypeForEvent';
import { getParticipants } from '@Query/participants/getParticipants';
import { isUngrouped } from '@Query/entries/isUngrouped';
import { coercedGender } from '@Helpers/coercedGender';
import { isGendered } from './isGendered';
import { unique } from '@Tools/arrays';
import { isMixed } from './isMixed';
import { isAny } from './isAny';

// constants, fixtures and types
import { DOUBLES_EVENT, HYBRID_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { Entry, Event, Participant, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { ParticipantMap, PolicyDefinitions } from '@Types/factoryTypes';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_ENTRIES,
  INVALID_VALUES,
  MISSING_EVENT,
  MISSING_PARTICIPANTS,
} from '@Constants/errorConditionConstants';

type CheckValidEntriesArgs = {
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  participantMap?: ParticipantMap;
  tournamentRecord?: Tournament;
  participants?: Participant[];
  consideredEntries?: Entry[];
  enforceGender?: boolean;
  event: Event;
};
export function checkValidEntries({
  consideredEntries,
  policyDefinitions,
  tournamentRecord,
  appliedPolicies,
  participantMap,
  enforceGender,
  participants,
  event,
}: CheckValidEntriesArgs) {
  if ((!participants || !participantMap) && tournamentRecord) {
    ({ participants, participantMap } = getParticipants({
      tournamentRecord,
    }));
  }

  if (!participants) return { error: MISSING_PARTICIPANTS };
  if (!Array.isArray(participants)) return { error: INVALID_VALUES };
  if (!event) return { error: MISSING_EVENT };

  const matchUpActionsPolicy =
    policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const genderEnforced = (enforceGender ?? matchUpActionsPolicy?.participants?.enforceGender) !== false;

  const { eventType, gender: eventGender } = event;
  const isDoubles = eventType === DOUBLES_EVENT;
  const participantType = expectedParticipantType(eventType);

  const entryStatusMap = Object.assign(
    {},
    ...(consideredEntries ?? event.entries ?? []).map((entry) => ({
      [entry.participantId]: entry.entryStatus,
    })),
  );

  const enteredParticipantIds = Object.keys(entryStatusMap);
  const enteredParticipants = participants.filter((participant) =>
    enteredParticipantIds.includes(participant.participantId),
  );

  const invalidEntries = enteredParticipants.filter((participant) => {
    const mismatch = getMisMatch({ participant, participantType, eventType, entryStatusMap });
    const validGender = getValidGender({
      genderEnforced,
      participantMap,
      eventGender,
      participant,
      isDoubles,
      mismatch,
    });

    return mismatch || !validGender;
  });

  if (invalidEntries.length) {
    const invalidParticipantIds = invalidEntries.map((participant) => participant.participantId);
    return { error: INVALID_ENTRIES, invalidParticipantIds };
  }

  return { ...SUCCESS, valid: true };
}

function getMisMatch({ participant, participantType, eventType, entryStatusMap }) {
  // HYBRID events accept both INDIVIDUAL and PAIR participants
  if (eventType === HYBRID_EVENT && [INDIVIDUAL, PAIR].includes(participant.participantType)) return false;

  const entryStatus = entryStatusMap[participant.participantId];
  const ungroupedParticipant =
    eventType &&
    [DOUBLES_EVENT, TEAM_EVENT].includes(eventType) &&
    participant.participantType === INDIVIDUAL &&
    (isUngrouped(entryStatus) || entryStatus === WITHDRAWN);
  return participant.participantType !== participantType && !ungroupedParticipant;
}

function getValidGender(params) {
  const { participant, participantMap, eventGender, mismatch, isDoubles, genderEnforced } = params;
  const pairGender: string[] =
    (!mismatch &&
      isDoubles &&
      unique(
        participant?.individualParticipantIds
          ?.map((id) => participantMap?.[id]?.participant?.person?.sex)
          .filter(Boolean) ?? [],
      )) ||
    [];

  const validPairGender =
    !eventGender ||
    !pairGender?.length ||
    isAny(eventGender) ||
    (isGendered(eventGender) && coercedGender(pairGender[0]) === coercedGender(eventGender)) ||
    (isMixed(eventGender) &&
      ((pairGender.length === 1 && participant.individualParticipantIds?.length === 1) || pairGender.length === 2));

  const personGender = participant?.person?.sex as unknown;

  const validPersonGender =
    !participant?.person ||
    !eventGender ||
    isMixed(eventGender) ||
    isAny(eventGender) ||
    (isGendered(eventGender) && coercedGender(personGender) === coercedGender(eventGender));

  return !genderEnforced || (validPairGender && validPersonGender);
}
