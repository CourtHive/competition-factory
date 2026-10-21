/**
 * Which implementation of the `ScoringEngine` decides.
 *
 * `v1` is the class as written (`src/assemblies/engines/scoring/ScoringEngine.ts`). `v2` is the clean-room reducer
 * under `src/assemblies/engines/scoring/v2/`, written from the spec
 * (`documentation/docs/scoring-engine/scoring-engine-spec.md`) and the conformance cases. `differential` runs both:
 * v1 acts, v2 reduces the same configuration and timeline, and any difference throws.
 *
 * A global-state mode, as `OUTCOME_PIPELINE` is: the engine source reads no `process.env`. Until SE2c builds the v2
 * engine shell, `v2` cannot run alone and `setScoringEngine` refuses it.
 */
export const SCORING_ENGINE_V1 = 'v1';
export const SCORING_ENGINE_V2 = 'v2';
export const SCORING_ENGINE_DIFFERENTIAL = 'differential';

export type ScoringEngineMode =
  typeof SCORING_ENGINE_V1 | typeof SCORING_ENGINE_V2 | typeof SCORING_ENGINE_DIFFERENTIAL;

export const scoringEngineModes: ScoringEngineMode[] = [
  SCORING_ENGINE_V1,
  SCORING_ENGINE_V2,
  SCORING_ENGINE_DIFFERENTIAL,
];

/** the modes that can run today: v2 alone needs the engine shell (SE2c) */
export const runnableScoringEngineModes: ScoringEngineMode[] = [SCORING_ENGINE_V1, SCORING_ENGINE_DIFFERENTIAL];
