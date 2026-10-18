import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';

type GetParticipantClashesArgs = {
  drawIdOf: (matchUpId: string) => string | undefined;
  excludeParticipantIds?: Set<string>;
  reachability: ParticipantReachability;
  otherMatchUpIds?: string[];
  depth?: 'near' | 'all';
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
 * Pairs are taken within `matchUpIds`, or between `matchUpIds` and `otherMatchUpIds` when given. `depth: 'all'` reads
 * every potential however far away (the deep checks), less any `excludeParticipantIds`.
 *
 * `clashingPairs` holds each clashing pair once, `[matchUpId, otherMatchUpId]` when `otherMatchUpIds` is given, so a
 * caller can cite for each matchUp only the matchUps it clashes with.
 */
export function getParticipantClashes({
  excludeParticipantIds,
  depth = 'near',
  otherMatchUpIds,
  reachability,
  matchUpIds,
  drawIdOf,
}: GetParticipantClashesArgs): {
  clashingPairs: [string, string][];
  clashingMatchUpIds: string[];
  participantIds: string[];
} {
  const clashingPairs: [string, string][] = [];
  const clashingMatchUpIds = new Set<string>();
  const participantIds = new Set<string>();

  const pairs: [string, string][] = otherMatchUpIds
    ? matchUpIds.flatMap((a) => otherMatchUpIds.filter((b) => b !== a).map((b): [string, string] => [a, b]))
    : matchUpIds.flatMap((a, index) => matchUpIds.slice(index + 1).map((b): [string, string] => [a, b]));

  for (const [a, b] of pairs) {
    const reachA = getReachableParticipantIds(reachability, a);
    const reachB = getReachableParticipantIds(reachability, b);
    const shared = reachA[depth].filter(
      (participantId) => reachB[depth].includes(participantId) && !excludeParticipantIds?.has(participantId),
    );
    const alternatives =
      drawIdOf(a) === drawIdOf(b) && !reachability.upstream[a]?.has(b) && !reachability.upstream[b]?.has(a);

    let clashes = false;
    for (const participantId of shared) {
      const certainOfBoth = reachA.certain.includes(participantId) && reachB.certain.includes(participantId);
      if (alternatives && !certainOfBoth) continue;
      participantIds.add(participantId);
      clashes = true;
    }
    if (clashes) {
      clashingPairs.push([a, b]);
      clashingMatchUpIds.add(a);
      clashingMatchUpIds.add(b);
    }
  }

  return { clashingPairs, clashingMatchUpIds: [...clashingMatchUpIds], participantIds: [...participantIds] };
}
