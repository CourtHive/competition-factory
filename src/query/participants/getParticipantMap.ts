import { addParticipantGroupings } from '@Query/drawDefinition/avoidance/addParticipantGroupings';
import { addIndividualParticipants } from '@Query/participants/addIndividualParticipants';
import { addNationalityCode } from '@Query/participants/addNationalityCode';
import { latestPresenceState } from '@Acquire/presenceAttestations';
import { getScaleValues } from '@Query/participant/getScaleValues';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isObject } from '@Tools/objects';

// constants and types
import { GROUP, PAIR, SIGNED_IN, TEAM } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { ParticipantMap } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

const typeMap = {
  [GROUP]: 'groupParticipantIds',
  [PAIR]: 'pairParticipantIds',
  [TEAM]: 'teamParticipantIds',
};
const membershipMap = {
  [GROUP]: 'groups',
  [TEAM]: 'teams',
};

// build up an object with participantId keys which map to deepCopied participants
// and which include all relevant groupings for each individualParticipant

type GetParticpantsMapArgs = {
  withIndividualParticipants?: boolean | { [key: string]: any };
  tournamentRecord: Tournament;
  convertExtensions?: boolean;
  withSignInStatus?: boolean;
  withScaleValues?: boolean;
  withGroupings?: boolean;
  internalUse?: boolean;
  withISO2?: boolean;
  withIOC?: boolean;
};
export function getParticipantMap({
  withIndividualParticipants,
  convertExtensions,
  tournamentRecord,
  withSignInStatus,
  withScaleValues,
  withGroupings,
  internalUse,
  withISO2,
  withIOC,
}: GetParticpantsMapArgs): {
  missingParticipantIds: string[];
  participantMap: ParticipantMap;
  groupInfo: any;
} {
  const missingParticipantIds: string[] = [];
  const participantMap: ParticipantMap = {};

  // initialize all participants first, to preserve order
  for (const participant of tournamentRecord.participants ?? []) {
    const participantId = participant?.participantId;
    if (participantId) initializeParticipantId({ participantMap, participantId });
  }

  for (const participant of tournamentRecord.participants ?? []) {
    const participantCopy = makeDeepCopy(participant, convertExtensions, internalUse);

    const { participantId, individualParticipantIds, participantType } = participantCopy;

    if (!participantMap[participantId]) {
      missingParticipantIds.push(participantId);
      continue;
    }

    Object.assign(participantMap[participantId].participant, participantCopy);

    if (individualParticipantIds) {
      const result = processIndividualParticipantIds({
        individualParticipantIds,
        participantCopy,
        participantMap,
        participantType,
        participantId,
      });
      if (result.missingParticipantIds.length) {
        missingParticipantIds.push(...result.missingParticipantIds);
      }
    }

    if (withSignInStatus) {
      participantMap[participantId].participant.signedIn = signedIn(participantCopy);
    }

    if (withScaleValues) {
      const { ratings, rankings, seedings } = getScaleValues({ participant: participantCopy });
      participantMap[participantId].participant.seedings = seedings;
      participantMap[participantId].participant.rankings = rankings;
      participantMap[participantId].participant.ratings = ratings;
    }

    if (withIOC || withISO2)
      addNationalityCode({
        participant: participantMap[participantId].participant,
        withISO2,
        withIOC,
      });
  }

  if (withIndividualParticipants) {
    const template = isObject(withIndividualParticipants) ? withIndividualParticipants : undefined;
    addIndividualParticipants({ participantMap, template });
  }

  let groupInfo;
  if (withGroupings) {
    groupInfo = addParticipantGroupings({
      participants: Object.values(participantMap).map(({ participant }) => participant),
      participantsProfile: { convertExtensions },
      deepCopy: false,
    }).groupInfo;
  }

  return { missingParticipantIds, participantMap, groupInfo };
}

function signedIn(participant) {
  // The LATEST recorded state. Deliberately not "present today" — nothing signs anybody out at the end
  // of a day, so this reads SIGNED_IN all week for a Thursday volunteer. Use
  // `getParticipantSignedInOnDate` for the as-of-a-date question.
  return latestPresenceState(participant) === SIGNED_IN;
}

function processIndividualParticipantIds({
  individualParticipantIds,
  participantCopy,
  participantMap,
  participantType,
  participantId,
}) {
  const missingParticipantIds: string[] = [];

  for (const individualParticipantId of individualParticipantIds) {
    const individualParticipant = participantMap[individualParticipantId]?.participant;
    if (!individualParticipant) {
      missingParticipantIds.push(individualParticipantId);
      continue;
    }
    individualParticipant[typeMap[participantType]].push(participantId);

    if ([TEAM, GROUP].includes(participantType)) {
      const { participantRoleResponsibilities, participantOtherName, participantName, participantId, teamId } =
        participantCopy;
      const membership = membershipMap[participantType];
      individualParticipant[membership].push({
        participantRoleResponsibilities,
        participantOtherName,
        participantName,
        participantId,
        teamId,
      });
    }

    if (participantType === PAIR) {
      const partnerParticipantId = individualParticipantIds.find((id) => id !== individualParticipantId);
      participantMap[individualParticipantId].pairIdMap[participantId] = partnerParticipantId;
      participantMap[individualParticipantId].pairIdMap[partnerParticipantId] = participantId;
    }
  }

  return { missingParticipantIds };
}

function initializeParticipantId({ participantMap, participantId }) {
  // nothing to do if participantId is present
  if (participantMap[participantId]) return;

  const counters = {
    walkoverWins: 0,
    defaultWins: 0,
    walkovers: 0,
    defaults: 0,
    losses: 0,
    wins: 0,
  };

  participantMap[participantId] = {
    structureParticipation: {},
    potentialMatchUps: {},
    scheduleConflicts: {},
    scheduleItems: [],
    participant: {
      groupParticipantIds: [],
      pairParticipantIds: [],
      teamParticipantIds: [],
      seedings: {},
      rankings: {},
      ratings: {},
      groups: [],
      teams: [],
    },
    statistics: {},
    opponents: {},
    pairIdMap: {},
    matchUps: {},
    events: {},
    draws: {},
    counters: {
      [SINGLES]: { ...counters },
      [DOUBLES]: { ...counters },
      [TEAM]: { ...counters },
      ...counters,
    },
  };
}
