import { isLegacyRoundRobinWinnerLink, isLinkObject, isMalformedRoundLink } from '@Query/drawDefinition/malformedLinks';
import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { decorateResult } from '@Functions/global/decorateResult';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { DrawDefinition, DrawLink, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { POSITION, WINNER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_POSITION_ASSIGNED,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
} from '@Constants/errorConditionConstants';

/**
 * REPAIR A DRAW'S MALFORMED LINKS, or remove what cannot be repaired, and say which.
 *
 * A malformed link (`isMalformedRoundLink`) refuses every outcome on the draw, and an entry that is not an object makes
 * the draw's readers throw. Until now the only remedies were to remove the structure the link feeds (losing its data)
 * or to edit the record by hand. This is the client's remedy, for each entry of `drawDefinition.links`:
 *
 *  - NOT_A_LINK: an entry that is not an object (`null`, a string, an array) is removed.
 *  - DANGLING_LINK: a link whose source or target structure is not in the draw is removed: it can never be followed.
 *  - a WINNER or LOSER link with no `source.roundNumber` has the round RESTORED when exactly one round of the source
 *    structure fits it, by the reasoning the factory uses to derive a source round from a structure
 *    (`deriveSourceLinks` § `playoffLink`): the round whose matchUp count equals the number of positions the target
 *    round takes from the link. A round already directed by another well-formed link of the same type from the same
 *    structure is not a candidate: a round's losers (or winners) go to one place. Where no round, or more than one,
 *    fits, the link is removed and the candidates are reported (NO_SOURCE_ROUND, AMBIGUOUS_SOURCE_ROUND).
 *  - LEGACY_ROUND_ROBIN_WINNER_LINK: a round robin's link labelled WINNER with `source.finishingPositions` and no
 *    round (`isLegacyRoundRobinWinnerLink`) is RELABELLED POSITION and reported in `relabeled`. It is not malformed: a
 *    round robin decides who leaves it by tally, so its link names finishing positions, never a round, and a round
 *    must NOT be restored to it (a container has no rounds of its own, so the inference above would find none and
 *    remove the link that joins qualifying to MAIN). Relabelling changes only the label, so it never needs `force`.
 *
 * The fed positions of target round T are those of round T that no earlier round holds: all of round 1, and in a later
 * round the positions that do not advance into it. Their count, `2·m(T) − m(T−1)` (with `m(0) = 0`), is what the link
 * must supply.
 *
 * REFUSED, BEFORE ANY WRITE, when a participant is already assigned to a position the link fed (the participant
 * ARRIVED through it), unless `force`: changing or removing a link that has already placed someone changes how that
 * placement is explained, and that is the operator's decision, not the repair's.
 *
 * Validate everything, then write (no mutation relies on rollback): the whole repair, the stale edges cleared and the
 * edges rebuilt by `addGoesTo`, is first composed on a copy; an error there refuses the call with the record as it was.
 * A removed link's edges (`winnerMatchUpId` / `loserMatchUpId` into its target structure) are cleared, as
 * `removeStructure` clears the edges into what it removes; `finishingPositionRange` is left as it is, as there.
 *
 * Removing the only link into a structure leaves that structure unlinked, which `getDrawData` refuses. Such structures
 * are reported in `unlinkedStructureIds`; `tools.repairDrawLinks` (`inferDrawLinks`) can then add a link, reporting how
 * much it guessed.
 */

export const NOT_A_LINK = 'NOT_A_LINK';
export const DANGLING_LINK_REMOVED = 'DANGLING_LINK';
export const NO_SOURCE_ROUND = 'NO_SOURCE_ROUND';
export const AMBIGUOUS_SOURCE_ROUND = 'AMBIGUOUS_SOURCE_ROUND';
export const LEGACY_ROUND_ROBIN_WINNER_LINK = 'LEGACY_ROUND_ROBIN_WINNER_LINK';

export type RepairedLink = {
  linkIndex: number;
  linkType: string;
  sourceStructureId: string;
  targetStructureId: string;
  targetRoundNumber?: number;
  sourceRoundNumber: number;
  /** 'inferred' from the structures, or 'specified' by the caller */
  basis: 'inferred' | 'specified';
};

export type RelabeledLink = {
  linkIndex: number;
  reason: typeof LEGACY_ROUND_ROBIN_WINNER_LINK;
  sourceStructureId: string;
  targetStructureId: string;
  finishingPositions: number[];
  from: typeof WINNER;
  to: typeof POSITION;
};

export type RemovedLink = {
  linkIndex: number;
  reason: string;
  linkType?: string;
  sourceStructureId?: string;
  targetStructureId?: string;
  /** the source rounds that fit, for AMBIGUOUS_SOURCE_ROUND */
  candidates?: number[];
};

type ArrivedThroughLink = { linkIndex: number; targetStructureId: string; participantIds: string[] };

type LinkSelection = {
  sourceStructureId?: string;
  targetStructureId?: string;
  linkType?: string;
};

type RepairLinksArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  force?: boolean;
  event?: Event;
};

type RepairMalformedLinkArgs = RepairLinksArgs &
  LinkSelection & {
    sourceRoundNumber?: number;
  };

export type RepairMalformedLinksResult = ResultType & {
  repaired?: RepairedLink[];
  relabeled?: RelabeledLink[];
  removed?: RemovedLink[];
  unlinkedStructureIds?: string[];
};

type LinkPlan = {
  repaired: RepairedLink[];
  relabeled: RelabeledLink[];
  removed: RemovedLink[];
  arrived: ArrivedThroughLink[];
};

/** Repair or remove every malformed link of the draw. */
export function repairMalformedLinks(params: RepairLinksArgs): RepairMalformedLinksResult {
  if (!params?.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  return repair({ ...params, stack: 'repairMalformedLinks' });
}

/**
 * Repair or remove ONE malformed link, chosen by its structures (and `linkType` where both structures are joined by
 * more than one). `sourceRoundNumber`, when given, is the round to restore: the operator's answer where the inference
 * found none or several. It must be a round of the source structure that no other link of the same type directs.
 */
export function repairMalformedLink(params: RepairMalformedLinkArgs): RepairMalformedLinksResult {
  const stack = 'repairMalformedLink';
  if (!params?.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const { sourceStructureId, targetStructureId, linkType, sourceRoundNumber } = params;
  if (!sourceStructureId && !targetStructureId)
    return decorateResult({ result: { error: MISSING_STRUCTURE_ID }, stack });
  if (sourceRoundNumber !== undefined && !(Number.isInteger(sourceRoundNumber) && sourceRoundNumber >= 1))
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'sourceRoundNumber must be >= 1', stack });
  return repair({ ...params, selection: { sourceStructureId, targetStructureId, linkType }, stack });
}

function repair({
  tournamentRecord,
  sourceRoundNumber,
  drawDefinition,
  selection,
  force,
  event,
  stack,
}: RepairLinksArgs & { selection?: LinkSelection; sourceRoundNumber?: number; stack: string }) {
  const plan = planLinkRepairs({ drawDefinition, selection, sourceRoundNumber });
  if (!('repaired' in plan)) return decorateResult({ result: plan, stack });

  if (!plan.repaired.length && !plan.removed.length && !plan.relabeled.length)
    return { ...SUCCESS, repaired: [], relabeled: [], removed: [] };

  if (plan.arrived.length && !force) {
    return decorateResult({
      result: { error: DRAW_POSITION_ASSIGNED },
      info: 'participants arrived through a link the repair would change; pass force to proceed',
      context: { arrived: plan.arrived, repaired: plan.repaired, removed: plan.removed },
      stack,
    });
  }

  // compose on a copy first: anything that fails there refuses the call before the record is touched
  const copy = makeDeepCopy(drawDefinition, false, true) as DrawDefinition;
  const composed = applyPlan(copy, plan);
  if (composed.error) return decorateResult({ result: composed, stack });

  const edgesOf = (matchUp: MatchUp) => JSON.stringify([matchUp.winnerMatchUpId, matchUp.loserMatchUpId]);
  const storedMatchUps = allStoredMatchUps(drawDefinition);
  const edgesBefore = new Map(storedMatchUps.map((matchUp) => [matchUp.matchUpId, edgesOf(matchUp)]));

  applyPlan(drawDefinition, plan);

  const tournamentId = tournamentRecord?.tournamentId;
  modifyDrawNotice({ drawDefinition, tournamentId, eventId: event?.eventId });
  for (const matchUp of storedMatchUps) {
    if (edgesBefore.get(matchUp.matchUpId) === edgesOf(matchUp)) continue;
    modifyMatchUpNotice({ context: stack, tournamentId, drawDefinition, matchUp, event });
  }

  return {
    ...SUCCESS,
    repaired: plan.repaired,
    relabeled: plan.relabeled,
    removed: plan.removed,
    unlinkedStructureIds: composed.unlinkedStructureIds,
  };
}

/**
 * Writes the plan to `drawDefinition`: restores the source rounds, drops the removed entries, clears the edges of the
 * changed links and, where no malformed link remains, rebuilds the edges with `addGoesTo`.
 */
function applyPlan(drawDefinition: DrawDefinition, plan: LinkPlan): ResultType & { unlinkedStructureIds?: string[] } {
  const links: unknown[] = drawDefinition.links ?? [];
  const removedIndices = new Set(plan.removed.map(({ linkIndex }) => linkIndex));
  for (const { linkIndex, sourceRoundNumber } of plan.repaired) {
    (links[linkIndex] as DrawLink).source.roundNumber = sourceRoundNumber;
  }
  // only the label changes: a round robin's link carries no round and directs no matchUp, so it has no edges to clear
  for (const { linkIndex } of plan.relabeled) {
    (links[linkIndex] as DrawLink).linkType = POSITION;
  }

  const affected = [...plan.repaired, ...plan.removed].filter(
    (change) => change.sourceStructureId && change.targetStructureId,
  );
  clearEdges(drawDefinition, affected as { sourceStructureId: string; targetStructureId: string }[]);

  drawDefinition.links = links.filter((_, index) => !removedIndices.has(index)) as DrawLink[];

  // a selection may leave other malformed or dangling links in place; the edges are then derived once they are repaired
  const byId = new Map(
    flattenStructures(drawDefinition.structures).map((structure) => [structure.structureId, structure]),
  );
  if (!drawDefinition.links.some((link) => isMalformedRoundLink(link, drawDefinition) || isDangling(link, byId))) {
    const goesTo = addGoesTo({ drawDefinition });
    if (goesTo.error) return goesTo;
  }

  return { ...SUCCESS, unlinkedStructureIds: unlinkedStructureIds(drawDefinition) };
}

/** a changed link's edges into its target structure are cleared; `addGoesTo` writes back those that still hold */
function clearEdges(
  drawDefinition: DrawDefinition,
  changes: { sourceStructureId: string; targetStructureId: string }[],
) {
  const structures = flattenStructures(drawDefinition.structures);
  const byId = new Map(structures.map((structure) => [structure.structureId, structure]));
  for (const { sourceStructureId, targetStructureId } of changes) {
    const source = byId.get(sourceStructureId);
    if (!source || sourceStructureId === targetStructureId) continue;
    const targetMatchUpIds = new Set(structureMatchUps(byId.get(targetStructureId)).map(({ matchUpId }) => matchUpId));
    for (const matchUp of structureMatchUps(source)) {
      if (matchUp.loserMatchUpId && targetMatchUpIds.has(matchUp.loserMatchUpId)) delete matchUp.loserMatchUpId;
      if (matchUp.winnerMatchUpId && targetMatchUpIds.has(matchUp.winnerMatchUpId)) delete matchUp.winnerMatchUpId;
    }
  }
}

/** the structures no link reaches, in a draw of more than one structure */
function unlinkedStructureIds(drawDefinition: DrawDefinition): string[] {
  const structureIds = (drawDefinition.structures ?? []).map(({ structureId }) => structureId);
  if (structureIds.length < 2) return [];
  const linked = new Set(
    (drawDefinition.links ?? []).flatMap((link) => [link.source?.structureId, link.target?.structureId]),
  );
  return structureIds.filter((structureId) => !linked.has(structureId));
}

type PlanArgs = {
  drawDefinition: DrawDefinition;
  sourceRoundNumber?: number;
  selection?: LinkSelection;
};

/**
 * What the repair WOULD do, without writing: each malformed entry's repair or removal, and the participants that
 * arrived through a link it changes. Exported for the tests and for a caller that wants to show the plan first.
 */
export function planLinkRepairs({ drawDefinition, selection, sourceRoundNumber }: PlanArgs): LinkPlan | ResultType {
  const structures = flattenStructures(drawDefinition.structures);
  const byId = new Map(structures.map((structure) => [structure.structureId, structure]));
  const links: unknown[] = Array.isArray(drawDefinition.links) ? drawDefinition.links : [];

  const draw = { structures };
  const indices = links
    .map((link, linkIndex) => ({ link, linkIndex }))
    .filter(
      ({ link }) =>
        !isLinkObject(link) ||
        isDangling(link, byId) ||
        isMalformedRoundLink(link, draw) ||
        isLegacyRoundRobinWinnerLink(link, draw),
    )
    .filter(({ link }) => !selection || (isLinkObject(link) && matchesSelection(link, selection)));

  if (selection && indices.length !== 1) {
    return {
      error: INVALID_VALUES,
      info: indices.length ? 'the selection matches more than one link to repair' : 'no link to repair matches',
      context: { selection, matched: indices.length },
    };
  }

  const plan: LinkPlan = { repaired: [], relabeled: [], removed: [], arrived: [] };
  for (const { link, linkIndex } of indices) {
    if (!isDangling(link, byId) && isLegacyRoundRobinWinnerLink(link, draw)) {
      plan.relabeled.push(relabel(link as DrawLink, linkIndex));
      continue;
    }
    const decision = decide({ link, linkIndex, links, byId, sourceRoundNumber });
    if (!('linkIndex' in decision)) return decision;
    if ('reason' in decision) plan.removed.push(decision);
    else plan.repaired.push(decision);
  }

  resolveConflicts(plan);

  for (const change of [...plan.repaired, ...plan.removed]) {
    const arrived = arrivedThroughLink(links[change.linkIndex], byId);
    if (arrived.length)
      plan.arrived.push({
        targetStructureId: change.targetStructureId as string,
        linkIndex: change.linkIndex,
        participantIds: arrived,
      });
  }

  return plan;
}

function relabel(link: DrawLink, linkIndex: number): RelabeledLink {
  return {
    reason: LEGACY_ROUND_ROBIN_WINNER_LINK,
    finishingPositions: [...(link.source.finishingPositions ?? [])],
    sourceStructureId: link.source.structureId,
    targetStructureId: link.target.structureId,
    from: WINNER,
    to: POSITION,
    linkIndex,
  };
}

function decide({
  sourceRoundNumber,
  linkIndex,
  links,
  link,
  byId,
}: {
  byId: Map<string, Structure>;
  sourceRoundNumber?: number;
  linkIndex: number;
  links: unknown[];
  link: unknown;
}): RepairedLink | RemovedLink | ResultType {
  if (!isLinkObject(link)) return { linkIndex, reason: NOT_A_LINK };
  const identity = {
    sourceStructureId: link.source?.structureId,
    targetStructureId: link.target?.structureId,
    linkType: link.linkType,
    linkIndex,
  };
  if (isDangling(link, byId)) return { ...identity, reason: DANGLING_LINK_REMOVED };

  const source = byId.get(identity.sourceStructureId) as Structure;
  const claimed = claimedRounds(links, link);
  const repaired = {
    ...identity,
    targetRoundNumber: link.target.roundNumber,
    sourceStructureId: identity.sourceStructureId,
    targetStructureId: identity.targetStructureId,
  };

  if (sourceRoundNumber !== undefined) {
    if (!roundCounts(source).has(sourceRoundNumber) || claimed.has(sourceRoundNumber)) {
      return {
        error: INVALID_VALUES,
        info: 'sourceRoundNumber is not a round of the source structure that no other link directs',
        context: { sourceRoundNumber, claimed: [...claimed] },
      };
    }
    return { ...repaired, sourceRoundNumber, basis: 'specified' };
  }

  const { candidates, shared } = candidateSourceRounds({ source, links, link, byId, claimed });
  if (candidates.length === 1 && !shared) return { ...repaired, sourceRoundNumber: candidates[0], basis: 'inferred' };
  return {
    ...identity,
    reason: candidates.length || shared ? AMBIGUOUS_SOURCE_ROUND : NO_SOURCE_ROUND,
    candidates,
  };
}

/** two malformed links restored to the same round of the same source cannot both be right: both are removed */
function resolveConflicts(plan: LinkPlan) {
  const keyOf = (change: RepairedLink) =>
    [change.sourceStructureId, change.linkType, change.sourceRoundNumber].join('|');
  const counts = new Map<string, number>();
  for (const change of plan.repaired) counts.set(keyOf(change), (counts.get(keyOf(change)) ?? 0) + 1);
  const conflicting = plan.repaired.filter((change) => (counts.get(keyOf(change)) ?? 0) > 1);
  if (!conflicting.length) return;
  plan.repaired = plan.repaired.filter((change) => !conflicting.includes(change));
  for (const change of conflicting) {
    const { linkIndex, linkType, sourceStructureId, targetStructureId, sourceRoundNumber } = change;
    plan.removed.push({
      reason: AMBIGUOUS_SOURCE_ROUND,
      candidates: [sourceRoundNumber],
      targetStructureId,
      sourceStructureId,
      linkIndex,
      linkType,
    });
  }
  plan.removed.sort((a, b) => a.linkIndex - b.linkIndex);
}

function matchesSelection(link: DrawLink, selection: LinkSelection) {
  return (
    (!selection.sourceStructureId || link.source?.structureId === selection.sourceStructureId) &&
    (!selection.targetStructureId || link.target?.structureId === selection.targetStructureId) &&
    (!selection.linkType || link.linkType === selection.linkType)
  );
}

function isDangling(link: unknown, byId: Map<string, Structure>) {
  if (!isLinkObject(link)) return false;
  return !byId.has(link.source?.structureId) || !byId.has(link.target?.structureId);
}

/** the rounds of the link's source already directed by another well-formed link of the same type */
function claimedRounds(links: unknown[], link: DrawLink): Set<number> {
  return new Set(
    links
      .filter(
        (other): other is DrawLink =>
          isLinkObject(other) &&
          other !== link &&
          !isMalformedRoundLink(other) &&
          other.linkType === link.linkType &&
          other.source?.structureId === link.source?.structureId,
      )
      .map((other) => other.source.roundNumber as number),
  );
}

/**
 * The rounds of the source that fit the link.
 *
 * WINNER: only the source's final round. The winners of every earlier round advance within the structure, so no other
 * round's winners can leave it (DOUBLE_ELIMINATION's Backdraw final into the Main final; Main's final into the Decider;
 * the PAGE_PLAYOFF structures; a qualifying structure into MAIN, which ends at its qualifying round).
 *
 * LOSER: each round whose matchUp count equals the positions the link supplies to the target round, which is the target
 * round's fed positions less those the round's other links supply (DOUBLE_ELIMINATION's Decider takes one position
 * from a WINNER link and one from a LOSER link). Where another malformed LOSER link shares the target round the split
 * cannot be known, and the link is ambiguous.
 */
function candidateSourceRounds({
  claimed,
  source,
  links,
  link,
  byId,
}: {
  byId: Map<string, Structure>;
  claimed: Set<number>;
  links: unknown[];
  source: Structure;
  link: DrawLink;
}): { candidates: number[]; shared?: boolean } {
  const counts = roundCounts(source);
  if (link.linkType === WINNER) {
    const finalRound = Math.max(0, ...counts.keys());
    return { candidates: finalRound && !claimed.has(finalRound) ? [finalRound] : [] };
  }

  const target = byId.get(link.target.structureId) as Structure;
  const targetRoundNumber = link.target.roundNumber;
  if (!targetRoundNumber) return { candidates: [] };
  const sharing = links.filter(
    (other): other is DrawLink =>
      isLinkObject(other) &&
      other !== link &&
      other.target?.structureId === link.target.structureId &&
      other.target?.roundNumber === targetRoundNumber,
  );
  const supplied = sharing.map((other) => suppliedPositions(other, byId));
  const unclaimed = [...counts.entries()].filter(([roundNumber]) => !claimed.has(roundNumber));
  // the round's share cannot be split: every unclaimed round is reported, and none is restored
  if (supplied.includes(undefined)) return { candidates: unclaimed.map(([roundNumber]) => roundNumber), shared: true };

  const suppliedTotal = (supplied as number[]).reduce((sum, count) => sum + count, 0);
  const fed = fedPositionCount(target, targetRoundNumber) - suppliedTotal;
  const candidates = unclaimed.filter(([, count]) => fed > 0 && count === fed).map(([roundNumber]) => roundNumber);
  return { candidates: candidates.sort((a, b) => a - b) };
}

/** how many positions another link supplies to its target round; undefined where that cannot be known */
function suppliedPositions(link: DrawLink, byId: Map<string, Structure>): number | undefined {
  const source = byId.get(link.source?.structureId);
  if (!source) return 0; // a dangling link supplies nothing, and is removed
  const counts = roundCounts(source);
  if (link.linkType === POSITION || isLegacyRoundRobinWinnerLink(link, { structures: [...byId.values()] })) {
    const groups = structuresOf(source)?.length || 1;
    return (link.source.finishingPositions?.length ?? 0) * groups;
  }
  const roundNumber =
    link.linkType === WINNER && isMalformedRoundLink(link) ? Math.max(0, ...counts.keys()) : link.source.roundNumber;
  return roundNumber ? (counts.get(roundNumber) ?? 0) : undefined;
}

/** how many positions of target round T a link supplies: `2·m(T) − m(T−1)` */
function fedPositionCount(target: Structure, targetRoundNumber: number): number {
  const counts = roundCounts(target);
  const inRound = counts.get(targetRoundNumber) ?? 0;
  const advancing = counts.get(targetRoundNumber - 1) ?? 0;
  return Math.max(0, 2 * inRound - advancing);
}

/** matchUps per round of an elimination structure; a container has none of its own */
function roundCounts(structure: Structure): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { roundNumber } of matchUpsOf(structure) ?? []) {
    if (roundNumber) counts.set(roundNumber, (counts.get(roundNumber) ?? 0) + 1);
  }
  return counts;
}

/** the positions of target round T that no earlier round holds: those the link supplies */
function fedDrawPositions(target: Structure, targetRoundNumber?: number): Set<number> {
  const matchUps = matchUpsOf(target) ?? [];
  if (!targetRoundNumber) {
    return new Set(matchUps.flatMap(({ drawPositions }) => drawPositions ?? []).filter(Boolean) as number[]);
  }
  const earlier = new Set(
    matchUps
      .filter(({ roundNumber }) => (roundNumber ?? 0) < targetRoundNumber)
      .flatMap(({ drawPositions }) => drawPositions ?? []),
  );
  return new Set(
    matchUps
      .filter(({ roundNumber }) => roundNumber === targetRoundNumber)
      .flatMap(({ drawPositions }) => drawPositions ?? [])
      .filter((drawPosition): drawPosition is number => !!drawPosition && !earlier.has(drawPosition)),
  );
}

/**
 * The participants who ARRIVED through the link: assigned to a position the link supplies in its target, and with a
 * decided matchUp in its source. A position the link supplies may also hold an entrant placed there directly (MAIN
 * round 1, which a qualifying link shares with the draw's own entries), and only a participant the source has a result
 * for can have come from it. A link whose source or target structure is absent identifies no one: the draw holds no
 * result it could have carried.
 */
function arrivedThroughLink(link: unknown, byId: Map<string, Structure>): string[] {
  if (!isLinkObject(link)) return [];
  const target = byId.get(link.target?.structureId);
  const source = byId.get(link.source?.structureId);
  if (!target || !source) return [];
  const fed = fedDrawPositions(target, link.target?.roundNumber);
  const played = decidedParticipantIds(source);
  return (positionAssignmentsOf(target) ?? [])
    .filter(({ drawPosition, participantId }) => participantId && fed.has(drawPosition) && played.has(participantId))
    .map(({ participantId }) => participantId as string);
}

/** every participant with a decided matchUp in the structure (or its groups) */
function decidedParticipantIds(structure: Structure): Set<string> {
  const ids = new Set<string>();
  for (const member of [structure, ...flattenStructures(structuresOf(structure))]) {
    const byPosition = new Map(
      (positionAssignmentsOf(member) ?? []).map(({ drawPosition, participantId }) => [drawPosition, participantId]),
    );
    for (const { drawPositions, winningSide } of structureMatchUps(member)) {
      if (!winningSide) continue;
      for (const drawPosition of drawPositions ?? []) {
        const participantId = drawPosition && byPosition.get(drawPosition);
        if (participantId) ids.add(participantId);
      }
    }
  }
  return ids;
}

function flattenStructures(structures: Structure[] | undefined): Structure[] {
  return (structures ?? []).flatMap((structure) => [structure, ...flattenStructures(structuresOf(structure))]);
}

function structureMatchUps(structure?: Structure): MatchUp[] {
  return matchUpsOf(structure) ?? [];
}

function allStoredMatchUps(drawDefinition: DrawDefinition): MatchUp[] {
  return flattenStructures(drawDefinition.structures).flatMap(structureMatchUps);
}
