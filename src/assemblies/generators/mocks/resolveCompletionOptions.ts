import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type CompletionOptions = {
  matchUpStatusProfile?: Partial<Record<MatchUpStatusUnion, number>>;
  completeAllMatchUps?: boolean | string;
  randomWinningSide?: boolean;
};

/**
 * Resolves the completion options for one draw or event. A value set on the inner profile takes precedence over
 * the outer value (drawProfile over eventProfile, eventProfile over top-level); an option the inner profile leaves
 * undefined falls back to the outer value.
 */
export function resolveCompletionOptions(
  profile: CompletionOptions | undefined,
  outer: CompletionOptions,
): CompletionOptions {
  return {
    matchUpStatusProfile: profile?.matchUpStatusProfile ?? outer.matchUpStatusProfile,
    completeAllMatchUps: profile?.completeAllMatchUps ?? outer.completeAllMatchUps,
    randomWinningSide: profile?.randomWinningSide ?? outer.randomWinningSide,
  };
}
