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
 *  - a WINNER or LOSER link with no `source.roundNumber` (missing, 0, or no `source`): it cannot say which round it
 *    directs (CA, 2026-10-06: an error, never a link quietly not followed).
 */
export function isLinkObject(link: unknown): link is DrawLink {
  return !!link && typeof link === 'object' && !Array.isArray(link);
}

/** a WINNER or LOSER link with no source round, or an entry that is not a link at all */
export function isMalformedRoundLink(link: unknown): boolean {
  if (!isLinkObject(link)) return true;
  return [WINNER, LOSER].includes(link.linkType) && !link.source?.roundNumber;
}
