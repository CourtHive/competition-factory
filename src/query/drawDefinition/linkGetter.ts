import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { overlap } from '@Tools/arrays';

// constants
import { DRAW_DEFINITION, STRUCTURE_ID } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { LOSER, WINNER } from '@Constants/drawDefinitionConstants';

type GetRoundLinksArgs = {
  roundNumber?: number;
  structureId: string;
  drawDefinition: any;
};

// Return links which govern movement for a given matchUp either as a source or a target
export function getRoundLinks({
  drawDefinition, // passed automatically by drawEngine
  roundNumber, // optional - filter for only links that apply to roundNumber
  structureId, // structureId within which matchUp occurs
}: GetRoundLinksArgs): any {
  const paramsCheck = requireParams({ drawDefinition, structureId }, [DRAW_DEFINITION, STRUCTURE_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { links } = getStructureLinks({ drawDefinition, structureId });

  const source = links.source.reduce((source, link) => {
    return !link.source.roundNumber || link.source.roundNumber === roundNumber ? source.concat(link) : source;
  }, []);
  const target = links.target.reduce((target, link) => {
    return !link.target.roundNumber || link.target.roundNumber === roundNumber ? target.concat(link) : target;
  }, []);
  return { links: { source, target } };
}

type GetTargetLinkArgs = {
  finishingPositions?: any;
  linkCondition?: string;
  linkType?: string;
  source: any[];
};

export function getTargetLink({ finishingPositions, linkCondition, linkType, source }: GetTargetLinkArgs) {
  const result = source.find((link) => {
    const positionCondition =
      !link.source?.finishingPositions ||
      !finishingPositions ||
      overlap(finishingPositions, link.source?.finishingPositions);
    const condition = linkCondition === link.linkCondition;
    return condition && positionCondition && link.linkType === linkType;
  });

  if ([WINNER, LOSER].includes(result?.linkType) && !result?.source?.roundNumber) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      stack: 'getTargetLink',
      context: result,
    });
  }
  return result;
}

type GetStructureLinksArgs = {
  roundNumber?: number;
  structureId: string;
  drawDefinition: any;
};

// Returns all links for which a structure is either a source or a target; optionally filter by roundNumber
export function getStructureLinks({
  drawDefinition, //passed automatically by drawEngine
  structureId, // id of structure for which links are desired
  roundNumber, // optional - filter for links to or from specific rounds
}: GetStructureLinksArgs): any {
  const paramsCheck = requireParams({ drawDefinition, structureId }, [DRAW_DEFINITION, STRUCTURE_ID]);
  if (paramsCheck.error) return paramsCheck;
  const links = drawDefinition.links ?? [];
  const structureLinks = links.filter(Boolean).reduce(
    (structureLinks, link) => {
      if (link.source?.structureId === structureId && (!roundNumber || link.source.roundNumber === roundNumber))
        structureLinks.source = structureLinks.source.concat(link);
      if (link.target?.structureId === structureId && (!roundNumber || link.target.roundNumber === roundNumber))
        structureLinks.target = structureLinks.target.concat(link);
      return structureLinks;
    },
    { source: [], target: [] },
  );
  return { links: structureLinks };
}

type GetWinnerLinkRoundNumbersArgs = {
  drawDefinition?: any;
  structureId?: string;
};

/**
 * The roundNumbers of `structureId` that a WINNER link targets.
 *
 * This is the exception that stops `getRoundMatchUps` from calling a round a FEED ROUND when it
 * holds no reserved fed drawPosition. A feed round is a round that receives participants through a
 * link **as well as** from the previous round, and its matchUps pair a FED position with an
 * ADVANCED one; the engine infers it from matchUpsCount equality with the prior round, because a
 * feed round does not halve.
 *
 * `DOUBLE_ELIMINATION`'s Main final does not halve either, and is fed by a **WINNER** link from the
 * Backdraw. It has no reserved fed slot: Main is generated as a feed-in of `drawSize + 1` with
 * `linkFedFinishingRoundNumbers: [1]`, and link-fed positions are subtracted from the local
 * allocation, so the extra matchUp exists and the extra slot does not. The Backdraw winner returns
 * at whichever Main drawPosition they already held. See `documentation/docs/concepts/draw-positions.md`
 * § 4a.
 *
 * MEASURED 2026-09-18 over 111 generated draws — 20 draw types x 9 draw sizes, no BYEs, so a
 * drawPosition held in a round > 1 IS a reserved feed slot — 521 rounds and 1,739 matchUps:
 *
 * | discriminator for "this round holds a reserved fed drawPosition" | misses |
 * |---|---|
 * | matchUpsCount equality alone | 5 — `DOUBLE_ELIMINATION` Main's final, at every draw size |
 * | a LOSER link targets the round | 4 — `FEED_IN` round 2 at every non-power-of-two size. Its reserved positions are held for entrants placed DIRECTLY into a later round — the ones who do not play round 1, seeds among them — so they come from the draw's own entries and the structure has NO links at all |
 * | **count equality AND no WINNER link** | **0** |
 *
 * The LOSER-link row is why this is not simply "derive feedRound from the links": a structure can
 * feed itself. Note also that feed rounds are HOMOGENEOUS — 1,739 of 1,739 matchUps agreed with
 * their round, so this is a round fact and not a per-matchUp one. (Positive control for that
 * counter: the same measurement over draws WITH byes reports 337, because a round-1 bye advances a
 * participant into round 2 at generation.)
 */
export function getWinnerLinkRoundNumbers({ drawDefinition, structureId }: GetWinnerLinkRoundNumbersArgs): number[] {
  if (!drawDefinition?.links?.length || !structureId) return [];
  return drawDefinition.links
    .filter(
      (link) =>
        link?.linkType === WINNER &&
        link?.target?.structureId === structureId &&
        link?.target?.roundNumber !== undefined,
    )
    .map((link) => link.target.roundNumber);
}
