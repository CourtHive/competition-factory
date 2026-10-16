import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type CompletionOptions = {
  matchUpStatusProfile?: Partial<Record<MatchUpStatusUnion, number>>;
  completeAllMatchUps?: boolean | string;
  randomWinningSide?: boolean;
};

/**
 * Resolves the completion options for one draw. A value set on the drawProfile takes precedence over the
 * value passed for the whole generation (top-level, or eventProfile for `modifyTournamentRecord`);
 * an option the drawProfile leaves undefined falls back to that outer value.
 */
export function resolveCompletionOptions(
  drawProfile: CompletionOptions | undefined,
  outer: CompletionOptions,
): CompletionOptions {
  return {
    matchUpStatusProfile: drawProfile?.matchUpStatusProfile ?? outer.matchUpStatusProfile,
    completeAllMatchUps: drawProfile?.completeAllMatchUps ?? outer.completeAllMatchUps,
    randomWinningSide: drawProfile?.randomWinningSide ?? outer.randomWinningSide,
  };
}
