import { checkDoUndoIdentity, checkIdempotence, checkMonotonicity } from './properties';
import { checkErrorAtomicity, checkInvariants, checkIntegrity } from './transitions';
import { clearOutcome, getDrawMatchUps, observeMutation } from './transitions';
import type { PropertyFailure } from './transitions';

import mocksEngine from '@Assemblies/engines/mock';

// constants
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

/**
 * How many matchUps the relational properties are sampled on, per seed.
 *
 * These properties MUTATE — each applies an outcome and then clears it — so every extra sample costs
 * a forward-and-back round trip. Three is a deliberate compromise: it covers more than the single
 * arbitrary first-undecided matchUp the block used to take, without turning the relational block
 * into the dominant cost of a run.
 */
const RELATIONAL_SAMPLES = 3;

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
  /** the relational probe applied AFTER `steps`; absent for non-relational findings */
  probe?: Step;
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

    /**
     * AND IT MUST STILL BE SCOREABLE. `generateSchedule` only ever targets a matchUp holding TWO
     * participants, so every schedule it produces is legal — but `shrink` drops steps AND reduces
     * the config, and this replay re-resolves each step by COORDINATE. Remove the step that fed a
     * drawPosition's opponent and the later step still fires at that coordinate, now holding
     * `[8, null]`. The finding is then recorded against an input the sweep would never generate.
     *
     * CA found this on a handed-out reproduction, 2026-09-20: *"it seems to be for setting the
     * matchUp status of main|2|2 which IS NOT READY TO BE SCORED … this raises the question about
     * whether the census is just scoring willy-nilly."* Measured over 400 findings from run
     * 20260920-192054: **80 of them (20%) score a matchUp that is not populated**, concentrated in
     * DRAW_INCONSISTENCY (41), MONOTONIC_DECISION (22), ERROR_IMPLIES_NO_MUTATION (10) and
     * STRUCTURAL_INVARIANT (7).
     *
     * The predicate is the generator's, character for character, so the two cannot drift: a second
     * spelling of "scoreable" is how this divergence arose in the first place.
     */
    if ((target.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;

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

  // Relational properties, each on the state the schedule produced.
  //
  // WIDENED 2026-09-13. This block used to take the FIRST undecided matchUp and apply exactly one
  // outcome — `DOUBLE_WALKOVER` — so across a 600-seed run the round trip was sampled once per seed,
  // in one transition shape, against ~18,000 forward mutations. Every undoability defect the harness
  // had ever caught was a double exit, which is unsurprising given a double exit was the only thing
  // it ever undid. A retirement, a walkover and a plain win were never round-tripped at all.
  //
  // Now: several candidate matchUps, and the outcome sampled from the SAME weighted alphabet the
  // schedule uses — so whatever the pipeline branches on is also what gets undone. Sampling stays
  // deterministic per seed (`rng` derived from the config seed), so a finding still reproduces.
  const candidates = getDrawMatchUps(drawId).filter(
    (matchUp: any) =>
      !matchUp.winningSide &&
      (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED) &&
      (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2,
  );
  if (!candidates.length) return null;

  // The first probe is ALWAYS `DOUBLE_WALKOVER`, on the first candidate — the exact pair this block
  // used before. Sampling instead of adding was measured to LOSE detections: three seeds stopped
  // reporting `MONOTONIC_DECISION` because the guaranteed double-exit probe had been replaced rather
  // than supplemented. Widening coverage must be strictly additive, or it is a regression wearing a
  // larger alphabet.
  const relationalRandom = rng(config.seed ^ 0x5bf03635);
  const probes = candidates.slice(0, RELATIONAL_SAMPLES).map((candidate: any, index: number) => ({
    outcome: index === 0 ? { matchUpStatus: DOUBLE_WALKOVER } : pickOutcome(relationalRandom),
    candidate,
  }));

  for (const { candidate, outcome } of probes) {
    const params = {
      propagateExitStatus: config.propagateExitStatus,
      outcome,
      matchUpId: candidate.matchUpId,
      drawId,
    };
    const relational = [...checkMonotonicity(params), ...checkIdempotence(params), ...checkDoUndoIdentity(params)];
    if (relational.length) {
      /**
       * THE PROBE IS PART OF THE REPRODUCTION, so it is recorded with the failure.
       *
       * The relational properties are not triggered by the schedule — they are triggered by THIS
       * probe, applied after it. A finding that carries only `steps` therefore does not reproduce:
       * replaying the steps alone leaves the draw in the SETUP state and reports nothing.
       *
       * Measured 2026-09-21 on COMPASS 8/7 `nonRandom: 20220267`, a `MONOTONIC_DECISION` whose
       * recorded reproduction was a single step. Driving that step alone gives `UN-DECIDED: 0`; the
       * violation needs the probe — a DOUBLE_WALKOVER on `East|1|3` — which appeared nowhere in the
       * record. A whole signal was written up against the wrong matchUp because of it.
       *
       * Same class as the shrinker gap CA found the same day: a stored reproduction that does not
       * reproduce. `steps` are the setup and `probe` completes it; a reader applies steps, then
       * probe.
       */
      return {
        ...relational[0],
        probe: {
          structureName: String(candidate.structureName),
          roundNumber: candidate.roundNumber,
          roundPosition: candidate.roundPosition,
          outcome,
        },
      };
    }
  }
  return null;
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
