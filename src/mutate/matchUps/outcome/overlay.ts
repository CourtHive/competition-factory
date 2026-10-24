import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { applyOutcomeOps } from './ops';

// constants and types
import type { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import type { MappedMatchUps, MatchUpsMap } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from './ops';

/**
 * The outcome pipeline, v2: THE WORKING VIEW (executor plan § 3.2; S2, CA 2026-10-24).
 *
 * The view is built from the call's one hydration. As a plan's ops are folded, the working view is the draw as it will
 * stand once they are written: what the settle passes' has-work predicates (S2) read, where v1 reads the draw it has
 * written. Nothing here writes the record.
 *
 * COPY ON WRITE. A matchUp an op writes, and a structure whose assignments or stamp an op writes, get stored-shape
 * working copies; the draw itself is a shallow copy. Untouched objects are the live stored ones, read only. Each op is
 * folded into the copies by `applyOutcomeOps`, the one reducer the shadow apply uses (F3): the overlay is that fold,
 * not a second model of the write.
 *
 * RE-DERIVATION, LOCAL. The matchUps an op wrote, and those whose sides read a reassigned drawPosition, are hydrated
 * again from the working copies through the factory's own derivation, `getAllDrawMatchUps` projected to their ids
 * (CA, 2026-10-24: re-derive by projection; G3 keeps one whole-draw hydration and counts these under its work bound).
 * Each replaces its entry in v2's copy of the hydrated array, through an id → index map built once. The matchUps map
 * handed to it is assembled from the call's, with the copies in place, rather than built again.
 *
 * In `differential` the view oracle (`decide.ts`) compares the working view with a hydration of the shadow-applied
 * record after every complete plan, so an invalidation this misses is a divergence before v2 writes.
 */
export type WorkingView = {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  /** fold `ops` into the working copies, then re-derive what they touched */
  apply: (ops: OutcomeOp[]) => { error?: string };
  /** what the view did, for a test to hold to the work bound (§ 3.6) */
  work: { copiedMatchUps: number; copiedStructures: number; rederived: number; projections: number };
};

type CreateWorkingViewArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
};

export function createWorkingView({
  inContextDrawMatchUps: base,
  tournamentRecord,
  drawDefinition,
  matchUpsMap: baseMap,
  event,
}: CreateWorkingViewArgs): WorkingView {
  const inContextDrawMatchUps = [...base];
  const indexOf = new Map(inContextDrawMatchUps.map((matchUp, index) => [matchUp.matchUpId, index]));
  const work = { copiedMatchUps: 0, copiedStructures: 0, rederived: 0, projections: 0 };

  // the top-level structure a matchUp's or an item structure's id belongs to, read once from the stored draw
  const topLevelOf = new Map<string, string>();
  for (const structure of drawDefinition.structures ?? []) {
    topLevelOf.set(structure.structureId, structure.structureId);
    for (const item of structuresOf(structure) ?? []) topLevelOf.set(item.structureId, structure.structureId);
  }
  const structureIdOf = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp.structureId]));

  const workingDraw: DrawDefinition = { ...drawDefinition, structures: [...(drawDefinition.structures ?? [])] };
  const copiedStructures = new Set<string>();
  const copiedMatchUps = new Map<string, MatchUp>();

  const copyStructure = (structure: Structure): Structure => {
    const items = structuresOf(structure);
    return {
      ...structure,
      ...(matchUpsOf(structure) ? { matchUps: [...(matchUpsOf(structure) ?? [])] } : {}),
      ...(positionAssignmentsOf(structure)
        ? { positionAssignments: positionAssignmentsOf(structure)?.map((assignment) => ({ ...assignment })) }
        : {}),
      ...(items ? { structures: items.map(copyStructure) } : {}),
    } as Structure;
  };

  const ensureStructure = (structureId?: string) => {
    const topLevelId = structureId && topLevelOf.get(structureId);
    if (!topLevelId || copiedStructures.has(topLevelId)) return;
    const index = workingDraw.structures?.findIndex((structure) => structure.structureId === topLevelId) ?? -1;
    if (index < 0 || !workingDraw.structures) return;
    workingDraw.structures[index] = copyStructure(workingDraw.structures[index]);
    copiedStructures.add(topLevelId);
    work.copiedStructures += 1;
  };

  const structureHolding = (structureId?: string): Structure | undefined => {
    const topLevel = workingDraw.structures?.find(
      (structure) => structure.structureId === topLevelOf.get(structureId ?? ''),
    );
    if (!topLevel || topLevel.structureId === structureId) return topLevel;
    return structuresOf(topLevel)?.find((item) => item.structureId === structureId);
  };

  const ensureMatchUp = (matchUpId: string) => {
    if (copiedMatchUps.has(matchUpId)) return;
    const structureId = structureIdOf.get(matchUpId);
    ensureStructure(structureId);
    const matchUps = matchUpsOf(structureHolding(structureId));
    const index = matchUps?.findIndex((matchUp) => matchUp.matchUpId === matchUpId) ?? -1;
    if (!matchUps || index < 0) return;
    matchUps[index] = structuredClone(matchUps[index]);
    copiedMatchUps.set(matchUpId, matchUps[index]);
    work.copiedMatchUps += 1;
  };

  const overlayMap = (): MatchUpsMap => {
    const mappedMatchUps: MappedMatchUps = { ...baseMap.mappedMatchUps };
    for (const topLevelId of copiedStructures) {
      const topLevel = workingDraw.structures?.find((structure) => structure.structureId === topLevelId);
      for (const structure of [topLevel, ...(structuresOf(topLevel) ?? [])]) {
        if (structure && mappedMatchUps[structure.structureId])
          mappedMatchUps[structure.structureId] = {
            ...mappedMatchUps[structure.structureId],
            matchUps: matchUpsOf(structure) ?? mappedMatchUps[structure.structureId].matchUps,
          };
      }
    }
    const drawMatchUps = baseMap.drawMatchUps.map((matchUp) => copiedMatchUps.get(matchUp.matchUpId) ?? matchUp);
    return { mappedMatchUps, drawMatchUps };
  };

  const view: WorkingView = {
    inContextDrawMatchUps,
    drawDefinition: workingDraw,
    matchUpsMap: baseMap,
    work,
    apply(ops) {
      const affected = new Set<string>();
      for (const op of ops) {
        if (op.op === 'setMatchUpResult' || op.op === 'setMatchUpDrawPositions') {
          ensureMatchUp(op.matchUpId);
          affected.add(op.matchUpId);
        } else if (op.op === 'stampUpdatedAt' && op.entity === 'matchUp') {
          ensureMatchUp(op.id);
          affected.add(op.id);
        } else if (op.op === 'assignPosition' || (op.op === 'stampUpdatedAt' && op.entity === 'structure')) {
          ensureStructure(op.op === 'assignPosition' ? op.structureId : op.id);
        }
      }

      const applied = applyOutcomeOps(workingDraw, ops);
      if (applied.error) return applied;

      // a reassigned drawPosition changes the sides of every matchUp in that structure that holds it
      for (const op of ops) {
        if (op.op !== 'assignPosition') continue;
        for (const matchUp of matchUpsOf(structureHolding(op.structureId)) ?? [])
          if (matchUp.drawPositions?.includes(op.drawPosition)) affected.add(matchUp.matchUpId);
      }

      view.matchUpsMap = overlayMap();
      if (!affected.size) return {};
      work.projections += 1;
      const rederived =
        getAllDrawMatchUps({
          matchUpFilters: { matchUpIds: [...affected] },
          matchUpsMap: view.matchUpsMap,
          drawDefinition: workingDraw,
          tournamentRecord,
          inContext: true,
          event,
        }).matchUps ?? [];
      for (const matchUp of rederived) {
        const index = indexOf.get(matchUp.matchUpId);
        if (index === undefined) continue;
        inContextDrawMatchUps[index] = matchUp;
        work.rederived += 1;
      }
      return {};
    },
  };
  return view;
}
