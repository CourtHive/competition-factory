import { applyParticipantPrivacyToGroupInfo, getParticipantPrivacyTemplate } from './participantPrivacy';
import { addParticipantGroupings } from '@Query/drawDefinition/avoidance/addParticipantGroupings';
import { addNationalityCode } from '@Query/participants/addNationalityCode';
import { getScaleValues } from '../participant/getScaleValues';
import { getParticipantMap } from './getParticipantMap';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// Types
import { ContextProfile, ParticipantMap, ParticipantsProfile, PolicyDefinitions } from '@Types/factoryTypes';
import { HydratedParticipant } from '@Types/hydrated';
import { Tournament } from '@Types/tournamentTypes';

/**
 * ⚠️ `policyDefinitions` is accepted for signature parity with the query surfaces that call this, and
 * is DELIBERATELY not applied here. Hydration must return participants whole: `getScaleValues` reads
 * `timeItems`, participant resolution reads `person.personId`, and gender enforcement reads
 * `person.sex` — all of which a privacy policy may deny. Filtering here would silently break context
 * assembly for exactly the callers that asked for privacy.
 *
 * A participant privacy policy is applied at the EMISSION BOUNDARY instead — see
 * `participantPrivacy.ts` and its use in `getTournamentMatchUps` / `getParticipants`. If you are
 * adding a surface that returns participants, filter them there, not here.
 */
type HydrateParticipantsArgs = {
  participantsProfile?: ParticipantsProfile;
  policyDefinitions?: PolicyDefinitions;
  contextProfile?: ContextProfile;
  tournamentRecord: Tournament;
  useParticipantMap?: boolean;
  inContext?: boolean;
};
export function hydrateParticipants({
  participantsProfile,
  useParticipantMap,
  policyDefinitions,
  tournamentRecord,
  contextProfile,
  inContext,
}: HydrateParticipantsArgs): {
  participants?: HydratedParticipant[];
  participantMap?: ParticipantMap;
  groupInfo: any;
} {
  // `groupInfo` is the one thing here a policy CAN govern in place: it is built for the caller and
  // read by nothing inside the engine, so filtering it breaks no downstream assembly. Every surface
  // that emits `groupInfo` gets it from this function, which is why one filter here covers them all.
  const groupInfoTemplate = getParticipantPrivacyTemplate(policyDefinitions);

  if (useParticipantMap) {
    const mapResult = getParticipantMap({
      ...participantsProfile,
      ...contextProfile,
      tournamentRecord,
    });
    return {
      ...mapResult,
      groupInfo: applyParticipantPrivacyToGroupInfo({ groupInfo: mapResult.groupInfo, template: groupInfoTemplate }),
    };
  }

  let participants: HydratedParticipant[] = makeDeepCopy(tournamentRecord.participants, false, true) ?? [];

  if (participantsProfile?.withIOC || participantsProfile?.withISO2)
    participants.forEach((participant) => addNationalityCode({ participant, ...participantsProfile }));

  let groupInfo;
  if ((inContext || participantsProfile?.withGroupings) && participants?.length) {
    ({ participantsWithGroupings: participants, groupInfo } = addParticipantGroupings({
      participantsProfile,
      deepCopy: false,
      participants,
    }));
  }

  if (participantsProfile?.withScaleValues && participants?.length) {
    for (const participant of participants) {
      const { ratings, rankings } = getScaleValues({ participant });
      participant.rankings = rankings;
      participant.ratings = ratings;
    }
  }

  return { participants, groupInfo: applyParticipantPrivacyToGroupInfo({ groupInfo, template: groupInfoTemplate }) };
}
