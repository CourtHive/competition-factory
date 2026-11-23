import { TEAM } from '@Constants/participantConstants';

export function checkIsDual(tournamentRecord) {
  const teamParticipants = tournamentRecord.participants?.filter(({ participantType }) => participantType === TEAM);
  const twoTeams = teamParticipants?.length === 2;
  const event = tournamentRecord.events?.length === 1 && tournamentRecord.events[0];
  const drawDefinition = event?.drawDefinitions?.length === 1 && event.drawDefinitions[0];
  const structure = drawDefinition?.structures?.length === 1 && drawDefinition.structures[0];
  const twoDrawPositions = structure?.positionAssignments?.length === 2;

  return !!(event.tieFormat && twoTeams && twoDrawPositions);
}
