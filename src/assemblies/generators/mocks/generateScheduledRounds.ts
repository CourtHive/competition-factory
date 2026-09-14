import { addSchedulingProfileRound } from '@Mutate/matchUps/schedule/addSchedulingProfileRound';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { intersection, unique } from '@Tools/arrays';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';

type GenerateSchedulingProfileArgs = {
  tournamentRecord: Tournament;
  schedulingProfile: any;
};
export function generateScheduledRounds({ schedulingProfile, tournamentRecord }: GenerateSchedulingProfileArgs): {
  scheduledRounds?: any;
  error?: ErrorType;
} {
  if (typeof schedulingProfile !== 'object') return { error: INVALID_VALUES };

  const containedStructures = getContainedStructures({
    tournamentRecord,
  }).containedStructures;
  const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];

  const { tournamentId } = tournamentRecord;
  const scheduledRounds: any[] = [];

  for (const dateProfile of schedulingProfile) {
    const { scheduleDate, venues = [] } = dateProfile;

    for (const venue of venues) {
      const { rounds, venueId } = venue;

      for (const round of rounds) {
        const { drawId, winnerFinishingPositionRange, roundSegment } = round;

        const targetMatchUps = matchUps.filter((matchUp) => {
          const targetRange =
            winnerFinishingPositionRange?.indexOf('-') > 0 && winnerFinishingPositionRange.split('-').map((x) => +x);
          const range = matchUp.finishingPositionRange?.winner;

          return (
            matchUp.drawId === drawId &&
            (!round.roundNumber || matchUp.roundNumber === round.roundNumber) &&
            (!range ||
              !targetRange ||
              intersection(range, targetRange).length === 2 ||
              (unique(range).length === unique(targetRange).length &&
                intersection(range, targetRange).length === unique(range).length))
          );
        });

        const targetMatchUp = targetMatchUps[0];

        if (targetMatchUp) {
          const { eventId, roundNumber, drawName, structureName, roundName } = targetMatchUp;
          let structureId = targetMatchUp.structureId;

          if (roundNumber && !winnerFinishingPositionRange) {
            structureId =
              Object.keys(containedStructures).find((containingStructureId) =>
                containedStructures[containingStructureId].includes(structureId),
              ) ?? structureId;
          }

          const roundToSchedule = {
            tournamentId,
            structureId,
            roundNumber,
            roundSegment,
            eventId,
            drawId,
          };

          const result = addSchedulingProfileRound({
            tournamentRecords: { [tournamentId]: tournamentRecord },
            round: roundToSchedule,
            scheduleDate,
            venueId,
          });
          if (result.error) return result;

          scheduledRounds.push({
            structureName,
            roundName,
            drawName,
            ...roundToSchedule,
          });
        }
      }
    }
  }

  return { scheduledRounds };
}
