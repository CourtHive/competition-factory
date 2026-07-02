import { getStructureInconsistencies } from '@Query/drawDefinition/getStructureInconsistencies';
import { finalize, Inconsistency } from '@Query/integrity/inconsistency';

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
//
// DEFERRED — participant progression checks (a fed loser missing from its linked target structure)
// are intentionally NOT implemented here. Whether a given loser actually feeds a target depends on
// feed-eligibility the link alone does not encode: a FIRST_MATCH_LOSER_CONSOLATION round-2 LOSER
// link exists but feeds only players whose first match was round 2 (i.e. had a round-1 bye); in a
// full draw with no byes it feeds nobody, so `positionTargets` returning a loserTargetLink does NOT
// mean the round-2 loser should appear in the consolation. A sound progression check must reuse the
// engine's feed-assignment logic (linkCondition, bye history, feedProfile) rather than infer feeding
// from link presence — that is a later sub-phase. See planning/DATA_INTEGRITY_HIERARCHY_AND_ALERTING.md.
export const DANGLING_LINK = 'DANGLING_LINK';
export const LINK_MISSING_SOURCE_ROUND = 'LINK_MISSING_SOURCE_ROUND';
export const SCAN_ERROR = 'SCAN_ERROR';

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

export function getDrawInconsistencies(
  params: GetDrawInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] } {
  const { drawDefinition, tournamentRecord, matchUpsMap, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const drawId = params.drawId ?? drawDefinition.drawId;

  const allStructures: Structure[] = [];
  collectStructures(drawDefinition.structures, allStructures);
  const structureIds = new Set(allStructures.map((structure) => structure.structureId));

  const linkInconsistencies = getLinkInconsistencies(drawDefinition, structureIds);

  // A dangling link crashes inContext derivation (getExitProfile dereferences the missing target
  // structure), so structure-level fan-out is skipped when one is present — the dangling link is the
  // reported root cause. Otherwise fan out to the leaf.
  const hasDanglingLink = linkInconsistencies.some((inc) => inc.issueType === DANGLING_LINK);
  const structureInconsistencies = hasDanglingLink
    ? []
    : scanStructures({ drawDefinition, tournamentRecord, matchUpsMap, event });

  const combined = [...structureInconsistencies, ...linkInconsistencies];
  const finalized = finalize(combined, { scope: 'DRAW', drawId });
  return { ...SUCCESS, valid: finalized.length === 0, inconsistencies: finalized };
}
