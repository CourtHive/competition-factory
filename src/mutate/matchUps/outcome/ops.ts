import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { matchUpIsScored } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { nowIso } from '@Tools/clock';

// constants and types
import type {
  DrawDefinition,
  MatchUp,
  MatchUpStatusCodeElement,
  MatchUpStatusUnion,
  Score,
  Structure,
} from '@Types/tournamentTypes';

/**
 * The outcome pipeline, v2: the ops a plan is made of, and the one reducer that folds them (executor plan § 3.3, S1).
 *
 * An op says what a stored object holds once the call has written. The vocabulary is closed and is what the spec and
 * a port share. The REDUCER folds each op into a stored-shape draw: the overlay, the `differential` shadow apply and
 * (from S2) apply itself all use it, so what a plan says and what lands are one thing.
 *
 * The reducer decides nothing: it does not branch on draw state and raises no refusals. Whether an op is the right
 * one is the planner's question; the allowlist (`plan.ts`) admits only shapes whose every write is an op here.
 *
 * Ops grow by slice. S1 holds the result of the matchUp and the stamps: what a call that touches only its own
 * matchUp writes (measured 2026-10-24: status, score, winner, codes, `schedule.scoredTime`, and `updatedAt`).
 *
 * STAMPS ARE F2 (i): one per TOUCHED entity per call, the matchUp, its own structure and the draw. v1 still stamps once
 * per notice and every top-level structure on each, so until Phase C changes v1 the `differential` shadow comparison
 * normalises stamps (debate-ruled 2026-10-24, pending CA review; see `shadow.ts`). The values v2 writes are held to
 * F2 (i) by their own tests, not by that comparison.
 */
export type OutcomeOp =
  | {
      op: 'setMatchUpResult';
      matchUpId: string;
      matchUpStatus: MatchUpStatusUnion;
      winningSide?: 1 | 2;
      score?: Score;
      /** a new format; absent keeps the one the matchUp stores */
      matchUpFormat?: string;
      matchUpStatusCodes?: MatchUpStatusCodeElement[];
    }
  | {
      op: 'setMatchUpDrawPositions';
      matchUpId: string;
      /** the positions placed in the matchUp, as v1 stores them: numbers, ascending */
      drawPositions: number[];
    }
  | {
      op: 'assignPosition';
      structureId: string;
      drawPosition: number;
      /** the participant placed at the drawPosition's stored assignment (a loser fed across a link) */
      participantId: string;
    }
  | { op: 'stampUpdatedAt'; entity: 'matchUp' | 'structure' | 'drawDefinition'; id: string };

/** the op vocabulary as a literal union, which `verify:outcome-spec` holds to the spec; checked against `OutcomeOp` */
export type OutcomeOpName = 'setMatchUpResult' | 'setMatchUpDrawPositions' | 'assignPosition' | 'stampUpdatedAt';
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const opNamesMatch: Same<OutcomeOpName, OutcomeOp['op']> = true;
export const OUTCOME_OP_NAMES_MATCH = opNamesMatch;

/**
 * F2 (i), CA 2026-10-19: one stamp per touched entity per call. The call's captured instant T (`nowIso()` reads it
 * inside an engine call), or the previous stamp + 1 ms when that is already T or later, so a stamp always moves on.
 */
export function nextStamp(previous: string | undefined, now: string = nowIso()): string {
  if (!previous || previous < now) return now;
  return new Date(new Date(previous).getTime() + 1).toISOString();
}

type Stamped = { updatedAt?: string };

function stamp(target: Stamped | undefined) {
  if (target) target.updatedAt = nextStamp(target.updatedAt);
}

function setMatchUpResult(matchUp: MatchUp, op: Extract<OutcomeOp, { op: 'setMatchUpResult' }>) {
  matchUp.matchUpStatus = op.matchUpStatus;
  if (op.score) matchUp.score = structuredClone(op.score);
  if (op.winningSide) matchUp.winningSide = op.winningSide;
  else delete matchUp.winningSide;
  if (op.matchUpFormat) matchUp.matchUpFormat = op.matchUpFormat;
  if (op.matchUpStatusCodes) matchUp.matchUpStatusCodes = structuredClone(op.matchUpStatusCodes);
  // v1's `applyScoredTime`: captured the first time the matchUp is scored, kept on later corrections, removed with
  // the score so a re-score gets a fresh stamp
  if (matchUpIsScored(matchUp)) {
    matchUp.schedule ??= {};
    matchUp.schedule.scoredTime ??= nowIso();
  } else if (matchUp.schedule?.scoredTime) {
    delete matchUp.schedule.scoredTime;
  }
}

/**
 * The draw's matchUps (a round robin's groups included) and its top-level structures, by id. A walk of what this draw
 * holds, not `getMatchUpsMap`: the draw folded into is a shadow COPY in `differential`, so there is no map of it to
 * reuse, and the pipeline's own map (the one build `verify:hydrations` holds to v1) is not rebuilt.
 */
function indexDraw(drawDefinition: DrawDefinition) {
  const matchUps = new Map<string, MatchUp>();
  const structureOf = new Map<string, string>();
  const structures = new Map<string, Structure>();
  const visit = (structure: Structure) => {
    for (const matchUp of matchUpsOf(structure) ?? []) {
      matchUps.set(matchUp.matchUpId, matchUp);
      structureOf.set(matchUp.matchUpId, structure.structureId);
    }
    for (const child of structuresOf(structure) ?? []) visit(child);
  };
  for (const structure of drawDefinition.structures ?? []) {
    structures.set(structure.structureId, structure);
    visit(structure);
  }
  return { matchUps, structureOf, structures };
}

/**
 * Fold `ops`, in order, into `drawDefinition`: the live stored draw, or a stored-shape copy of it. Ids resolve against
 * the draw given, never against a hydrated copy. An op naming something the draw does not hold is a planner defect,
 * returned rather than ignored, so a shadow apply cannot pass by writing nothing.
 */
export function applyOutcomeOps(drawDefinition: DrawDefinition, ops: OutcomeOp[]): { error?: string } {
  const { matchUps, structureOf, structures } = indexDraw(drawDefinition);
  for (const op of ops) {
    if (op.op === 'setMatchUpResult' || op.op === 'setMatchUpDrawPositions') {
      const matchUp = matchUps.get(op.matchUpId);
      if (!matchUp) return { error: `${op.op}: no matchUp ${op.matchUpId}` };
      if (op.op === 'setMatchUpResult') setMatchUpResult(matchUp, op);
      // through the one writer, which normalises the positions and re-keys a side's facts if an occupant changes side
      else
        setMatchUpDrawPositions({
          structureId: structureOf.get(op.matchUpId),
          drawPositions: op.drawPositions,
          drawDefinition,
          matchUp,
        });
    } else if (op.op === 'assignPosition') {
      const assignment = positionAssignmentsOf(structures.get(op.structureId))?.find(
        (candidate) => candidate.drawPosition === op.drawPosition,
      );
      if (!assignment) return { error: `assignPosition: no drawPosition ${op.drawPosition} in ${op.structureId}` };
      assignment.participantId = op.participantId;
    } else if (op.entity === 'drawDefinition') {
      if (op.id !== drawDefinition.drawId) return { error: `stampUpdatedAt: not this draw ${op.id}` };
      stamp(drawDefinition as Stamped);
    } else {
      const target = op.entity === 'matchUp' ? matchUps.get(op.id) : structures.get(op.id);
      if (!target) return { error: `stampUpdatedAt: no ${op.entity} ${op.id}` };
      stamp(target as Stamped);
    }
  }
  return {};
}
