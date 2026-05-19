import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

export function getStageParticipantsCount({ drawProfiles, category, gender, useExistingParticipants = false }) {
  const uniqueParticipantsCount = {};
  const stageParticipantsCount = drawProfiles?.reduce((stageParticipantsCount, drawProfile) => {
    const {
      qualifyingPositions = 0,
      participantsCount = 0,
      uniqueParticipants,
      stage = MAIN,
      drawSize = 0,
    } = drawProfile ?? {};

    if (!Object.keys(stageParticipantsCount).includes(stage)) stageParticipantsCount[stage] = 0;

    const stageCount = (participantsCount || drawSize) - qualifyingPositions;
    // When the caller passed pre-built participants to generateTournamentRecord,
    // the pool already exists in tournamentRecord.participants. Skipping the
    // "unique stage" branch keeps the synthesis path (generateEventParticipants)
    // inert; filterConsideredParticipants still applies gender / eventType /
    // participantType filters on the supplied pool.
    const requiresUniqueParticipants =
      !useExistingParticipants && (uniqueParticipants || gender || category || stage === QUALIFYING);

    if (requiresUniqueParticipants) {
      if (!Object.keys(uniqueParticipantsCount).includes(stage)) uniqueParticipantsCount[stage] = 0;
      uniqueParticipantsCount[stage] += stageCount;
    } else {
      stageParticipantsCount[stage] = Math.max(stageParticipantsCount[stage], stageCount);
    }
    return stageParticipantsCount;
  }, {});

  const uniqueParticipantStages = Object.keys(uniqueParticipantsCount);
  uniqueParticipantStages.forEach((stage) => (stageParticipantsCount[stage] += uniqueParticipantsCount[stage]));

  return {
    stageParticipantsCount,
    uniqueParticipantsCount,
    uniqueParticipantStages,
  };
}
