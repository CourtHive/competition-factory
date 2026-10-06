import { validateSchedulingProfile } from '@Validators/validateSchedulingProfile';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getRoundId } from '@Query/matchUps/scheduling/schedulingUtils';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { ErrorType, INVALID_TOURNAMENT_RECORD, NOT_FOUND } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetProfileRoundsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  schedulingProfile?: any;
  withRoundId?: boolean;
};
export function getProfileRounds({
  tournamentRecords,
  schedulingProfile,
  tournamentRecord,
  withRoundId,
}: GetProfileRoundsArgs): {
  segmentedRounds?: { [key: string]: any };
  profileRounds?: any[];
  error?: ErrorType;
} {
  if (tournamentRecord && !tournamentRecords) {
    if (typeof tournamentRecord !== 'object') {
      return { error: INVALID_TOURNAMENT_RECORD };
    } else {
      tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
    }
  }

  if (schedulingProfile) {
    const profileValidity = validateSchedulingProfile({
      tournamentRecords,
      schedulingProfile,
    });

    if (profileValidity.error) return profileValidity;
  }

  if (!schedulingProfile && tournamentRecords) {
    const result = getSchedulingProfile({ tournamentRecords });
    if (result.error) return result;
    schedulingProfile = result.schedulingProfile;
  }

  if (!schedulingProfile) return { error: NOT_FOUND };

  const segmentedRounds: { [key: string]: number } = {};

  const profileRounds = schedulingProfile
    .map(({ venues, scheduleDate }) =>
      venues.map(({ rounds }) =>
        rounds.map((round) => {
          const roundRef = getRoundId(round);
          if (roundRef.roundSegment?.segmentsCount) {
            segmentedRounds[roundRef.id] = roundRef.roundSegment.segmentsCount;
          }
          return definedAttributes({
            id: withRoundId ? roundRef.id : undefined,
            scheduleDate,
            ...roundRef,
          });
        }),
      ),
    )
    .flat(Infinity);

  return { profileRounds, segmentedRounds };
}
