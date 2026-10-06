import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, RoundDrawLink } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

export type UnearnedLinkAdvancement = {
  sourceMatchUp: HydratedMatchUp;
  targetMatchUp: HydratedMatchUp;
  participantId: string;
  link: RoundDrawLink;
};

/**
 * Participants standing across a round link although the source-round matchUp they play in has no result.
 *
 * Crossing a WINNER or LOSER link out of a round means that round's matchUp was decided. Rooted at the SOURCE, not
 * the target: a target round can hold participants the link alone does not explain (a double-elimination Decider
 * seats both finalists, a lucky loser takes a qualifier's place), but nobody playing a matchUp that has no result
 * can have crossed a link out of it. A matchUp holding a BYE advanced its occupant structurally and is not
 * undecided. A double exit is undecided for a WINNER link (it advances nobody) and is left out for a LOSER link,
 * whose handling of a double exit belongs to the exit cascade.
 *
 * The one predicate behind both the ADVANCED_ACROSS_LINK_FROM_UNDECIDED inconsistency and the settle that releases
 * what it finds (`reconcileLinkAdvancements`), so the two cannot disagree about what is unearned.
 */
export function getUnearnedLinkAdvancements({
  inContextDrawMatchUps,
  drawDefinition,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
}): UnearnedLinkAdvancement[] {
  const found: UnearnedLinkAdvancement[] = [];
  const seen = new Set<string>();
  for (const link of drawDefinition.links ?? []) {
    if (link.linkType === 'POSITION' || !link.source.roundNumber) continue;
    const undecided = inContextDrawMatchUps.filter(
      (matchUp) =>
        !matchUp.collectionId &&
        matchUp.structureId === link.source.structureId &&
        matchUp.roundNumber === link.source.roundNumber &&
        !matchUp.winningSide &&
        matchUp.matchUpStatus !== BYE &&
        !(link.linkType === 'LOSER' && isDoubleExit(matchUp.matchUpStatus)),
    );
    for (const sourceMatchUp of undecided) {
      found.push(...acrossLink({ link, sourceMatchUp, inContextDrawMatchUps, seen }));
    }
  }
  return found;
}

/** The source matchUp's participants standing in the link's target structure, at or after its target round. */
function acrossLink({
  inContextDrawMatchUps,
  sourceMatchUp,
  link,
  seen,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  sourceMatchUp: HydratedMatchUp;
  link: RoundDrawLink;
  seen: Set<string>;
}): UnearnedLinkAdvancement[] {
  const playing = new Set((sourceMatchUp.sides ?? []).map((side) => side?.participantId).filter(Boolean));
  if (!playing.size) return [];
  const found: UnearnedLinkAdvancement[] = [];
  for (const targetMatchUp of inContextDrawMatchUps) {
    if (targetMatchUp.collectionId || targetMatchUp.structureId !== link.target.structureId) continue;
    if ((targetMatchUp.roundNumber ?? 0) < link.target.roundNumber) continue;
    for (const side of targetMatchUp.sides ?? []) {
      const participantId = side?.participantId;
      const key = `${targetMatchUp.matchUpId}|${participantId}`;
      if (!participantId || !playing.has(participantId) || seen.has(key)) continue;
      seen.add(key);
      found.push({ link, sourceMatchUp, targetMatchUp, participantId });
    }
  }
  return found;
}
