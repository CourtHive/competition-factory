import {
  exitProducedByPropagation,
  getStructureInconsistencies,
} from '@Query/drawDefinition/getStructureInconsistencies';
import { finalize, Inconsistency } from '@Query/integrity/inconsistency';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';

// constants and types
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// getDrawInconsistencies is the DRAW layer of the integrity hierarchy. It fans out to
// getStructureInconsistencies (which already visits every structure of the draw) and adds the
// checks that are only visible with the whole draw in view: the integrity of the cross-structure
// LINKS. Structure-scoped issues keep their STRUCTURE scope as they pass through; the link checks
// are DRAW scoped. Every returned inconsistency is stamped with drawId + a fingerprint by
// `finalize`.
//
//  - DANGLING_LINK: a link whose source or target structureId is not a structure in this draw —
//    progression can never resolve, and inContext derivation itself throws on such a draw, so it is
//    detected structurally BEFORE fan-out. (error)
//  - LINK_MISSING_SOURCE_ROUND: a WINNER/LOSER link with no source.roundNumber; the engine cannot
//    determine which round feeds the target (getTargetLink treats this as INVALID_VALUES). (error)
//  - SCAN_ERROR: structure-level derivation threw on this draw (corrupt state the leaf could not
//    read). Surfaced rather than allowed to crash the scan. (error)
//  - DROPPED_PROGRESSION: a LOSER-linked source matchUp whose loser is ELIGIBLE to feed the target
//    structure (per the engine's own feed predicate, isFedLoserEligible) but does not appear anywhere
//    in that target structure's positionAssignments. (error)
//
// The eligibility gate is what makes DROPPED_PROGRESSION sound: whether a given loser actually feeds
// depends on feed-eligibility the LINK alone does not encode — a FIRST_MATCH_LOSER_CONSOLATION round-2
// LOSER link exists but feeds only players whose first match was round 2 (zero prior scored wins). We
// reuse isFedLoserEligible, which shares getDrawPositionWinCount with directLoser (the mutation path),
// so the check and the engine cannot diverge. WINNER-linked progression (double-elimination
// consolation-final feed-back, qualifying → main) is still deferred — its eligibility (loss count) is
// not a cleanly extractable predicate yet. See planning/DATA_INTEGRITY_HIERARCHY_AND_ALERTING.md.
export const DANGLING_LINK = 'DANGLING_LINK';
export const LINK_MISSING_SOURCE_ROUND = 'LINK_MISSING_SOURCE_ROUND';
export const SCAN_ERROR = 'SCAN_ERROR';
export const DROPPED_PROGRESSION = 'DROPPED_PROGRESSION';

const ROUND_LINK_TYPES = [WINNER, LOSER];

type GetDrawInconsistenciesArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  drawId?: string;
  event?: Event;
};

// Flatten the structure tree — round-robin CONTAINER nodes hold their groups in `structures[]`.
function collectStructures(structures: Structure[] | undefined, collected: Structure[]): void {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
}

function getLinkInconsistencies(drawDefinition: DrawDefinition, structureIds: Set<string>): any[] {
  const inconsistencies: any[] = [];
  for (const link of drawDefinition.links ?? []) {
    if (!link) continue;
    const sourceStructureId = link.source?.structureId;
    const targetStructureId = link.target?.structureId;
    const missing = [
      !sourceStructureId || !structureIds.has(sourceStructureId) ? 'source' : undefined,
      !targetStructureId || !structureIds.has(targetStructureId) ? 'target' : undefined,
    ].filter(Boolean);
    const base = { linkType: link.linkType, sourceStructureId, targetStructureId };

    if (missing.length) {
      inconsistencies.push({
        ...base,
        issueType: DANGLING_LINK,
        message: `link references ${missing.join(' and ')} structure(s) not present in the draw`,
        severity: 'error',
        // structureId identifies the issue for fingerprinting when one side is absent
        structureId: sourceStructureId ?? targetStructureId,
      });
    } else if (ROUND_LINK_TYPES.includes(link.linkType) && !link.source?.roundNumber) {
      inconsistencies.push({
        ...base,
        issueType: LINK_MISSING_SOURCE_ROUND,
        message: `${link.linkType} link is missing the required source.roundNumber`,
        severity: 'error',
        structureId: sourceStructureId,
      });
    }
  }
  return inconsistencies;
}

// The leaf derives inContext matchUps, which throws on certain corrupt state. An integrity scan
// must report rather than crash, so failures become a SCAN_ERROR inconsistency.
function scanStructures(params: GetDrawInconsistenciesArgs): any[] {
  try {
    return getStructureInconsistencies(params).inconsistencies ?? [];
  } catch (err: any) {
    return [
      { issueType: SCAN_ERROR, message: `structure scan failed: ${err?.message ?? String(err)}`, severity: 'error' },
    ];
  }
}

// inContext derivation can throw on corrupt state (the same reason scanStructures is wrapped). The
// progression check must never crash the scan; on failure it yields no matchUps (the underlying throw
// is already reported as SCAN_ERROR by scanStructures, so progression is simply skipped).
function safeInContextMatchUps(drawDefinition: DrawDefinition, matchUpsMap: MatchUpsMap | undefined): any[] {
  try {
    return getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  } catch {
    return [];
  }
}

// For a single LOSER link, flag every source-round loser that is ELIGIBLE to feed the target (per the
// shared feed predicate) yet is absent from the target structure's positionAssignments.
function droppedLosersForLink(link: any, sourceStructureMatchUps: any[], targetStructure: Structure): any[] {
  const targetParticipantIds = new Set(
    (targetStructure.positionAssignments ?? []).map((assignment) => assignment.participantId).filter(Boolean),
  );
  const roundMatchUps = sourceStructureMatchUps.filter(
    (matchUp) =>
      !matchUp.collectionId &&
      matchUp.winningSide &&
      (!link.source?.roundNumber || matchUp.roundNumber === link.source.roundNumber),
  );

  const inconsistencies: any[] = [];
  for (const matchUp of roundMatchUps) {
    if (exitProducedByPropagation(matchUp.matchUpStatusCodes)) continue;
    const loserSide = (matchUp.sides ?? []).find((side) => side.sideNumber === (matchUp.winningSide === 1 ? 2 : 1));
    const loserParticipantId = loserSide?.participantId;
    if (!loserParticipantId || loserSide?.bye || typeof loserSide?.drawPosition !== 'number') continue;

    const eligible = isFedLoserEligible({
      sourceMatchUps: sourceStructureMatchUps,
      loserDrawPosition: loserSide.drawPosition,
      loserTargetLink: link,
    });
    if (eligible && !targetParticipantIds.has(loserParticipantId)) {
      inconsistencies.push({
        issueType: DROPPED_PROGRESSION,
        message: 'a loser eligible to feed the linked target structure is absent from it',
        severity: 'error',
        structureId: link.source?.structureId,
        matchUpId: matchUp.matchUpId,
        targetStructureId: targetStructure.structureId,
        participantId: loserParticipantId,
      });
    }
  }
  return inconsistencies;
}

// DROPPED_PROGRESSION — reuse the engine's own loser-feed predicate to verify eligible losers landed
// in their linked target structure. Empty inContext matchUps (e.g. when a dangling link suppressed the
// scan) yield no source matchUps and therefore no findings.
function getLoserProgressionInconsistencies(
  drawDefinition: DrawDefinition,
  inContextDrawMatchUps: any[],
  structureById: Map<string, Structure>,
): any[] {
  const loserLinks = (drawDefinition.links ?? []).filter((link) => link?.linkType === LOSER);
  return loserLinks.flatMap((link) => {
    const sourceStructureId = link.source?.structureId;
    const targetStructure = structureById.get(link.target?.structureId);
    if (!sourceStructureId || !targetStructure) return []; // dangling links reported separately
    const sourceStructureMatchUps = inContextDrawMatchUps.filter(
      (matchUp) => matchUp.structureId === sourceStructureId,
    );
    return droppedLosersForLink(link, sourceStructureMatchUps, targetStructure);
  });
}

export function getDrawInconsistencies(
  params: GetDrawInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] } {
  const { drawDefinition, tournamentRecord, matchUpsMap, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const drawId = params.drawId ?? drawDefinition.drawId;

  const allStructures: Structure[] = [];
  collectStructures(drawDefinition.structures, allStructures);
  const structureIds = new Set(allStructures.map((structure) => structure.structureId));
  const structureById = new Map(allStructures.map((structure) => [structure.structureId, structure]));

  const linkInconsistencies = getLinkInconsistencies(drawDefinition, structureIds);

  // A dangling link crashes inContext derivation (getExitProfile dereferences the missing target
  // structure), so structure-level fan-out and progression checks are skipped when one is present —
  // the dangling link is the reported root cause. Otherwise fan out to the leaf and check progression.
  const hasDanglingLink = linkInconsistencies.some((inc) => inc.issueType === DANGLING_LINK);
  const structureInconsistencies = hasDanglingLink
    ? []
    : scanStructures({ drawDefinition, tournamentRecord, matchUpsMap, event });

  const inContextDrawMatchUps = hasDanglingLink ? [] : safeInContextMatchUps(drawDefinition, matchUpsMap);
  const progressionInconsistencies = getLoserProgressionInconsistencies(
    drawDefinition,
    inContextDrawMatchUps,
    structureById,
  );

  const combined = [...structureInconsistencies, ...linkInconsistencies, ...progressionInconsistencies];
  const finalized = finalize(combined, { scope: 'DRAW', drawId });
  return { ...SUCCESS, valid: finalized.length === 0, inconsistencies: finalized };
}
