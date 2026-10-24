import { enableSettleTelemetry, takeSettleEvents } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getInvariantViolations, describeViolations, type InvariantViolation } from './invariants';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import type { SettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { auditAcceptedRecord, type ProjectionAudit } from './projectionAudit';
import { captureRecord, compareRecord } from '@Tools/recordDiff';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getTournamentRecord } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { isAnyExit } from '@Validators/isExit';
import {
  deriveStatusCodes,
  exitOutcomeCode,
  getSideExitProvenance,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * Transition-level oracles for the exit-propagation pipeline.
 *
 * These assert properties of a *mutation*, not of a state, which is what makes them
 * independent of bracket semantics: none of them encodes any knowledge of how a draw is
 * supposed to progress, so none can inherit a bracket misconception from whoever wrote the
 * code under test. A single-state scanner cannot express any of them — the DOUBLE_ELIMINATION
 * findings that motivated this file leave a state `getDrawInconsistencies` reports as valid.
 */

// Keys whose values change on every write and carry no semantics for these properties.
const VOLATILE_KEYS = new Set(['updatedAt', 'createdAt', 'timeStamp', 'timestamp']);

/**
 * Deterministic, volatility-stripped serialization of a draw.
 *
 * Object keys are emitted in sorted order so a re-created-in-different-order object hashes
 * equal to the original — otherwise do/undo reports a difference wherever the engine rebuilt
 * an object rather than mutating it in place, which is noise, not signal.
 */
export function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      if (VOLATILE_KEYS.has(key)) continue;
      if (value[key] === undefined) continue;
      normalized[key] = normalize(value[key]);
    }
    return normalized;
  }
  return value;
}

/**
 * Stable hash for comparing a draw against a REBUILT copy of itself — do/undo, where the
 * engine may have re-created objects with keys in a different order.
 */
export const stableHash = (value: any): string => JSON.stringify(normalize(value));

/**
 * Collapse "absent" and "empty" to one value.
 *
 * Clearing a result leaves `matchUpStatusCodes: []` and `score: {}` where a never-played matchUp
 * has neither key at all. Both mean the same thing, and treating them as different made do/undo
 * fire on 112 of 144 cells — including a plain SINGLE_ELIMINATION walkover, which is the tell
 * that the property was wrong rather than the engine. Note this collapses empty against absent
 * ONLY: a populated array or object still differs from an empty one, so genuine residue
 * (`['WO']` decaying to `[]`) is still caught.
 */
const blankToNull = (value: any): any => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length ? value : null;
  if (typeof value === 'object') return Object.keys(value).length ? value : null;
  return value;
};

/**
 * Canonical two-slot form for `drawPositions`.
 *
 * The engine represents the same occupancy several ways depending on how it got there: `[4]`,
 * `[4, null]`, `[null, null]`, `[]` and absent all occur. drawPositions is POSITIONAL — index 0
 * is side 1 — so the padding must be preserved rather than compacted: `[null, 4]` is side 2 and
 * must never be collapsed to `[4]`. Padding to a fixed length keeps that distinction while
 * removing the representational noise.
 */
const canonicalDrawPositions = (drawPositions: any): any => {
  if (!Array.isArray(drawPositions)) return null;
  const slots = [drawPositions[0] ?? null, drawPositions[1] ?? null];
  return slots.some(Boolean) ? slots : null;
};

/**
 * The outcome fields used by accepted-transition properties.
 *
 * Hashing the whole drawDefinition on both sides of every mutation was the dominant cost in the
 * matrix — a drawSize-16 feed-in draw serializes to a few hundred KB and it happened twice per
 * step. The projection is ~2% of that and covers the principal propagation fields:
 * per-matchUp status/winner/score/codes/positions, plus each structure's positionAssignments,
 * which is where BYE and participant placement lives.
 *
 * This is an accepted-transition projection, not a complete mutation detector. Refused and thrown
 * calls are compared against the full stored tournament record in observeMutation, including
 * timestamps and fields the invariants and integrity checker do not police. Accepted-call drift
 * sampling remains a separate A3 follow-up.
 */
export function projectDraw(drawDefinition: any): any {
  return projectStructures(drawDefinition, (matchUp: any) => [
    matchUp.matchUpId,
    matchUp.matchUpStatus,
    matchUp.winningSide ?? null,
    canonicalDrawPositions(matchUp.drawPositions),
    blankToNull(matchUp.matchUpStatusCodes),
    // sideExitProvenance is projected too: a field the projection cannot see is a field the
    // properties cannot police, and an unobserved addition would look residue-free while
    // leaving state behind on every unwind.
    blankToNull(matchUp.sideExitProvenance),
    blankToNull(matchUp.score),
  ]);
}

/**
 * The projection DO_UNDO_IDENTITY compares: {@link projectDraw} without `matchUpStatusCodes`, and with the two
 * side-keyed and singular codes that carry the same consumer-visible facts (census F1, 2026-10-17).
 *
 * WHY THE ARRAY IS NOT HERE. Its writers disagree by design history, not by draw state: the forward double-exit writers
 * in `doubleExitAdvancement` keep the policy codes and derive nothing (`retainPolicyCodes`), while the clear's writers
 * derive from provenance (`deriveStatusCodes`). So a scheduled draw holds `null` where the same draw after a result and
 * its clear holds `['', 'WO']`, and the round trip reported that as residue (census a1 cases 14, 24, 29, 32). Deriving
 * the codes at settle was measured as the alternative and refused: it closed those four but opened 20 failures in the
 * exitPropagation folder, three of them a code on the winning side (`aWithdrawnExitTakesItsCode`), and changed 4 pinned
 * expectations outside it. `matchUpStatusCodes` is legacy and 8.x removes it (CA, 2026-10-15).
 *
 * The defect does not go unobserved: {@link checkCodesConsistent} asks it of a settled draw, as its own property.
 *
 * ONLY HERE. `hash()` keeps the array, so `observeMutation`'s `mutated` still sees a write that touches nothing but the
 * codes, and IDEMPOTENT_REAPPLY and ERROR_IMPLIES_NO_MUTATION still catch one.
 */
export function projectRoundTrip(drawDefinition: any): any {
  return projectStructures(drawDefinition, (matchUp: any, structure: any) => [
    matchUp.matchUpId,
    matchUp.matchUpStatus,
    matchUp.winningSide ?? null,
    byeRendered(canonicalDrawPositions(matchUp.drawPositions), structure),
    blankToNull(matchUp.sideStatusCodes),
    matchUp.matchUpStatusCode ?? null,
    blankToNull(matchUp.sideExitProvenance),
    blankToNull(matchUp.score),
  ]);
}

/**
 * A BYE's drawPosition is rendered `BYE`, not as its number (CA, 2026-09-29; census R10, 2026-10-18).
 *
 * When two BYEs meet, which of the two seats goes on depends on the order they were placed in, and that is not
 * information: `correctionDivergence`'s `renderDrawPositions` already renders it so, and its docblock records the
 * ruling and the measurement. The round trip read the number, so a probe and its clear that sent the other BYE on
 * reported a residue (COMPASS `Southeast|2|1`, `[2,3]` in 6 entry orders and `[2,4]` in 9). WHERE the BYE sits stays.
 */
function byeRendered(slots: any[] | null, structure: any): any[] | null {
  if (!slots) return slots;
  const byes = new Set(
    (structure?.positionAssignments ?? []).filter((assignment: any) => assignment.bye).map((a: any) => a.drawPosition),
  );
  return slots.map((drawPosition) => (byes.has(drawPosition) ? 'BYE' : drawPosition));
}

function projectStructures(drawDefinition: any, projectMatchUp: (matchUp: any, structure: any) => any[]): any {
  const structures: any[] = [];
  const walk = (candidates: any[]) => {
    for (const structure of candidates ?? []) {
      structures.push({
        structureId: structure.structureId,
        // normalized: extensions carry a `createdAt` stamp, and an assignment whose only change
        // is a timestamp is not a mutation for any property here. An emptied `extensions` array
        // is dropped too — `removeExtension` leaves `[]` where the key was previously absent, and
        // the two mean the same thing.
        positionAssignments: (structure.positionAssignments ?? []).map((assignment: any) =>
          normalize({ ...assignment, extensions: assignment.extensions?.length ? assignment.extensions : undefined }),
        ),
        matchUps: (structure.matchUps ?? []).map((matchUp: any) => projectMatchUp(matchUp, structure)),
      });
      if (structure.structures?.length) walk(structure.structures);
    }
  };
  walk(drawDefinition?.structures ?? []);
  return structures;
}

export const hash = (drawDefinition: any): string => JSON.stringify(projectDraw(drawDefinition));

export function getDrawDefinition(drawId: string): any {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return drawDefinition;
}

export function getDrawMatchUps(drawId: string): any[] {
  // inContext is required: without it matchUps come back with no `sides`, so every
  // participant-presence check silently reads undefined and every matchUp looks unplayable.
  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  return matchUps ?? [];
}

/** The set of matchUpIds that have been decided — used by the monotonicity property. */
export function decidedMatchUpIds(matchUps: any[]): Set<string> {
  return new Set(
    matchUps
      .filter(
        (matchUp: any) => matchUp.winningSide || (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED),
      )
      .map((matchUp: any) => matchUp.matchUpId),
  );
}

export type Observation = {
  mutated: boolean;
  /** what the settle passes could not report through the result: a loop at its bound, a dropped error (Phase C) */
  settleEvents: SettleEvent[];
  /** Refused/thrown calls only: exact full-record comparison, with no timestamp exemption. */
  recordMutated?: boolean;
  firstRecordDifference?: string;
  /** which call of a scenario this was, carried onto any finding it produces */
  stage?: FindingStage;
  thrown?: string;
  error?: any;
  result?: any;
  before: string;
  after: string;
  invariantViolations: InvariantViolation[];
  /** inContext matchUps as of AFTER the mutation — reusable by a driver, saving a re-query */
  matchUps: any[];
};

export type MutationObserver = {
  attempted: () => void;
  checked: (observation: Observation, matchUpId: string) => void;
};

/**
 * `allowChangePropagation`, off by default and enabled per-RUN rather than per-scenario.
 *
 * WHY THIS EXISTS. `resolveAndApplyOutcome` checks this flag BEFORE the `activeDownstream` dispatch,
 * so it short-circuits to `swapWinnerLoser` past every refusal that guards an ordinary re-score. It
 * is a CONSUMER CHOICE, not a default: some scoring clients send it on every score, and others do
 * not permit a winning-side change to propagate at all. The harness set it never, so the whole
 * census measured only one of the two behaviours the engine offers — and #4875 fixed a real defect
 * on the other one, which the census scored at exactly zero.
 *
 * AN ENV FLAG, NOT A CONFIG FIELD, deliberately. Adding it to `ScenarioConfig` would change what
 * `randomConfig` draws from the seeded RNG and invalidate every frozen schedule file — the
 * "harness fix changed generation" trap this workstream has already paid for once. Read here, at
 * replay time, the same frozen window can be run both ways and the two numbers compared directly.
 *
 * Emit with it OFF. `generateSchedule` calls this function too, so emitting under the flag would
 * produce a different schedule set and confound the comparison it exists to make.
 */
const changePropagationFromEnvironment = () =>
  process.env.ALLOW_CHANGE_PROPAGATION === '1' ? { allowChangePropagation: true } : {};

/**
 * Apply one outcome and report everything the properties need, without asserting.
 *
 * Callers decide which observations are failures, because the matrix quarantines known ones.
 */
export function observeMutation({
  propagateExitStatus,
  allowChangePropagation,
  projectionAudit,
  observer,
  matchUpId,
  priorHash,
  outcome,
  drawId,
  stage,
}: {
  propagateExitStatus?: boolean;
  allowChangePropagation?: boolean;
  projectionAudit?: ProjectionAudit;
  observer?: MutationObserver;
  stage?: FindingStage;
  priorHash?: string;
  matchUpId: string;
  drawId: string;
  outcome: any;
}): Observation {
  // `priorHash` lets a driver carry the previous step's `after` forward as this step's `before`,
  // halving the number of full-draw reads in a play-forward loop.
  const before = priorHash ?? hash(getDrawDefinition(drawId));
  // Read canonical stored state, not getTournament()'s outward copy (whose copy policy may omit fields).
  const recordBefore = captureRecord(getTournamentRecord(tournamentEngine.getTournamentId()));

  let result: any;
  let thrown: string | undefined;
  observer?.attempted();
  // a pass's writes cost two record captures per pass: recorded only for a measurement run (SETTLE_PASSES=1)
  enableSettleTelemetry(true, { passes: process.env.SETTLE_PASSES === '1' });
  try {
    result = tournamentEngine.setMatchUpStatus({
      propagateExitStatus,
      matchUpId,
      drawId,
      outcome,
      ...(allowChangePropagation === undefined ? changePropagationFromEnvironment() : { allowChangePropagation }),
    });
  } catch (err: any) {
    thrown = String(err?.message ?? err);
  }
  const settleEvents = takeSettleEvents();
  enableSettleTelemetry(false);

  const drawDefinition = getDrawDefinition(drawId);
  const after = hash(drawDefinition);
  const recordComparison =
    result?.error || thrown !== undefined
      ? compareRecord(recordBefore, getTournamentRecord(tournamentEngine.getTournamentId()))
      : undefined;
  if (projectionAudit && !result?.error && thrown === undefined)
    auditAcceptedRecord({
      audit: projectionAudit,
      before: recordBefore,
      record: getTournamentRecord(tournamentEngine.getTournamentId()),
      drawId,
      projectionChanged: before !== after,
    });
  const matchUps = getDrawMatchUps(drawId);
  const invariantViolations = getInvariantViolations({ matchUps, drawDefinition });

  const observation: Observation = {
    mutated: before !== after,
    settleEvents,
    recordMutated: recordComparison ? !recordComparison.equal : undefined,
    firstRecordDifference: recordComparison?.firstDifference?.path,
    error: result?.error,
    stage,
    invariantViolations,
    matchUps,
    thrown,
    result,
    before,
    after,
  };
  observer?.checked(observation, matchUpId);
  return observation;
}

/**
 * The repo's own integrity checker, run alongside rather than reimplemented.
 *
 * Called once per cell rather than per step: it re-derives inContext matchUps for the whole
 * draw and is far too expensive to run on every mutation. Note it did NOT flag the
 * DOUBLE_ELIMINATION states that motivated this harness — it is a complement to the transition
 * properties, not a substitute for them.
 */
export function checkIntegrity(drawId: string, matchUpId: string): PropertyFailure[] {
  const drawDefinition = getDrawDefinition(drawId);
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
  if (integrity?.valid !== false) return [];
  return [
    {
      property: 'DRAW_INCONSISTENCY',
      matchUpId,
      detail: JSON.stringify(integrity.inconsistencies),
    },
  ];
}

/** The outcome that clears a result — the `isClearScore` branch in setMatchUpState. */
export const clearOutcome = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

export type PropertyFailure = {
  property: string;
  matchUpId: string;
  detail: string;
  /**
   * For the RELATIONAL properties only. Those are triggered by a probe applied AFTER the schedule,
   * so a failure that carries only the schedule does not reproduce — see `replay`'s relational
   * phase for the measurement that cost a signal write-up. Absent on every other property.
   */
  probe?: { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
  /** for DO_UNDO_IDENTITY: every projected field the round trip left changed, by coordinate */
  changes?: ProjectionChange[];
  /** the call that produced the finding; see {@link FindingStage} */
  stage?: FindingStage;
  /** for a `schedule` finding, the index of the scheduled step that produced it */
  step?: number;
  /**
   * The first field that differed: a JSON Pointer into the tournament record for a refusal or throw that wrote, or
   * `<structure|round|position> <field>` for a round trip that did not restore the draw.
   */
  firstDivergence?: string;
};

/**
 * Where in a scenario a finding arose, so a reader can tell which call to reproduce (census plan A6).
 *
 * `build` is draw preparation or a missing schedule; `schedule` a scheduled step (with `step`); `final` the checks run
 * on the draw the schedule produced; `forward`, `second-apply` and `clear` the calls of a relational probe.
 */
export type FindingStage = 'build' | 'schedule' | 'final' | 'forward' | 'second-apply' | 'clear';

export type ProjectionChange = { at: string; field: string; before: any; after: any };

const MATCHUP_FIELDS = [
  'matchUpStatus',
  'winningSide',
  'drawPositions',
  'matchUpStatusCodes',
  'sideExitProvenance',
  'score',
];

/** The fields of {@link projectRoundTrip}'s rows, in order, for {@link projectionChanges}. */
export const ROUND_TRIP_FIELDS = [
  'matchUpStatus',
  'winningSide',
  'drawPositions',
  'sideStatusCodes',
  'matchUpStatusCode',
  'sideExitProvenance',
  'score',
];

/**
 * The projected fields two `projectDraw` results disagree on, named by structural coordinate rather than by offset into a
 * serialization: an offset says where two strings part, not which matchUp kept what. `coordinates` maps matchUpId to
 * `structureName|roundNumber|roundPosition`; a positionAssignment is named by structure and drawPosition.
 */
export function projectionChanges(
  before: any[],
  after: any[],
  coordinates: Map<string, string>,
  fields: string[] = MATCHUP_FIELDS,
): ProjectionChange[] {
  const changes: ProjectionChange[] = [];
  const afterById = new Map(after.map((structure: any) => [structure.structureId, structure]));
  for (const structure of before) {
    const later = afterById.get(structure.structureId);
    const laterMatchUps = new Map((later?.matchUps ?? []).map((row: any[]) => [row[0], row]));
    for (const row of structure.matchUps) {
      const laterRow: any = laterMatchUps.get(row[0]);
      fields.forEach((field, index) => {
        const [prior, next] = [row[index + 1], laterRow?.[index + 1]];
        if (JSON.stringify(normalize(prior)) !== JSON.stringify(normalize(next)))
          changes.push({ at: coordinates.get(row[0]) ?? row[0], field, before: prior, after: next ?? null });
      });
    }
    const laterAssignments = new Map(
      (later?.positionAssignments ?? []).map((assignment: any) => [assignment.drawPosition, assignment]),
    );
    const structureName = structureNameOf(structure, coordinates);
    for (const assignment of structure.positionAssignments) {
      const next = laterAssignments.get(assignment.drawPosition);
      if (JSON.stringify(assignment) !== JSON.stringify(next ?? null))
        changes.push({
          at: `${structureName}|dp${assignment.drawPosition}`,
          field: 'positionAssignment',
          before: assignment,
          after: next ?? null,
        });
    }
  }
  return changes;
}

function structureNameOf(structure: any, coordinates: Map<string, string>): string {
  const coordinate = structure.matchUps.map((row: any[]) => coordinates.get(row[0])).find(Boolean);
  return coordinate?.split('|')[0] ?? structure.structureId;
}

/**
 * ERROR_IMPLIES_NO_MUTATION — the general form of the partial-mutation class.
 *
 * A returned error must leave state byte-identical. `engineInvoke` can restore a snapshot, but
 * only when the caller passes `rollbackOnError`, which is off by default; a direct
 * `setMatchUpStatus` gets no such protection, and that is the path this asserts.
 */
export function checkErrorAtomicity(observation: Observation, matchUpId: string): PropertyFailure[] {
  const failures: PropertyFailure[] = [];
  const mutated = observation.recordMutated ?? observation.mutated;
  const at = observation.firstRecordDifference;
  const location = at === undefined ? '' : ` at ${at || '/'}`;
  // the stage and pointer are what a reader needs to reproduce the call; absent on an unobserved write
  const provenance = {
    ...(observation.stage ? { stage: observation.stage } : {}),
    ...(mutated && at !== undefined ? { firstDivergence: at || '/' } : {}),
  };
  if (observation.thrown !== undefined) {
    const mutation = mutated ? ` (state was mutated before the throw${location})` : '';
    failures.push({
      property: 'NO_EXCEPTION_ESCAPES',
      matchUpId,
      detail: observation.thrown + mutation,
      ...provenance,
    });
  }
  if ((observation.error || observation.thrown !== undefined) && mutated) {
    const action = observation.thrown !== undefined ? 'threw' : `returned ${JSON.stringify(observation.error)}`;
    failures.push({
      property: 'ERROR_IMPLIES_NO_MUTATION',
      matchUpId,
      detail: `${action} after mutating the tournament record${location}`,
      ...provenance,
    });
  }
  return failures;
}

export function checkInvariants(observation: Observation, matchUpId: string): PropertyFailure[] {
  if (!observation.invariantViolations.length) return [];
  return [
    {
      property: 'STRUCTURAL_INVARIANT',
      matchUpId,
      detail: describeViolations(observation.invariantViolations),
      ...(observation.stage ? { stage: observation.stage } : {}),
    },
  ];
}

/**
 * CODES_CONSISTENT — every exit that records where it came from shows it in `matchUpStatusCodes` (census F1, 2026-10-17).
 *
 * The state-level half of what DO_UNDO_IDENTITY stopped comparing ({@link projectRoundTrip}). Stored codes are read
 * against {@link deriveStatusCodes}, the derivation the clear's writers use, on every matchUp that is an exit
 * ({@link isAnyExit}, as `codesForUnwound` gates it: a BYE deliberately holds no codes) and records provenance. A slot
 * the derivation fills and the store leaves blank is reported; so is a slot holding a different code. Blank against
 * absent is not a difference, as in {@link projectDraw}.
 *
 * A separate property because it is a known defect the forward double-exit writers carry, not residue a round trip
 * leaves: measured 2–9 matchUps per scheduled draw on census a1 cases 14, 24, 29 and 32 before any probe ran. It is not
 * wired into `replay`; a caller asks it of a settled draw.
 */
export function checkCodesConsistent(drawId: string, matchUpId: string): PropertyFailure[] {
  const drawDefinition = getDrawDefinition(drawId);
  const failures: PropertyFailure[] = [];
  const coordinates = new Map(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      matchUp.matchUpId,
      `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`,
    ]),
  );
  for (const matchUp of getMatchUpsMap({ drawDefinition }).drawMatchUps) {
    if (!isAnyExit(matchUp.matchUpStatus) || !getSideExitProvenance({ matchUp })) continue;
    const stored = ((matchUp.matchUpStatusCodes as any[]) ?? []).map(exitOutcomeCode);
    const derived = deriveStatusCodes(matchUp);
    const length = Math.max(stored.length, derived.length);
    const disagree = Array.from({ length }, (_, index) => index).some(
      (index) => (stored[index] || '') !== (derived[index] || ''),
    );
    if (!disagree) continue;
    const at = coordinates.get(matchUp.matchUpId) ?? matchUp.matchUpId;
    failures.push({
      property: 'CODES_CONSISTENT',
      matchUpId,
      detail: `${at}: matchUpStatusCodes ${JSON.stringify(blankToNull(matchUp.matchUpStatusCodes))} where its provenance derives ${JSON.stringify(derived)}`,
    });
  }
  return failures;
}
