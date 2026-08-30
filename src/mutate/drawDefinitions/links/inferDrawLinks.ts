import { getStructureGroups } from '@Query/structure/getStructureGroups';

// constants and types
import {
  CONSOLATION,
  CONTAINER,
  DRAW,
  LOSER,
  MAIN,
  PLAY_OFF,
  POSITION,
  QUALIFYING,
  TOP_DOWN,
} from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, DrawLink } from '@Types/tournamentTypes';

/**
 * Give an unlinked `drawDefinition` the links it needs to be READABLE.
 *
 * WHY THIS EXISTS. A drawDefinition whose structures are not all joined into one group is refused
 * outright by `getDrawData` — not degraded, refused (`ERR_MISSING_STRUCTURE_LINKS`, via
 * `getStructureGroups`). The record still saves and still lists in a calendar, so the failure is
 * invisible until something asks for the draw. Three real instances inside one week: an adapter
 * emitting qualifying and main as separate structures; records degraded by a round trip through a
 * render projection that carries no links; and a main-plus-back-draw ingest where the source simply
 * never states them.
 *
 * The factory cannot control how third parties present their data, and every one of those callers
 * would otherwise re-derive this logic themselves — differently, and in a place with no access to
 * the generators that already know the answer.
 *
 * ═══ THIS REPAIRS, IT DOES NOT RECONSTRUCT ═══
 *
 * Measured across the factory's own generators, link COUNT and `feedProfile` follow the `drawType`,
 * not the structure shape:
 *
 *   FIRST_MATCH_LOSER_CONSOLATION   MAIN CONSOLATION            2 links, LOSER r1+r2 TOP_DOWN
 *   FEED_IN_CHAMPIONSHIP            MAIN CONSOLATION            4 links, alternating TOP_DOWN/BOTTOM_UP
 *   ROUND_ROBIN_WITH_PLAYOFF        MAIN PLAY_OFF               1 link,  POSITION feedProfile DRAW
 *   COMPASS                         8 structures                7 links
 *
 * Two draws with identical structures therefore have different correct links. Nothing can recover
 * that from the structures alone, so this does not pretend to: it emits the MINIMUM set of links
 * that joins every structure into one group, and reports what it inferred and how confident that is.
 * A caller who knows the `drawType` and wants the true feed pattern should generate the draw
 * properly rather than repair it here.
 *
 * `confidence` is the honest signal, not decoration:
 *   'exact'    — a two-structure draw whose stages name an unambiguous relationship.
 *   'shape'    — more than two structures, or stages that do not name one. The draw becomes
 *                readable; the feed pattern is a guess and is flagged as one.
 *
 * NOTHING IS SILENT. A caller that wants to refuse rather than repair can read `inferred` and
 * decide; a caller that repairs can log exactly what was added. An unreadable draw and a draw
 * silently given invented structure are both worse than a reported repair.
 */

export interface InferredLink {
  linkType: string;
  sourceStructureId: string;
  targetStructureId: string;
  /** why this pairing was chosen, in the stages' own vocabulary */
  basis: string;
  confidence: 'exact' | 'shape';
}

export interface InferDrawLinksResult {
  /** the links to ADD — existing links are never modified or removed */
  links: DrawLink[];
  inferred: InferredLink[];
  /** true when the drawDefinition already formed a single group and nothing was needed */
  alreadyLinked: boolean;
  issues: string[];
}

type Structure = { structureId: string; stage?: string; stageSequence?: number; structureType?: string };

/**
 * Which of two structures feeds the other, from their stages alone.
 *
 * QUALIFYING precedes MAIN; MAIN precedes everything downstream of it. Where stages do not settle
 * it, `stageSequence` does — it is the factory's own ordering and is present on generated draws.
 */
const STAGE_ORDER: Record<string, number> = { [QUALIFYING]: 0, [MAIN]: 1, [CONSOLATION]: 2, [PLAY_OFF]: 3 };

function orderOf(structure: Structure): number {
  const stageRank = structure.stage ? STAGE_ORDER[structure.stage] : undefined;
  if (stageRank !== undefined) return stageRank;
  // Unknown stage: fall back to sequence so the ordering is still deterministic rather than arbitrary.
  return 50 + (structure.stageSequence ?? 0);
}

/**
 * The link a source→target pairing implies.
 *
 * Read from what the generators actually emit rather than assumed:
 *   - a CONTAINER source (round robin) feeds by POSITION with `feedProfile: DRAW` — placement is not
 *     automatic, which is what ROUND_ROBIN_WITH_PLAYOFF produces;
 *   - QUALIFYING feeds MAIN the same way, matching `generateQualifyingLink`;
 *   - an elimination (ITEM) source feeds its consolation/playoff by LOSER, TOP_DOWN.
 */
function linkFor(source: Structure, target: Structure): { link: DrawLink; basis: string } {
  const qualifyingFeed = source.stage === QUALIFYING;
  const containerFeed = source.structureType === CONTAINER;

  if (qualifyingFeed || containerFeed) {
    return {
      basis: qualifyingFeed ? 'QUALIFYING feeds MAIN by position' : 'a CONTAINER (round robin) feeds by position',
      link: {
        linkType: POSITION,
        source: { structureId: source.structureId, roundNumber: 0 },
        target: { structureId: target.structureId, roundNumber: 1, feedProfile: DRAW },
      } as DrawLink,
    };
  }

  return {
    basis: `${source.stage ?? 'source'} losers feed ${target.stage ?? 'target'}`,
    link: {
      linkType: LOSER,
      source: { structureId: source.structureId, roundNumber: 1 },
      target: { structureId: target.structureId, roundNumber: 1, feedProfile: TOP_DOWN },
    } as DrawLink,
  };
}

export function inferDrawLinks({ drawDefinition }: { drawDefinition: DrawDefinition }): InferDrawLinksResult {
  const issues: string[] = [];
  const empty = { links: [], inferred: [], alreadyLinked: true, issues };

  const structures = (drawDefinition?.structures ?? []) as Structure[];
  if (structures.length < 2) return empty;

  const { allStructuresLinked, structureGroups } = getStructureGroups({ drawDefinition });
  if (allStructuresLinked) return empty;

  // Work at GROUP grain, not structure grain: structures already joined to each other must stay one
  // unit, or a draw with a partly-linked tree gains links that duplicate what it has.
  const byId = new Map(structures.map((s) => [s.structureId, s]));
  const groups = (structureGroups ?? []).filter((g) => g?.length);
  const grouped = new Set(groups.flat());
  const orphans = structures.filter((s) => !grouped.has(s.structureId)).map((s) => [s.structureId]);
  const allGroups = [...groups, ...orphans];

  if (allGroups.length < 2) return empty;

  // Order each group by its earliest structure, then chain them. Chaining rather than fanning out
  // keeps the count minimal: N groups need N-1 links to become one.
  const ranked = allGroups
    .map((group) => {
      const members = group.map((id) => byId.get(id)).filter(Boolean) as Structure[];
      const lead = members.toSorted((a, b) => orderOf(a) - orderOf(b))[0];
      return { lead, rank: lead ? orderOf(lead) : Number.MAX_SAFE_INTEGER };
    })
    .filter((g) => g.lead)
    .toSorted((a, b) => a.rank - b.rank);

  const confidence: 'exact' | 'shape' =
    structures.length === 2 &&
    ranked.length === 2 &&
    ranked.every((g) => g.lead.stage && STAGE_ORDER[g.lead.stage] !== undefined)
      ? 'exact'
      : 'shape';

  if (confidence === 'shape') {
    issues.push(
      `link pattern inferred from structure shape only (${structures.length} structures, ${ranked.length} groups) — ` +
        'the draw becomes readable, but count and feedProfile follow drawType and cannot be recovered here',
    );
  }

  const links: DrawLink[] = [];
  const inferred: InferredLink[] = [];
  for (let index = 1; index < ranked.length; index += 1) {
    const source = ranked[index - 1].lead;
    const target = ranked[index].lead;
    const { link, basis } = linkFor(source, target);
    links.push(link);
    inferred.push({
      linkType: link.linkType,
      sourceStructureId: source.structureId,
      targetStructureId: target.structureId,
      basis,
      confidence,
    });
  }

  return { links, inferred, alreadyLinked: false, issues };
}
