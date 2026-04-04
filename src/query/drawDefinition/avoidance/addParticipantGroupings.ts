import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { ParticipantsProfile } from '@Types/factoryTypes';
import { Participant } from '@Types/tournamentTypes';

type AddParticipantGroupingsArgs = {
  participantsProfile?: ParticipantsProfile;
  participants?: Participant[];
  deepCopy?: boolean;
};

export function addParticipantGroupings({
  participantsProfile,
  participants = [],
  deepCopy, // will skip deepCopy only if false
}: AddParticipantGroupingsArgs) {
  const groupMap = new Map<string, { participantId: string; participantName: string }>();

  const participantsWithGroupings =
    deepCopy !== false ? makeDeepCopy(participants, participantsProfile?.convertExtensions, true) : participants;
  const teamParticipants = participantsWithGroupings.filter((participant) => participant.participantType === TEAM);
  const groupParticipants = participantsWithGroupings.filter((participant) => participant.participantType === GROUP);

  // should pairParticipants only consider those that are in the same event as current draw?
  const pairParticipants = participantsWithGroupings.filter((participant) => participant.participantType === PAIR);

  participantsWithGroupings.forEach((participant) => {
    if (participant.participantType === INDIVIDUAL) {
      const { participantId } = participant;
      participant.groupParticipantIds = [];
      participant.teamParticipantIds = [];
      participant.pairParticipantIds = [];
      participant.groups = [];
      participant.teams = [];

      teamParticipants.forEach((team) => {
        (team?.individualParticipantIds ?? []).forEach((individualParticipantId) => {
          if (
            individualParticipantId === participantId &&
            !participant.teamParticipantIds?.includes(team.participantId)
          ) {
            participant.teamParticipantIds.push(team.participantId);
            if (!groupMap.get(team.participantId))
              groupMap.set(team.participantId, {
                participantName: team.participantName,
                participantId: team.participantId,
              });
            participant.teams.push({
              participantRoleResponsibilities: team.participantRoleResponsibilities,
              participantOtherName: team.participantOtherName,
              participantName: team.participantName,
              participantId: team.participantId,
              teamId: team.teamId,
            });
          }
        });
      });
      pairParticipants.forEach((pair) => {
        (pair?.individualParticipantIds ?? []).forEach((individualParticipantId) => {
          if (
            individualParticipantId === participantId &&
            !participant.pairParticipantIds.includes(pair.participantId)
          ) {
            participant.pairParticipantIds.push(pair.participantId);
          }
        });
      });
      groupParticipants.forEach((group) => {
        (group?.individualParticipantIds ?? []).forEach((individualParticipantId) => {
          if (
            individualParticipantId === participantId &&
            !participant.groupParticipantIds.includes(group.participantId)
          ) {
            participant.groupParticipantIds.push(group.participantId);
            participant.groups.push({
              participantRoleResponsibilities: group.participantRoleResponsibilities,
              participantOtherName: group.participantOtherName,
              participantName: group.participantName,
              participantId: group.participantId,
            });
          }
        });
      });
    }
  });

  return { participantsWithGroupings, groupInfo: Object.fromEntries(groupMap) };
}
