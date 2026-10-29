import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
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
 * The view is built from the structural index of the draw (§ 3.1.1), or for a draw the index does not cover yet (TEAM)
 * from the call's one hydration. As a plan's ops are folded, the working view is the draw as it will
 * stand once they are written: what the settle passes' has-work predicates (S2) read, where v1 reads the draw it has
 * written. Nothing here writes the record.
 *
 * COPY ON WRITE. A matchUp an op writes, and a structure whose assignments or stamp an op writes, get stored-shape
 * working copies; the draw itself is a shallow copy. Untouched objects are the live stored ones, read only. Each op is
 * folded into the copies by `applyOutcomeOps`, the one reducer the shadow apply uses (F3): the overlay is that fold,
 * not a second model of the write.
 *
 * RE-DERIVATION, LOCAL. The matchUps an op wrote, and those whose sides read a reassigned drawPosition, are derived
 * again from the working copies: on an index base, by indexing again the top-level structures that hold them
 * (`buildStructuralIndex` scoped to those structures, whose round profiles are read whole), with no hydration; on a
 * hydrated base, by `getAllDrawMatchUps` projected to their ids (CA, 2026-10-24: re-derive by projection). Each
 * replaces its entry in v2's copy of the array, through an id → index map built once. The matchUps map handed to it is
 * assembled from the call's, with the copies in place, rather than built again.
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

/** the matchUp and the structure an op writes, a stamp's included */
function namedBy(op: OutcomeOp): { matchUpId?: string; structureId?: string } {
  if (op.op === 'stampUpdatedAt') {
    if (op.entity === 'matchUp') return { matchUpId: op.id };
    return op.entity === 'structure' ? { structureId: op.id } : {};
  }
  return {
    matchUpId: 'matchUpId' in op ? op.matchUpId : undefined,
    structureId: 'structureId' in op ? op.structureId : undefined,
  };
}

type CreateWorkingViewArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  /** the base is the structural index (§ 3.1.1): what an op touches is indexed again, not hydrated */
  structural?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
};

export function createWorkingView({
  inContextDrawMatchUps: base,
  structural,
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

  // the structures holding what an op touched, indexed again from the working copies: a round profile is read whole
  const reindex = (affected: Set<string>) =>
    buildStructuralIndex({
      structureIds: new Set([...affected].map((matchUpId) => topLevelOf.get(structureIdOf.get(matchUpId) ?? '') ?? '')),
      drawDefinition: workingDraw,
      tournamentRecord,
      event,
    }).matchUps;

  const view: WorkingView = {
    inContextDrawMatchUps,
    drawDefinition: workingDraw,
    matchUpsMap: baseMap,
    work,
    apply(ops) {
      // COPY BEFORE WRITE, for every op by what it names: an object not copied here is the STORED one, and the fold
      // below would write into the live draw before v1 runs. Asked of the op, not of a list of op kinds, so an op added
      // later cannot slip past it (a seat cleared with no stamp beside it did, before this read the op's own ids)
      const affected = new Set<string>();
      for (const op of ops) {
        const { matchUpId, structureId } = namedBy(op);
        if (matchUpId) {
          ensureMatchUp(matchUpId);
          affected.add(matchUpId);
        }
        if (structureId) ensureStructure(structureId);
      }

      const applied = applyOutcomeOps(workingDraw, ops);
      if (applied.error) return applied;

      // a reassigned or emptied drawPosition changes the sides of every matchUp in that structure that holds it
      for (const op of ops) {
        if (op.op !== 'assignPosition' && op.op !== 'clearPosition' && op.op !== 'relabelPosition') continue;
        for (const matchUp of matchUpsOf(structureHolding(op.structureId)) ?? [])
          if (matchUp.drawPositions?.includes(op.drawPosition)) affected.add(matchUp.matchUpId);
      }

      view.matchUpsMap = overlayMap();
      if (!affected.size) return {};
      work.projections += 1;
      const rederived = structural
        ? reindex(affected)
        : (getAllDrawMatchUps({
            matchUpFilters: { matchUpIds: [...affected] },
            matchUpsMap: view.matchUpsMap,
            drawDefinition: workingDraw,
            tournamentRecord,
            inContext: true,
            event,
          }).matchUps ?? []);
      for (const matchUp of rederived) {
        if (!affected.has(matchUp.matchUpId)) continue;
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
