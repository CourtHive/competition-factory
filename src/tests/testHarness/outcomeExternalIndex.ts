import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isDeepStrictEqual } from 'node:util';
// constants and types
import type { BuildViewArgs } from '@Mutate/matchUps/outcome/types';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
const wideOps = new Set(['replaceDrawState', 'replaceStructureState']);
const freshTotals = () => ({
  batches: 0,
  rebuilt: 0,
  disagreed: 0,
  errors: 0,
  initialMs: 0,
  incrementalMs: 0,
  fullMs: 0,
  shadowEntries: 0,
});
let totals = freshTotals();
const cache = new WeakMap<DrawDefinition, ReturnType<typeof createWorkingView>>();

export function resetIndexExperiment() {
  const previous = totals;
  totals = freshTotals();
  return previous;
}

function facts(matchUps: HydratedMatchUp[]) {
  return matchUps.map((matchUp) => ({
    id: matchUp.matchUpId,
    status: matchUp.matchUpStatus,
    winner: matchUp.winningSide,
    score: matchUp.score,
    positions: matchUp.drawPositions,
    sides: matchUp.sides?.map(({ participantId, drawPosition, bye }) => [participantId, drawPosition, bye]),
    edges: [matchUp.winnerMatchUpId, matchUp.loserMatchUpId],
    lines: matchUp.tieMatchUps?.map((line) => line.matchUpId),
  }));
}

function seedIndex(args: BuildViewArgs, drawDefinition: DrawDefinition) {
  const start = performance.now();
  const copy = structuredClone(drawDefinition);
  const index = buildStructuralIndex({ ...args, drawDefinition: copy, team: true });
  const overlay = createWorkingView({
    ...args,
    drawDefinition: copy,
    inContextDrawMatchUps: index.matchUps,
    matchUpsMap: getMatchUpsMap({ drawDefinition: copy }),
    clockFree: true,
    structural: true,
  });
  totals.initialMs += performance.now() - start;
  cache.set(drawDefinition, overlay);
  return overlay;
}

export function prepareIndexExperiment(args: BuildViewArgs, ops: OutcomeOp[]): () => void {
  const draw = args.drawDefinition;
  if (!draw || !process.env.OUTCOME_EXTERNAL_INDEX) return () => undefined;
  const overlay = cache.get(draw) ?? seedIndex(args, draw);
  const wide = ops.some((op) => wideOps.has(op.op));
  if (!wide) {
    const start = performance.now();
    const result = overlay.apply(ops);
    totals.incrementalMs += performance.now() - start;
    if (result.error) totals.errors++;
  }

  return () => {
    totals.batches++;
    const start = performance.now();
    const full = buildStructuralIndex({ ...args, drawDefinition: draw, team: true });
    totals.fullMs += performance.now() - start;
    if (wide) {
      totals.rebuilt++;
      seedIndex(args, draw);
      return;
    }
    totals.shadowEntries += full.matchUps.length;
    if (!isDeepStrictEqual(facts(overlay.inContextDrawMatchUps), facts(full.matchUps))) {
      totals.disagreed++;
      seedIndex(args, draw);
    }
  };
}
