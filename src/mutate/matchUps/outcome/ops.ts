import { writeAssignmentResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { matchUpIsScored } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { getCapturedStamps } from '@Global/state/globalState';
import { nowIso } from '@Tools/clock';

// constants and types
import { BYE } from '@Constants/matchUpStatusConstants';
import type {
  DrawDefinition,
  MatchUp,
  MatchUpStatusCodeElement,
  MatchUpStatusUnion,
  PositionAssignment,
  Score,
  Structure,
  TallyResult,
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
 * STAMPS ARE F2 (i): one per TOUCHED entity per call, the matchUp, its own structure and the draw. v1 keeps the same
 * rule for the draw and its matchUps (`drawNotifications.ts` `stampUpdatedAt`), and `differential` compares those by
 * value. v1's matchUp notice still stamps every top-level structure, so structure stamps are left out of that comparison
 * (CA, 2026-10-24, a temporary blind spot; see `shadow.ts`) and held to F2 (i) by v2's own tests.
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
      /**
       * the position taken back out, when one is: the result goes with the participant, so the matchUp's score goes
       * too (v1's `removeSubsequentRoundsParticipant`, S4)
       */
      removedDrawPosition?: number;
      /** the position placed in by the same write, when one is: a changed winner replacing the old one (S4) */
      placedDrawPosition?: number;
    }
  | {
      op: 'assignPosition';
      structureId: string;
      drawPosition: number;
      /** the participant placed at the drawPosition's stored assignment (a loser fed across a link) */
      participantId: string;
    }
  | {
      op: 'clearPosition';
      /** a loser taken back out of the structure a link placed them in (S4): their seat emptied */
      structureId: string;
      drawPosition: number;
      /** whose seat it was: their seed entry in that structure goes with them (v1's `removeDirectedLoser`) */
      participantId: string;
    }
  | {
      op: 'setMatchUpStatusCodes';
      /** a matchUp's status codes re-derived from its provenance (a loser taken back out of it, S4) */
      matchUpId: string;
      matchUpStatusCodes: MatchUpStatusCodeElement[];
    }
  | {
      op: 'assignBye';
      /** a FIRST_MATCHUP reservation (S3): the consolation seat a loser who has won can never fill */
      structureId: string;
      drawPosition: number;
      /** the marker `assignDrawPositionBye` writes for a propagation placement, so a withdrawal can recognise it */
      byeFromPropagation: true;
    }
  | {
      op: 'setMatchUpBye';
      /** the matchUp the reserved seat is in: BYE, its score and winner removed (v1's `setMatchUpStatusBYE`) */
      matchUpId: string;
    }
  | {
      op: 'setParticipantResults';
      /** a round robin's group or an ad hoc structure: its assignments take the tallies (`writeAssignmentResults`) */
      structureId: string;
      /** each participant's tally after the call, as `tallyParticipantResults` gives it */
      participantResults: { [participantId: string]: TallyResult };
      /**
       * an ad hoc structure's assignments, rebuilt first as v1's `updateTallyIfNeeded` rebuilds them: one per
       * participant its matchUps hold, in the order they appear, holding nothing else
       */
      participantIds?: string[];
    }
  | { op: 'stampUpdatedAt'; entity: 'matchUp' | 'structure' | 'drawDefinition'; id: string };

/** the op vocabulary as a literal union, which `verify:outcome-spec` holds to the spec; checked against `OutcomeOp` */
export type OutcomeOpName =
  | 'setMatchUpResult'
  | 'setMatchUpDrawPositions'
  | 'assignPosition'
  | 'clearPosition'
  | 'setMatchUpStatusCodes'
  | 'assignBye'
  | 'setMatchUpBye'
  | 'setParticipantResults'
  | 'stampUpdatedAt';
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

/**
 * Once per call, as v1 (`drawNotifications.ts` `stampUpdatedAt`): an entity this engine call has already stamped keeps
 * its stamp. `stampedBefore` names those the live call stamped before the plan was folded, which a COPY of the draw
 * cannot tell from the call's ledger; the ledger itself covers the live draw.
 */
function stamp(target: Stamped | undefined, key: string, stampedBefore?: Set<string>) {
  const stamped = getCapturedStamps();
  if (target && !stampedBefore?.has(key) && !stamped?.has(target)) {
    target.updatedAt = nextStamp(target.updatedAt);
    stamped?.add(target);
  }
}

/**
 * The draw's entities this engine call has already stamped, as `entity:id` keys. An `executionQueue`, or a
 * competition call over several records, can stamp the draw before this `setMatchUpStatus` runs; a shadow copy of the
 * draw cannot see that, so the keys are read from the live draw before v1 writes.
 */
export function stampedInThisCall(drawDefinition?: DrawDefinition): Set<string> {
  const keys = new Set<string>();
  const stamped = getCapturedStamps();
  if (!stamped || !drawDefinition) return keys;
  if (stamped.has(drawDefinition)) keys.add(`drawDefinition:${drawDefinition.drawId}`);
  const { matchUps, structures } = indexDraw(drawDefinition);
  for (const [structureId, structure] of structures) if (stamped.has(structure)) keys.add(`structure:${structureId}`);
  for (const [matchUpId, matchUp] of matchUps) if (stamped.has(matchUp)) keys.add(`matchUp:${matchUpId}`);
  return keys;
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
  // a round robin's groups, by id: the structures a tally is written in
  const groups = new Map<string, Structure>();
  const visit = (structure: Structure) => {
    for (const matchUp of matchUpsOf(structure) ?? []) {
      matchUps.set(matchUp.matchUpId, matchUp);
      structureOf.set(matchUp.matchUpId, structure.structureId);
    }
    for (const child of structuresOf(structure) ?? []) {
      groups.set(child.structureId, child);
      visit(child);
    }
  };
  for (const structure of drawDefinition.structures ?? []) {
    structures.set(structure.structureId, structure);
    visit(structure);
  }
  return { matchUps, structureOf, structures, groups };
}

type DrawIndex = ReturnType<typeof indexDraw>;
type OpOf<K extends OutcomeOp['op']> = Extract<OutcomeOp, { op: K }>;
type Folded = { error?: string };

function foldMatchUpWrite(
  op: OpOf<'setMatchUpResult'> | OpOf<'setMatchUpDrawPositions'>,
  { matchUps, structureOf }: DrawIndex,
  drawDefinition: DrawDefinition,
): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `${op.op}: no matchUp ${op.matchUpId}` };
  if (op.op === 'setMatchUpResult') setMatchUpResult(matchUp, op);
  // through the one writer, which normalises the positions and re-keys a side's facts if an occupant changes side
  else {
    if (op.removedDrawPosition) delete matchUp.score;
    setMatchUpDrawPositions({
      structureId: structureOf.get(op.matchUpId),
      drawPositions: op.drawPositions,
      drawDefinition,
      matchUp,
    });
  }
  return {};
}

function foldAssignPosition(op: OpOf<'assignPosition'>, { structures }: DrawIndex): Folded {
  const assignment = positionAssignmentsOf(structures.get(op.structureId))?.find(
    (candidate) => candidate.drawPosition === op.drawPosition,
  );
  if (!assignment) return { error: `assignPosition: no drawPosition ${op.drawPosition} in ${op.structureId}` };
  assignment.participantId = op.participantId;
  return {};
}

function foldClearPosition(op: OpOf<'clearPosition'>, { structures }: DrawIndex): Folded {
  const structure = structures.get(op.structureId);
  const assignment = positionAssignmentsOf(structure)?.find((candidate) => candidate.drawPosition === op.drawPosition);
  if (!structure || !assignment)
    return { error: `clearPosition: no drawPosition ${op.drawPosition} in ${op.structureId}` };
  delete assignment.participantId;
  // as v1 writes it: the structure's seeds without the participant, an absent list written empty
  Object.assign(structure, {
    seedAssignments: (structure.seedAssignments ?? []).filter(
      ({ participantId }) => participantId !== op.participantId,
    ),
  });
  return {};
}

function foldStatusCodes(op: OpOf<'setMatchUpStatusCodes'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setMatchUpStatusCodes: no matchUp ${op.matchUpId}` };
  matchUp.matchUpStatusCodes = structuredClone(op.matchUpStatusCodes);
  return {};
}

function foldAssignBye(op: OpOf<'assignBye'>, { structures, groups }: DrawIndex): Folded {
  const positionAssignments = positionAssignmentsOf(structures.get(op.structureId) ?? groups.get(op.structureId));
  if (!positionAssignments) return { error: `assignBye: no structure ${op.structureId}` };
  let assignment = positionAssignments.find((candidate) => candidate.drawPosition === op.drawPosition);
  // as `assignDrawPositionBye`: a position the matchUps name but the assignments do not is added
  if (!assignment) {
    assignment = { drawPosition: op.drawPosition };
    positionAssignments.push(assignment);
  }
  assignment.bye = true;
  assignment.participantId = undefined;
  assignment.byeFromPropagation = true;
  return {};
}

function foldSetMatchUpBye(op: OpOf<'setMatchUpBye'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setMatchUpBye: no matchUp ${op.matchUpId}` };
  Object.assign(matchUp, { matchUpStatus: BYE, score: undefined, winningSide: undefined });
  return {};
}

function foldParticipantResults(op: OpOf<'setParticipantResults'>, { groups, structures }: DrawIndex): Folded {
  const structure = groups.get(op.structureId) ?? structures.get(op.structureId);
  if (structure && op.participantIds)
    Object.assign(structure, {
      positionAssignments: op.participantIds.map((participantId) => ({ participantId }) as PositionAssignment),
    });
  const positionAssignments = positionAssignmentsOf(structure);
  if (!positionAssignments) return { error: `setParticipantResults: no group ${op.structureId}` };
  writeAssignmentResults({ positionAssignments, participantResults: op.participantResults });
  return {};
}

function foldStamp(
  op: OpOf<'stampUpdatedAt'>,
  { matchUps, structures }: DrawIndex,
  drawDefinition: DrawDefinition,
  stampedBefore?: Set<string>,
): Folded {
  if (op.entity === 'drawDefinition') {
    if (op.id !== drawDefinition.drawId) return { error: `stampUpdatedAt: not this draw ${op.id}` };
    stamp(drawDefinition as Stamped, `drawDefinition:${op.id}`, stampedBefore);
    return {};
  }
  const target = op.entity === 'matchUp' ? matchUps.get(op.id) : structures.get(op.id);
  if (!target) return { error: `stampUpdatedAt: no ${op.entity} ${op.id}` };
  stamp(target as Stamped, `${op.entity}:${op.id}`, stampedBefore);
  return {};
}

/**
 * Fold `ops`, in order, into `drawDefinition`: the live stored draw, or a stored-shape copy of it. Ids resolve against
 * the draw given, never against a hydrated copy. An op naming something the draw does not hold is a planner defect,
 * returned rather than ignored, so a shadow apply cannot pass by writing nothing.
 */
export function applyOutcomeOps(drawDefinition: DrawDefinition, ops: OutcomeOp[], stampedBefore?: Set<string>): Folded {
  const index = indexDraw(drawDefinition);
  for (const op of ops) {
    const folded = foldOne(op, index, drawDefinition, stampedBefore);
    if (folded.error) return folded;
  }
  return {};
}

function foldOne(op: OutcomeOp, index: DrawIndex, drawDefinition: DrawDefinition, stampedBefore?: Set<string>): Folded {
  switch (op.op) {
    case 'setMatchUpResult':
    case 'setMatchUpDrawPositions':
      return foldMatchUpWrite(op, index, drawDefinition);
    case 'assignPosition':
      return foldAssignPosition(op, index);
    case 'clearPosition':
      return foldClearPosition(op, index);
    case 'setMatchUpStatusCodes':
      return foldStatusCodes(op, index);
    case 'assignBye':
      return foldAssignBye(op, index);
    case 'setMatchUpBye':
      return foldSetMatchUpBye(op, index);
    case 'setParticipantResults':
      return foldParticipantResults(op, index);
    default:
      return foldStamp(op, index, drawDefinition, stampedBefore);
  }
}
