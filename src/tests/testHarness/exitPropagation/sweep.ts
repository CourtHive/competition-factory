import { checkDoUndoIdentity, checkIdempotence, checkMonotonicity } from './properties';
import { checkErrorAtomicity, checkInvariants, checkIntegrity } from './transitions';
import { clearOutcome, getDrawMatchUps, observeMutation } from './transitions';
import type { PropertyFailure } from './transitions';

import mocksEngine from '@Assemblies/engines/mock';

import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  TO_BE_PLAYED,
  DEFAULTED,
  WALKOVER,
  RETIRED,
} from '@Constants/matchUpStatusConstants';

/**
 * Randomized exploration of the exit-propagation pipeline, for running at scale off-CI.
 *
 * The in-suite matrix is deterministic and canonical-ordered by design — it has to reproduce from
 * a cell name. That is also its limit: it applies outcomes in one fixed order and never re-scores.
 * This sweep gives up canonical ordering to reach states that ordering cannot, and buys the
 * reproducibility back with a seed plus a shrinker.
 *
 * Every lesson that cost time building the in-suite harness is encoded here:
 *   - nothing is ordered by a generated id (structureId/matchUpId are fresh UUIDs, and ordering on
 *     them silently randomises the schedule and invalidates any comparison);
 *   - each relational property runs against its own freshly generated draw, because they mutate
 *     and would otherwise become each other's preconditions;
 *   - a finding is shrunk before it is reported, because an unshrunk counterexample is a backlog
 *     item rather than a bug report.
 */

export const SWEEP_DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];

const DRAW_SIZES = [8, 16, 32];
const REDUCTIONS = [0, 1, 2, 3, 5];

/**
 * Decorrelate a seed before it is used as PRNG state.
 *
 * An LCG's first output is close to linear in its state, so consecutive small seeds land in the
 * same bucket for a long stretch. Measured without this: seeds 1..60 chose the SAME draw type
 * (FIRST_MATCH_LOSER_CONSOLATION) sixty times out of sixty, and the distribution only evened out
 * after several thousand seeds. A worker handed a contiguous seed block would therefore sweep one
 * draw type for its entire range while appearing to sample all ten.
 */
function mixSeed(seed: number): number {
  let hash = seed >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Deterministic PRNG so a scenario reproduces from its seed alone. */
export function rng(seed: number) {
  let state = mixSeed(seed);
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export type ScenarioConfig = {
  propagateExitStatus: boolean;
  participantsCount: number;
  drawType: string;
  drawSize: number;
  seed: number;
};

/**
 * Weighted outcome alphabet.
 *
 * Not uniform: exits are ~30x their natural rate because they are what the pipeline branches on,
 * and CLEAR is included because the whole removal half of the code is unreachable without it —
 * measured on the in-suite harness, a set-only schedule produced zero blocks across every cell.
 */
const OUTCOMES: { weight: number; outcome: any }[] = [
  { weight: 26, outcome: { winningSide: 1 } },
  { weight: 26, outcome: { winningSide: 2 } },
  { weight: 8, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { weight: 8, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { weight: 6, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  {
    weight: 4,
    outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
  },
  { weight: 9, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
  { weight: 5, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
  { weight: 8, outcome: clearOutcome },
];
const TOTAL_WEIGHT = OUTCOMES.reduce((sum, entry) => sum + entry.weight, 0);

function pickOutcome(random: () => number): any {
  let roll = random() * TOTAL_WEIGHT;
  for (const entry of OUTCOMES) {
    roll -= entry.weight;
    if (roll <= 0) return entry.outcome;
  }
  return OUTCOMES[0].outcome;
}

export function randomConfig(seed: number): ScenarioConfig {
  const random = rng(seed);
  const drawType = SWEEP_DRAW_TYPES[Math.floor(random() * SWEEP_DRAW_TYPES.length)];
  const drawSize = DRAW_SIZES[Math.floor(random() * DRAW_SIZES.length)];
  const reduction = REDUCTIONS[Math.floor(random() * REDUCTIONS.length)];
  return {
    participantsCount: Math.max(4, drawSize - reduction),
    propagateExitStatus: random() < 0.5,
    drawSize,
    drawType,
    seed,
  };
}

/** A step names its target STRUCTURALLY, so it survives regeneration and shrinking. */
export type Step = {
  structureName: string;
  roundNumber: number;
  roundPosition: number;
  outcome: any;
};

const structuralKey = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

export function prepareDraw(config: ScenarioConfig, drawId: string): boolean {
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: config.participantsCount,
        drawSize: config.drawSize,
        drawType: config.drawType,
        drawId,
      },
    ],
    nonRandom: config.seed,
    setState: true,
  });
  return !!drawIds?.includes(drawId);
}

/**
 * Build a random schedule by walking the draw, choosing among matchUps that can legally be
 * targeted — undecided ones with two participants, and decided ones (so CLEAR and re-score are
 * reachable).
 */
export function generateSchedule(config: ScenarioConfig, drawId: string, maxSteps: number): Step[] {
  const random = rng(config.seed ^ 0x9e3779b9);
  const steps: Step[] = [];

  for (let taken = 0; taken < maxSteps; taken++) {
    const matchUps = getDrawMatchUps(drawId);
    const populated = matchUps.filter(
      (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2,
    );
    if (!populated.length) break;

    const target = populated[Math.floor(random() * populated.length)];
    const outcome = pickOutcome(random);
    const step: Step = {
      structureName: String(target.structureName),
      roundNumber: target.roundNumber,
      roundPosition: target.roundPosition,
      outcome,
    };
    steps.push(step);
    observeMutation({ propagateExitStatus: config.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
  }
  return steps;
}

export type Finding = PropertyFailure & {
  config: ScenarioConfig;
  steps: Step[];
  fingerprint: string;
};

/**
 * Replay a schedule against a fresh draw and return the first property failure.
 *
 * Returns null when the schedule is clean, which is what the shrinker tests against.
 */
export function replay(config: ScenarioConfig, steps: Step[], drawId: string): PropertyFailure | null {
  if (!prepareDraw(config, drawId)) return null;

  for (const step of steps) {
    const matchUps = getDrawMatchUps(drawId);
    const target = matchUps.find((matchUp: any) => structuralKey(matchUp) === structuralKey(step));
    // a shrunk schedule can name a matchUp that no longer exists at a smaller drawSize; skipping
    // is correct — the step simply has no effect on this draw
    if (!target) continue;

    const observation = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    const failures = [
      ...checkErrorAtomicity(observation, target.matchUpId),
      ...checkInvariants(observation, target.matchUpId),
    ];
    if (failures.length) return failures[0];
  }

  const integrity = checkIntegrity(drawId, '-');
  if (integrity.length) return integrity[0];

  // relational properties, each on the state the schedule produced
  const next = getDrawMatchUps(drawId).find(
    (matchUp: any) =>
      !matchUp.winningSide &&
      (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED) &&
      (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2,
  );
  if (!next) return null;

  const params = {
    propagateExitStatus: config.propagateExitStatus,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: next.matchUpId,
    drawId,
  };
  const relational = [...checkMonotonicity(params), ...checkIdempotence(params), ...checkDoUndoIdentity(params)];
  return relational[0] ?? null;
}

/**
 * Delta-debugging over the step list, then the draw size.
 *
 * Step removal runs first because every later pass is cheaper on a shorter schedule, and it is by
 * far the highest-yield reduction. drawSize shrinking is what turns "somewhere in a 32 draw" into
 * a readable report; steps are re-mapped by structural coordinates, and any that no longer exist
 * are dropped by `replay`.
 */
export function shrink(
  config: ScenarioConfig,
  steps: Step[],
  drawId: string,
): { config: ScenarioConfig; steps: Step[] } {
  const stillFails = (candidateConfig: ScenarioConfig, candidateSteps: Step[], property: string) =>
    replay(candidateConfig, candidateSteps, drawId)?.property === property;

  const original = replay(config, steps, drawId);
  if (!original) return { config, steps };
  const property = original.property;

  let currentSteps = steps;
  let progress = true;
  while (progress) {
    progress = false;
    for (let index = 0; index < currentSteps.length; index++) {
      const candidate = currentSteps.filter((_, position) => position !== index);
      if (stillFails(config, candidate, property)) {
        currentSteps = candidate;
        progress = true;
        break;
      }
    }
  }

  let currentConfig = config;
  for (const smaller of DRAW_SIZES.filter((size) => size < config.drawSize)) {
    const candidate = {
      ...currentConfig,
      drawSize: smaller,
      participantsCount: Math.max(4, smaller - (config.drawSize - config.participantsCount)),
    };
    if (stillFails(candidate, currentSteps, property)) {
      currentConfig = candidate;
      break;
    }
  }

  return { config: currentConfig, steps: currentSteps };
}

/**
 * Dedup key. Two findings with the same property in the same draw type at the same structural
 * location are the same bug; without this a long run reports the same defect thousands of times.
 */
export function fingerprint(config: ScenarioConfig, failure: PropertyFailure, steps: Step[]): string {
  const shape = steps
    .map((step) => `${step.structureName}:${step.roundNumber}:${step.outcome.matchUpStatus ?? 'W'}`)
    .join(',');
  let hash = 2166136261;
  for (const char of `${config.drawType}|${failure.property}|${shape}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
