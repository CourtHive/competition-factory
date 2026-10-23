import { isRoundWinnerLink } from '@Query/drawDefinition/linkTraversal';
import { isLinkObject } from '@Query/drawDefinition/malformedLinks';
import { findStructure } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import { LOSER } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

/**
 * WHERE A DECIDER IS PLAYED, read from the links and never from a structure's display name.
 *
 * A Decider is fed by one round of ANOTHER structure that sends both its winner AND its loser to it — a
 * DOUBLE_ELIMINATION's Main final does exactly that. Read-only: the scope check, `matchUpActions` and the Decider
 * reconciliation all ask the same question here, so a prediction and a refusal can never disagree about it.
 */
export function getDeciderFeeds(drawDefinition?: DrawDefinition) {
  // an entry that is not a link is never read: refused by the outcome gate, reported as INVALID_LINK
  const links = (drawDefinition?.links ?? []).filter(isLinkObject);
  return links
    .filter((link) => isRoundWinnerLink(link, drawDefinition))
    .map((winnerLink) => ({
      structureId: winnerLink.source?.structureId,
      roundNumber: winnerLink.source?.roundNumber,
      targetStructureId: winnerLink.target?.structureId,
    }))
    .filter(
      ({ structureId, roundNumber, targetStructureId }) =>
        !!targetStructureId &&
        targetStructureId !== structureId &&
        links.some(
          (link) =>
            link.linkType === LOSER &&
            link.source?.structureId === structureId &&
            link.source?.roundNumber === roundNumber &&
            link.target?.structureId === targetStructureId,
        ),
    );
}

/** The structures Deciders are played in. */
export function getDeciderStructureIds(drawDefinition?: DrawDefinition): Set<string> {
  return new Set(getDeciderFeeds(drawDefinition).map(({ targetStructureId }) => targetStructureId as string));
}

/** Is this the structure a Decider is played in? */
export function isDeciderStructure({
  drawDefinition,
  structureId,
}: {
  drawDefinition?: DrawDefinition;
  structureId?: string;
}): boolean {
  return !!structureId && getDeciderStructureIds(drawDefinition).has(structureId);
}

/** The finals that feed a Decider, with each final's `winningSide`. */
export function getDeciderFinals(drawDefinition?: DrawDefinition): Map<string, number | undefined> {
  const finals = new Map<string, number | undefined>();

  for (const { structureId, roundNumber } of getDeciderFeeds(drawDefinition)) {
    const { structure } = findStructure({ drawDefinition, structureId });
    for (const matchUp of matchUpsOf(structure) ?? []) {
      if (matchUp.roundNumber === roundNumber) finals.set(matchUp.matchUpId, matchUp.winningSide);
    }
  }

  return finals;
}
