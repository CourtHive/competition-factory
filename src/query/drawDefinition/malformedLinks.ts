import { LinkStructures, traversesByFinishingPosition } from '@Query/drawDefinition/linkTraversal';

// constants and types
import { LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { DrawLink } from '@Types/tournamentTypes';

/**
 * THE ONE PLACE a draw's links are asked whether they can be read.
 *
 * Every reader that walks `drawDefinition.links` and every check that refuses a draw for a bad link asks here, so the
 * readers, the integrity scan (`getDrawInconsistencies`), the pre-write refusals and the repair
 * (`repairMalformedLinks`) cannot disagree about what "malformed" means.
 *
 * Two kinds of entry are malformed:
 *  - an entry that is not an object at all (`null`, a string, an array): nothing can be read from it, and a reader
 *    that dereferences it throws;
 *  - a link that traverses BY ROUND (`traversesByRound`, linkTraversal.ts) with no `source.roundNumber` (missing, 0, or
 *    no `source`): it cannot say which round it directs (CA, 2026-10-06: an error, never a link quietly not followed).
 *
 * A link that traverses BY FINISHING POSITION is never malformed for want of a round: a round robin decides who leaves
 * it by tally, and its link names `finishingPositions`, labelled `POSITION` or `WINNER` (CA, 2026-10-23). The 2026-10-06
 * ruling was about elimination links; it was widened to the whole draw (#5692) before round robin links were checked
 * against it, and 294 prod draws carrying a `WINNER` link out of a round robin refused every outcome on dev until this
 * distinction was drawn. Pass the draw: without it the source cannot be seen, and a `WINNER` link is read as a round
 * link.
 */
export function isLinkObject(link: unknown): link is DrawLink {
  return !!link && typeof link === 'object' && !Array.isArray(link);
}

/** a link that traverses by round with no source round, or an entry that is not a link at all */
export function isMalformedRoundLink(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkObject(link)) return true;
  if (traversesByFinishingPosition(link, drawDefinition)) return false;
  return [WINNER, LOSER].includes(link.linkType) && !link.source?.roundNumber;
}
