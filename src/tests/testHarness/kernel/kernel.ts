/**
 * The scoring kernel test seam (pilot): versioned, serializable operations over stable internal contracts, so a
 * case written as data can run against this implementation and, later, against a second implementation through
 * its own adapter. Test infrastructure only: nothing here is exported from the package, registered on an engine or
 * reachable from server dispatch. Plan: Mentat/planning/FACTORY_TEST_INFRASTRUCTURE_PLAN.md (item E).
 *
 * An operation names a CONTRACT, not a TypeScript function: `kernel.scoring.pointsToGame@1` is "the minimum points
 * each side needs to win the current game", which a port may compute however it likes. The adapter owns the
 * translation (positional helpers, parsed shapes, transport), never the expected result.
 */
import { planningViewFromData, requiredPlanningViewKeys } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { resolveSetType } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';

export type KernelResult =
  | { kind: 'value'; value: unknown }
  | { kind: 'error'; code: string } // a refusal the contract defines
  | { kind: 'refused'; reason: 'UNKNOWN_OPERATION' | 'INVALID_INPUT'; detail?: string } // the seam declined the call
  | { kind: 'exception'; message: string }; // the implementation threw: never an expected outcome

export type KernelCase = {
  caseId: string;
  operation: string;
  input: Record<string, unknown>;
  expected: KernelResult;
  note?: string;
};

export type KernelOperation = {
  capability: 'scoring' | 'grammar' | 'scheduling';
  validate: (input: Record<string, unknown>) => string | undefined; // why the input is malformed, if it is
  run: (input: Record<string, unknown>) => KernelResult;
};

export type KernelAdapter = { name: string; invoke: (operation: string, input: unknown) => KernelResult };

const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isPair = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(isCount);

function pointsToGame(input: Record<string, unknown>): KernelResult {
  const matchUpFormat = input.matchUpFormat as string;
  const points = input.points as [number, number];
  const games = (input.games as [number, number] | undefined) ?? [0, 0];
  const formatStructure = parse(matchUpFormat);
  if (!formatStructure) return { kind: 'error', code: 'UNPARSEABLE_FORMAT' };
  const prior = games[0] + games[1];
  const matchUp: any = {
    matchUpId: 'kernel',
    matchUpFormat,
    matchUpStatus: IN_PROGRESS,
    matchUpType: SINGLES_MATCHUP,
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
    score: {
      sets: [
        {
          setNumber: 1,
          side1Score: games[0],
          side2Score: games[1],
          side1GameScores: [...new Array(prior).fill(0), points[0]],
          side2GameScores: [...new Array(prior).fill(0), points[1]],
        },
      ],
    },
  };
  const setType = resolveSetType(formatStructure, [0, 0], 1);
  const result = calculatePointsTo(matchUp, formatStructure, setType, formatStructure.setFormat, 0);
  if (!result) return { kind: 'error', code: 'NOT_CALCULABLE' };
  return { kind: 'value', value: result.pointsToGame };
}

/** the options a profile plan takes beside its view, and the type each must have */
const PLAN_OPTIONS: Record<string, (value: unknown) => boolean> = {
  clearScheduleDates: (value) =>
    typeof value === 'boolean' || (Array.isArray(value) && value.every((date) => typeof date === 'string')),
  checkPotentialRequestConflicts: (value) => typeof value === 'boolean',
  excludeNoDateCompleted: (value) => typeof value === 'boolean',
  excludePriorDates: (value) => typeof value === 'boolean',
  periodLength: isCount,
};

function validatePlanInput(input: Record<string, unknown>) {
  const view = input.view as Record<string, unknown> | undefined;
  if (!view || typeof view !== 'object' || Array.isArray(view)) return 'view must be an object';
  const missing = requiredPlanningViewKeys().filter((key) => !Object.hasOwn(view, key));
  if (missing.length) return `view is missing ${missing.join(', ')}`;
  const options = (input.options ?? {}) as Record<string, unknown>;
  if (typeof options !== 'object' || Array.isArray(options)) return 'options must be an object';
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(PLAN_OPTIONS, key)) return `unknown option ${key}`;
    if (!PLAN_OPTIONS[key](value)) return `option ${key} has the wrong type`;
  }
  return undefined;
}

// The registry is a closed, frozen map: an operation not listed here is refused, never guessed at.
export const kernelOperations: Readonly<Record<string, KernelOperation>> = Object.freeze({
  'kernel.scoring.pointsToGame@1': {
    capability: 'scoring',
    validate: (input) => {
      if (typeof input.matchUpFormat !== 'string') return 'matchUpFormat must be a string';
      if (!isPair(input.points)) return 'points must be two non-negative integers';
      if (input.games !== undefined && !isPair(input.games)) return 'games must be two non-negative integers';
      return undefined;
    },
    run: pointsToGame,
  },
  // the profile scheduler's plan: from a planning view (`viewCodec.ts`) and the call's options, the placements and the
  // reasons for every matchUp left unplaced (scheduling-pipeline.md § 4)
  'kernel.scheduling.plan@1': {
    capability: 'scheduling',
    validate: validatePlanInput,
    run: (input) => {
      const options = (input.options ?? {}) as Record<string, any>;
      const plan = planSchedule({ ...options, view: planningViewFromData(input.view as Record<string, unknown>) });
      return { kind: 'value', value: plan };
    },
  },
  'kernel.format.parse@1': {
    capability: 'grammar',
    validate: (input) => (typeof input.matchUpFormat === 'string' ? undefined : 'matchUpFormat must be a string'),
    run: (input) => {
      const parsed = parse(input.matchUpFormat as string);
      return parsed ? { kind: 'value', value: parsed } : { kind: 'error', code: 'UNPARSEABLE_FORMAT' };
    },
  },
  'kernel.format.stringify@1': {
    capability: 'grammar',
    validate: (input) =>
      input.formatStructure && typeof input.formatStructure === 'object'
        ? undefined
        : 'formatStructure must be an object',
    run: (input) => {
      const code = stringify(input.formatStructure);
      return code ? { kind: 'value', value: code } : { kind: 'error', code: 'UNSTRINGIFIABLE_FORMAT' };
    },
  },
});

function invokeOperation(operations: Readonly<Record<string, KernelOperation>>, name: string, input: unknown) {
  const operation = Object.hasOwn(operations, name) ? operations[name] : undefined;
  if (!operation) return { kind: 'refused', reason: 'UNKNOWN_OPERATION', detail: name } as KernelResult;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { kind: 'refused', reason: 'INVALID_INPUT', detail: 'input must be an object' } as KernelResult;
  }
  const invalid = operation.validate(input as Record<string, unknown>);
  if (invalid) return { kind: 'refused', reason: 'INVALID_INPUT', detail: invalid } as KernelResult;
  try {
    return operation.run(input as Record<string, unknown>);
  } catch (error) {
    return { kind: 'exception', message: error instanceof Error ? error.message : String(error) } as KernelResult;
  }
}

/**
 * A value as it arrives across the JSON wire. Not a deep copy: what JSON cannot carry (an undefined member, a Set, a
 * Date's type) is meant to be lost, because that is what a second implementation receives and answers.
 */
export function overTheWire<T>(value: T): T {
  const text = JSON.stringify(value);
  return text === undefined ? (undefined as T) : JSON.parse(text);
}

/** In-process: the operation receives the caller's input object. */
export function directAdapter(operations = kernelOperations): KernelAdapter {
  return { name: 'direct', invoke: (operation, input) => invokeOperation(operations, operation, input) };
}

/**
 * Across a serialization boundary, as a port in another process would be reached: the request and the response
 * each cross as JSON text, so nothing that does not survive JSON (undefined members, shared references, prototypes,
 * functions) can leak through and make a case pass that a second implementation would fail.
 */
export function serializedAdapter(operations = kernelOperations): KernelAdapter {
  return {
    name: 'serialized',
    invoke: (operation, input) => {
      // the wire carries text, not a copy: this is a transport, so what JSON cannot carry is meant to be lost
      const requestText = JSON.stringify({ operation, input });
      const request = JSON.parse(requestText);
      const responseText = JSON.stringify(invokeOperation(operations, request.operation, request.input));
      return JSON.parse(responseText);
    },
  };
}

const CASE_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+\.v\d+$/;
const KINDS = ['value', 'error', 'refused', 'exception'];

/** Case-file validation, kept apart from the semantic check of what each case expects. */
export function validateCases(cases: KernelCase[], operations = kernelOperations): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of cases) {
    if (!CASE_ID.test(c.caseId ?? '')) problems.push(`${c.caseId}: caseId must look like domain.name.v1`);
    if (seen.has(c.caseId)) problems.push(`${c.caseId}: duplicate caseId`);
    seen.add(c.caseId);
    if (!Object.hasOwn(operations, c.operation)) problems.push(`${c.caseId}: unknown operation ${c.operation}`);
    if (!c.input || typeof c.input !== 'object') problems.push(`${c.caseId}: input must be an object`);
    if (!KINDS.includes(c.expected?.kind)) problems.push(`${c.caseId}: expected.kind must be one of ${KINDS}`);
    if (c.expected?.kind === 'exception') problems.push(`${c.caseId}: an exception is never an expected outcome`);
  }
  return problems;
}
