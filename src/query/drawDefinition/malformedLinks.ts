import { structuresOf } from '@Acquire/structureMembers';

// constants and types
import { CONTAINER, LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { DrawLink, Structure } from '@Types/tournamentTypes';

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
 *
 * TWO WAYS A LINK NAMES ITS SOURCE, and they are not interchangeable:
 *  - BY ROUND (`source.roundNumber`): WINNER and LOSER links. An elimination structure decides who leaves it match by
 *    match, so the link names the round whose winners (or losers) it carries.
 *  - BY FINISHING POSITION (`source.finishingPositions`): POSITION links. A ROUND_ROBIN decides who leaves it by
 *    TALLY, once its groups are complete, so the link names the group finishing positions it carries (`[1]`: every
 *    group's winner). Round robin qualifying into MAIN and round robin into its playoffs are both built this way
 *    (`generateQualifyingStructures`, `processPlayoffGroups`). A `source.roundNumber` is optional on a POSITION link and
 *    never decides who leaves: the factory records the groups' final round on a qualifying link and none on a playoff
 *    link. A POSITION link without a `roundNumber` is CORRECT, and never malformed.
 *
 * The one place the two meet is a legacy label (`isLegacyRoundRobinWinnerLink`): a round robin's link written with
 * `linkType: WINNER` and `finishingPositions`. It is a POSITION link in all but name, and is not malformed either.
 */
export function isLinkObject(link: unknown): link is DrawLink {
  return !!link && typeof link === 'object' && !Array.isArray(link);
}

/** what the link predicates need to see of the draw: its structures, to ask what kind of structure a link leaves */
export type LinkStructures = { structures?: Structure[] };

/**
 * A ROUND ROBIN'S LINK LABELLED WINNER: a POSITION link under a legacy name, never a missing round.
 *
 * Records converted from classic TMX (measured in prod 2026-10-23: 294 draws, 2017–2023, all round robin QUALIFYING into
 * MAIN) carry the link from a round robin qualifying structure as `linkType: WINNER` with
 * `source.finishingPositions: [1]` and no `source.roundNumber`. The factory has written that link as POSITION since
 * 2022-05. The meaning is not in doubt: `finishingPositions` says which group finishers leave, as a POSITION link's
 * does, and a round robin has no round whose winners could leave it. So it is neither malformed nor refused, and
 * `repairMalformedLinks` (and `migrateTournamentRecord`) relabel it POSITION, which changes nothing else about it.
 *
 * All three must hold, so a WINNER link from an ELIMINATION structure with no round stays malformed whatever else it
 * carries: the source is a round robin CONTAINER, the link names `finishingPositions`, and it has no `roundNumber`.
 * Without the draw's structures the source cannot be seen, and the answer is false: the caller then treats the link as
 * the WINNER link it says it is.
 */
export function isLegacyRoundRobinWinnerLink(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkObject(link) || link.linkType !== WINNER || link.source?.roundNumber) return false;
  const finishingPositions: unknown = link.source?.finishingPositions;
  if (!Array.isArray(finishingPositions) || !finishingPositions.length) return false;
  const source = drawDefinition?.structures?.find(
    (structure) => structure?.structureId && structure.structureId === link.source?.structureId,
  );
  return !!source && (source.structureType === CONTAINER || !!structuresOf(source)?.length);
}

/**
 * A WINNER or LOSER link with no source round, or an entry that is not a link at all. Pass the draw: a round robin's
 * legacy WINNER label (`isLegacyRoundRobinWinnerLink`) is recognised only where the source structure can be seen.
 */
export function isMalformedRoundLink(link: unknown, drawDefinition?: LinkStructures): boolean {
  if (!isLinkObject(link)) return true;
  if (isLegacyRoundRobinWinnerLink(link, drawDefinition)) return false;
  return [WINNER, LOSER].includes(link.linkType) && !link.source?.roundNumber;
}
