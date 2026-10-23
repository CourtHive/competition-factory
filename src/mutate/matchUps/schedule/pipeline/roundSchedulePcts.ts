/**
 * Each profiled round's share placed on its date, written onto the profile's own round objects (`canScheduledMatchUpIds`,
 * `possibleToSchedulePct`, `possibleToSchedule`), which a run returns as `dateSchedulingProfiles`.
 */
type ReportedRound = {
  matchUps?: { matchUpId: string }[];
  canScheduledMatchUpIds?: string[];
  possibleToSchedulePct?: number;
  possibleToSchedule?: boolean;
  matchUpsCount?: number;
};

type ComputeRoundSchedulePctsArgs = {
  scheduledMatchUpIds: { [scheduleDate: string]: string[] };
  dateSchedulingProfile: { venues?: { rounds?: object[] }[] };
  scheduleDate: string;
};

export function computeRoundSchedulePcts({
  scheduledMatchUpIds,
  dateSchedulingProfile,
  scheduleDate,
}: ComputeRoundSchedulePctsArgs) {
  for (const venue of dateSchedulingProfile.venues ?? []) {
    for (const round of (venue.rounds ?? []) as ReportedRound[]) {
      const matchUpIds = round.matchUps?.map(({ matchUpId }) => matchUpId) ?? [];
      const canScheduleMatchUpIds = matchUpIds.filter((matchUpId) =>
        scheduledMatchUpIds[scheduleDate].includes(matchUpId),
      );
      round.canScheduledMatchUpIds = canScheduleMatchUpIds;
      let possibleToSchedulePct =
        Math.round((canScheduleMatchUpIds.length / (round.matchUpsCount ?? Number.NaN)) * 10000) / 100;
      if (possibleToSchedulePct === Infinity || Number.isNaN(possibleToSchedulePct)) possibleToSchedulePct = 0;
      round.possibleToSchedulePct = possibleToSchedulePct;
      if (round.matchUpsCount === canScheduleMatchUpIds.length) {
        round.possibleToSchedule = true;
      }
    }
  }
}
