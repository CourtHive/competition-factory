export type DailyLimits = { [counterName: string]: number };

export type DailyLimitOverrides = {
  participants?: { [participantId: string]: DailyLimits }; // a policy's per-participant matchUpDailyLimits
  tournaments?: { [tournamentId: string]: DailyLimits }; // each tournament's own defaults
};
