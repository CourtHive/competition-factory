import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';

type GetParticipantClashesArgs = {
  drawIdOf: (matchUpId: string) => string | undefined;
  reachability: ParticipantReachability;
  otherMatchUpIds?: string[];
  matchUpIds: string[];
};

/**
 * The matchUps that would ask one participant to be in two places at once.
 *
 * A participant who can play two matchUps clashes there UNLESS the two are alternatives for them: in the same draw,
 * neither feeding the other, and the participant not certain to play both. A feeder's winner path and loser path are
 * such alternatives (main R2 and the consolation matchUp its losers feed); two round robin matchUps the participant is
 * placed in are not, and nor are a matchUp and one it feeds. Participants are those certain to play a matchUp or one
 * matchUp away from it (the near potentials).
 *
 * Pairs are taken within `matchUpIds`, or between `matchUpIds` and `otherMatchUpIds` when given.
 */
export function getParticipantClashes({
  otherMatchUpIds,
  reachability,
  matchUpIds,
  drawIdOf,
}: GetParticipantClashesArgs): { clashingMatchUpIds: string[]; participantIds: string[] } {
  const clashingMatchUpIds = new Set<string>();
  const participantIds = new Set<string>();

  const pairs: [string, string][] = otherMatchUpIds
    ? matchUpIds.flatMap((a) => otherMatchUpIds.filter((b) => b !== a).map((b): [string, string] => [a, b]))
    : matchUpIds.flatMap((a, index) => matchUpIds.slice(index + 1).map((b): [string, string] => [a, b]));

  for (const [a, b] of pairs) {
    const reachA = getReachableParticipantIds(reachability, a);
    const reachB = getReachableParticipantIds(reachability, b);
    const shared = reachA.near.filter((participantId) => reachB.near.includes(participantId));
    const alternatives =
      drawIdOf(a) === drawIdOf(b) && !reachability.upstream[a]?.has(b) && !reachability.upstream[b]?.has(a);

    for (const participantId of shared) {
      const certainOfBoth = reachA.certain.includes(participantId) && reachB.certain.includes(participantId);
      if (alternatives && !certainOfBoth) continue;
      participantIds.add(participantId);
      clashingMatchUpIds.add(a);
      clashingMatchUpIds.add(b);
    }
  }

  return { clashingMatchUpIds: [...clashingMatchUpIds], participantIds: [...participantIds] };
}
