import { structuresOf } from '@Acquire/structureMembers';

// constants and types
import { CONTAINER, LOSER, POSITION, WINNER } from '@Constants/drawDefinitionConstants';
import type { Structure } from '@Types/tournamentTypes';

/**
 * HOW A LINK TRAVERSES: BY FINISHING POSITION OR BY ROUND. Every reader of `drawDefinition.links` that needs to know
 * which kind of link it holds asks here, never `linkType` alone (CA, 2026-10-23).
 *
 *  - BY FINISHING POSITION: the link names `source.finishingPositions`, the places in its source that cross it. A ROUND
 *    ROBIN decides who leaves it by tally, once its groups are complete, so a link out of a round robin is directed by
 *    `finishingPositions` (`[1]`: every group's winner; `[2]`: every runner-up). It may be labelled `POSITION`, or
 *    `WINNER`: both are valid, permanently. The factory writes `POSITION`; records converted from classic TMX (prod:
 *    294 draws, 2017–2023, round robin qualifying into MAIN), the factory's own first generator (2020-09) and the
 *    documentation have written `WINNER`. A `source.roundNumber` on such a link is allowed and decides nothing: the
 *    factory records the groups' final round on a qualifying link.
 *  - BY ROUND: a `WINNER` or `LOSER` link out of an ELIMINATION structure names `source.roundNumber`, the round whose
 *    winners (or losers) cross it, match by match.
 *
 * The label alone cannot tell the two apart for `WINNER`, so the source structure is asked: a `WINNER` link traverses
 * by finishing position only when its source is a round robin (a CONTAINER) AND it names `finishingPositions`. A
 * `WINNER` link out of a round robin naming no `finishingPositions` says nothing about who crosses it: it is a round
 * link with no round, and malformed (`isMalformedRoundLink`), never read as "every finisher". A `LOSER` link out of a
 * round robin is not a finishing-position link: round robin matchUps are never directed by links.
 *
 * Without the draw the source cannot be seen, and a `WINNER` link is read as a round link: pass the draw.
 */

/** what the predicates need to see of the draw: its structures, to ask what kind of structure a link leaves */
export type LinkStructures = { structures?: Structure[] };

/** what the predicates read of a link: an entry of `links` is not trusted to be well formed */
type LinkEntry = {
  linkType?: string;
  source?: { structureId?: string; finishingPositions?: unknown; roundNumber?: number };
};

function isLinkEntry(link: unknown): link is LinkEntry {
  return !!link && typeof link === 'object' && !Array.isArray(link);
}

function namesFinishingPositions(link: LinkEntry): boolean {
  const finishingPositions: unknown = link.source?.finishingPositions;
  return Array.isArray(finishingPositions) && finishingPositions.length > 0;
}

/** is the structure a link leaves a round robin: a CONTAINER of groups */
export function leavesRoundRobin(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkEntry(link)) return false;
  const sourceStructureId = link.source?.structureId;
  if (!sourceStructureId) return false;
  const source = drawDefinition?.structures?.find((structure) => structure?.structureId === sourceStructureId);
  return !!source && (source.structureType === CONTAINER || !!structuresOf(source)?.length);
}

/**
 * Does the link carry participants by their FINISHING POSITION in its source: a `POSITION` link, or a `WINNER` link out
 * of a round robin that names `finishingPositions`.
 */
export function traversesByFinishingPosition(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkEntry(link)) return false;
  if (link.linkType === POSITION) return true;
  return link.linkType === WINNER && namesFinishingPositions(link) && leavesRoundRobin(link, drawDefinition);
}

/** Does the link carry the winners or losers of a ROUND of its source: a `WINNER` or `LOSER` link that is not the above. */
export function traversesByRound(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkEntry(link) || ![WINNER, LOSER].includes(link.linkType as string)) return false;
  return !traversesByFinishingPosition(link, drawDefinition);
}

/** a WINNER link that carries the winners of a round: what readers of match-by-match advancement follow */
export function isRoundWinnerLink(link: unknown, drawDefinition?: LinkStructures): boolean {
  return isLinkEntry(link) && link.linkType === WINNER && traversesByRound(link, drawDefinition);
}
