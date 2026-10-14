import { generateDrawStructuresAndLinks } from '@Generators/drawDefinitions/generateDrawStructuresAndLinks';
import { positionAssignmentsOf } from '@Acquire/structureMembers';

// constants and types
import { CONTAINER, DRAW, LOSER, POSITION, ROUND_ROBIN, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';

/**
 * The links of a draw rebuilt from a public projection (`getEventData`'s `drawsData`).
 *
 * The projection carries every structure of a draw but not its links, and links cannot be recovered
 * from structure shape alone: their count and `feedProfile` follow the `drawType` (see `inferDrawLinks`).
 * The projection does carry the `drawType`, so the links come from the generator that knows it:
 *
 *  1. TEMPLATE — generate the same `drawType` at the same size, map its structures onto the source's
 *     (stage + stageSequence + size, else name + size), and copy every link whose two ends map.
 *  2. ADDED PLAYOFFS — a structure the template lacks (a `Playoff 3-4` added to an elimination draw, the
 *     playoffs of a round robin) is linked from its `sourceStructureIds`: losers of the round with as many
 *     matchUps as the playoff has positions, TOP_DOWN (what `addPlayoffStructures` generates); or, from a
 *     round robin, the finishing position its participants share (what ROUND_ROBIN_WITH_PLAYOFF generates).
 *  3. CHECKED — a link is checked against the source wherever the source can speak to it: a matchUp's
 *     `loserMatchUpId` must land in the link's target structure, and decided losers must appear there.
 *     A disagreement is reported in `issues`, never silently resolved.
 *
 * Anything still unlinked is left for `inferDrawLinks`, which reports what it adds.
 */

export type DerivedLinkBasis = 'drawType' | 'playoff' | 'roundRobinPlayoff' | 'roundRobinPlayoffByName';

export interface DerivedLink {
  linkType: string;
  sourceStructureId: string;
  targetStructureId: string;
  basis: DerivedLinkBasis;
}

export interface DeriveSourceLinksResult {
  links: DrawLink[];
  derived: DerivedLink[];
  issues: string[];
}

// The projection's shapes, as far as this module reads them. Loose on purpose (a source is not under this
// codebase's control), but named: every field is optional and read defensively.
export type SourceSide = { participantId?: string; sideNumber?: number };
export type SourceMatchUp = {
  matchUpId?: string;
  roundNumber?: number;
  winningSide?: number;
  loserMatchUpId?: string;
  drawPositions?: number[];
  sides?: SourceSide[];
};
export type SourceStructure = {
  structureId: string;
  structureName?: string;
  structureType?: string;
  stage?: string;
  stageSequence?: number;
  matchUpFormat?: string;
  sourceStructureIds?: string[];
  participantResults?: unknown;
  positionAssignments?: { drawPosition?: number; participantId?: string }[];
  roundMatchUps?: Record<string, SourceMatchUp[]>;
};
export type SourceDraw = {
  drawId?: string;
  drawName?: string;
  drawType?: string;
  matchUpFormat?: string;
  structures?: SourceStructure[];
};
type ParticipantResult = { groupOrder?: number };

// enough fixed ids for any template, so generating one never draws on the random source
const TEMPLATE_ID_POOL = 8192;

const normalizedName = (name?: string) => (name ?? '').toLowerCase().replaceAll(/[^a-z0-9]/g, '');

function roundMatchUpsOf(structure: SourceStructure): SourceMatchUp[] {
  const rounds = structure?.roundMatchUps;
  if (rounds === null || typeof rounds !== 'object') return [];
  return Object.values(rounds).flatMap((round) => (Array.isArray(round) ? round : []));
}

function isContainer(structure: SourceStructure) {
  return structure?.structureType === CONTAINER;
}

/** positions in a structure: its positionAssignments, else the highest drawPosition its matchUps name */
function sizeOf(structure: SourceStructure): number {
  const assigned = structure?.positionAssignments?.length ?? 0;
  if (assigned) return assigned;
  const drawPositions = roundMatchUpsOf(structure).flatMap((m) => m.drawPositions ?? []);
  return drawPositions.length ? Math.max(...drawPositions.filter(Boolean)) : 0;
}

function generateTemplate(drawType: string, drawSize: number) {
  const uuids = Array.from({ length: TEMPLATE_ID_POOL }, (_, index) => `template-${index}`);
  const drawDefinition: DrawDefinition = { drawId: 'template', structures: [], links: [], entries: [] };
  const result = generateDrawStructuresAndLinks({
    drawDefinition,
    enforceMinimumDrawSize: false,
    drawTypeCoercion: false,
    idPrefix: 'template',
    drawType,
    drawSize,
    uuids,
  });
  return result?.error ? undefined : result;
}

/** map each template structure onto at most one source structure */
function mapTemplate(templateStructures: Structure[], sourceStructures: SourceStructure[]) {
  const mapped = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (templateStructure: Structure, predicate: (s: SourceStructure) => boolean) => {
    const match = sourceStructures.find((s) => !taken.has(s.structureId) && predicate(s));
    if (!match) return false;
    mapped.set(templateStructure.structureId, match.structureId);
    taken.add(match.structureId);
    return true;
  };
  for (const t of templateStructures) {
    const size = positionAssignmentsOf(t)?.length ?? 0;
    const sameSize = (s: SourceStructure) => !size || sizeOf(s) === size;
    if (claim(t, (s) => s.stage === t.stage && s.stageSequence === t.stageSequence && sameSize(s))) continue;
    claim(t, (s) => normalizedName(s.structureName) === normalizedName(t.structureName) && sameSize(s));
  }
  return mapped;
}

function templateLinks(drawType: string | undefined, sourceStructures: SourceStructure[], derived: DerivedLink[]) {
  const main = sourceStructures[0];
  if (!drawType || isContainer(main) || drawType.includes(ROUND_ROBIN)) return [];
  const template = generateTemplate(drawType, sizeOf(main));
  if (!template?.structures?.length) return [];

  const mapped = mapTemplate(template.structures, sourceStructures);
  const links: DrawLink[] = [];
  for (const link of template.links ?? []) {
    const sourceStructureId = mapped.get(link.source.structureId);
    const targetStructureId = mapped.get(link.target.structureId);
    if (!sourceStructureId || !targetStructureId) continue;
    links.push({
      ...link,
      source: { ...link.source, structureId: sourceStructureId },
      target: { ...link.target, structureId: targetStructureId },
    });
    derived.push({ linkType: link.linkType, sourceStructureId, targetStructureId, basis: 'drawType' });
  }
  return links;
}

/** who is in a structure: its positionAssignments where the source carries them, and its matchUps' sides */
function participantIdsOf(structure: SourceStructure): Set<string> {
  const ids = new Set<string>();
  for (const assignment of structure.positionAssignments ?? [])
    if (assignment?.participantId) ids.add(assignment.participantId);
  for (const m of roundMatchUpsOf(structure))
    for (const side of m.sides ?? []) if (side?.participantId) ids.add(side.participantId);
  return ids;
}

/** a round robin's finishing order by participant: `participantResults` is an array, or (older) a map */
function groupOrders(source: SourceStructure): Map<string, number> {
  const results = source.participantResults;
  const entries: [string, ParticipantResult | undefined][] = Array.isArray(results)
    ? results.map((entry) => [entry?.participantId, entry?.participantResult ?? entry])
    : Object.entries((results ?? {}) as Record<string, ParticipantResult>);
  const orders = new Map<string, number>();
  for (const [participantId, result] of entries)
    if (participantId && result?.groupOrder) orders.set(participantId, result.groupOrder);
  return orders;
}

/** the losers of a round's decided matchUps */
function roundLosers(structure: SourceStructure, roundNumber: number): string[] {
  return roundMatchUpsOf(structure)
    .filter((m) => m.roundNumber === roundNumber && m.winningSide)
    .map((m) => m.sides?.find((side: SourceSide) => side.sideNumber !== m.winningSide)?.participantId)
    .filter((participantId): participantId is string => !!participantId);
}

function playoffLink(source: SourceStructure, target: SourceStructure, issues: string[]): DrawLink | undefined {
  const size = sizeOf(target);
  const counts = new Map<number, number>();
  for (const { roundNumber } of roundMatchUpsOf(source)) {
    if (roundNumber) counts.set(roundNumber, (counts.get(roundNumber) ?? 0) + 1);
  }
  const rounds = [...counts.entries()].filter(([, count]) => count === size).map(([roundNumber]) => roundNumber);
  if (rounds.length !== 1) {
    issues.push(`${target.structureName}: no single round of ${source.structureName} has ${size} matchUps`);
    return undefined;
  }
  // every decided loser of that round is placed in an added playoff; one who is not says the round is wrong
  const present = participantIdsOf(target);
  const missing = roundLosers(source, rounds[0]).filter((participantId) => !present.has(participantId));
  if (missing.length) {
    issues.push(
      `${target.structureName}: ${missing.length} losers of ${source.structureName} round ${rounds[0]} are not in it`,
    );
  }
  return {
    linkType: LOSER,
    source: { structureId: source.structureId, roundNumber: rounds[0] },
    target: { structureId: target.structureId, roundNumber: 1, feedProfile: TOP_DOWN },
  } as DrawLink;
}

/**
 * The finishing positions a round robin playoff takes: those its participants held in their groups. A playoff
 * nobody has reached yet says nothing, and then a trailing number in its name ("Playoff 2") is read instead —
 * reported as its own basis, since a name is weaker evidence than the participants.
 */
function roundRobinPlayoffLink(source: SourceStructure, target: SourceStructure, issues: string[]) {
  const participantIds = [...participantIdsOf(target)];
  const groupOrder = groupOrders(source);
  const orders = participantIds.map((participantId) => groupOrder.get(participantId));
  const named = participantIds.length ? undefined : /(\d+)\s*$/.exec(target.structureName ?? '')?.[1];
  const finishingPositions = named
    ? [Number(named)]
    : [...new Set(orders)].filter((order): order is number => !!order).toSorted((a, b) => a - b);
  if (!finishingPositions.length || orders.includes(undefined)) {
    issues.push(
      `${target.structureName}: no finishing position in ${source.structureName} accounts for its participants`,
    );
    return undefined;
  }
  return { byName: !!named, link: positionLink(source, target, finishingPositions) };
}

function positionLink(source: SourceStructure, target: SourceStructure, finishingPositions: number[]): DrawLink {
  return {
    linkType: POSITION,
    source: { structureId: source.structureId, finishingPositions },
    target: { structureId: target.structureId, roundNumber: 1, feedProfile: DRAW },
  } as DrawLink;
}

function addedPlayoffLinks(
  sourceStructures: SourceStructure[],
  links: DrawLink[],
  derived: DerivedLink[],
  issues: string[],
) {
  const byId = new Map(sourceStructures.map((s) => [s.structureId, s]));
  const targeted = new Set(links.map((link) => link.target.structureId));
  const added: DrawLink[] = [];
  for (const target of sourceStructures.slice(1)) {
    if (targeted.has(target.structureId)) continue;
    const sourceStructureId = target.sourceStructureIds?.[0];
    const source = sourceStructureId ? byId.get(sourceStructureId) : undefined;
    if (!source) continue;
    const roundRobin = isContainer(source);
    const positioned = roundRobin ? roundRobinPlayoffLink(source, target, issues) : undefined;
    const link = roundRobin ? positioned?.link : playoffLink(source, target, issues);
    if (!link) continue;
    added.push(link);
    let basis: DerivedLinkBasis = 'playoff';
    if (roundRobin) basis = positioned?.byName ? 'roundRobinPlayoffByName' : 'roundRobinPlayoff';
    derived.push({
      linkType: link.linkType,
      sourceStructureId: source.structureId,
      targetStructureId: target.structureId,
      basis,
    });
  }
  return added;
}

/** report every place the source's own record of where losers went disagrees with a LOSER link */
function checkLoserLinks(sourceStructures: SourceStructure[], links: DrawLink[], issues: string[]) {
  const structureOf = new Map<string, string>();
  for (const s of sourceStructures) {
    for (const { matchUpId } of roundMatchUpsOf(s)) if (matchUpId) structureOf.set(matchUpId, s.structureId);
  }
  const byId = new Map(sourceStructures.map((s) => [s.structureId, s]));

  // a source pointer from a round into another structure that no link covers is a link the draw is missing
  const covered = new Set(
    links
      .filter(({ linkType }) => linkType === LOSER)
      .map((link) => `${link.source.structureId}|${link.source.roundNumber}|${link.target.structureId}`),
  );
  const uncovered = new Set<string>();
  for (const s of sourceStructures) {
    for (const m of roundMatchUpsOf(s)) {
      const landed = m.loserMatchUpId && structureOf.get(m.loserMatchUpId);
      if (!landed || landed === s.structureId) continue;
      const key = `${s.structureId}|${m.roundNumber}|${landed}`;
      if (!covered.has(key) && !uncovered.has(key)) {
        uncovered.add(key);
        issues.push(
          `${s.structureName} round ${m.roundNumber} losers go to ${byId.get(landed)?.structureName}, and no link says so`,
        );
      }
    }
  }

  for (const link of links.filter(({ linkType }) => linkType === LOSER)) {
    const source = byId.get(link.source.structureId);
    const target = byId.get(link.target.structureId);
    if (!source || !target) continue;
    const roundNumber = link.source.roundNumber;
    for (const m of roundMatchUpsOf(source).filter((matchUp) => matchUp.roundNumber === roundNumber)) {
      const landed = m.loserMatchUpId && structureOf.get(m.loserMatchUpId);
      if (landed && landed !== target.structureId) {
        issues.push(
          `${source.structureName} round ${roundNumber} losers go to another structure than ${target.structureName}`,
        );
        break;
      }
    }
  }
}

export function deriveSourceLinks({ draw }: { draw: SourceDraw }): DeriveSourceLinksResult {
  const sourceStructures = (draw?.structures ?? []).filter((s: SourceStructure) => s?.structureId);
  const derived: DerivedLink[] = [];
  const issues: string[] = [];
  if (sourceStructures.length < 2) return { links: [], derived, issues };

  const links = templateLinks(draw.drawType, sourceStructures, derived);
  links.push(...addedPlayoffLinks(sourceStructures, links, derived, issues));
  checkLoserLinks(sourceStructures, links, issues);
  return { links, derived, issues };
}
