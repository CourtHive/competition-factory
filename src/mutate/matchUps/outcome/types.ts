import type { DrawDefinition, Event, MatchUpStatusUnion, Score, Tournament } from '@Types/tournamentTypes';
import type { ErrorType } from '@Constants/errorConditionConstants';
import type { PolicyDefinitions } from '@Types/factoryTypes';

/**
 * The outcome pipeline, v2: types.
 *
 * Written from `documentation/docs/concepts/outcome-pipeline.md` and the golden corpus, not from
 * the v1 files. Nothing here is `any`: a request is what the spec's § 1 says a call carries, a
 * refusal is one code with the spec row that raised it, and a view is the read-only answer to every
 * question § 2 asks of the draw before a write.
 */

/** § 1: the flags, after precedence against the scoring policy has been resolved */
export type OutcomeFlags = {
  allowChangePropagation?: boolean;
  propagateExitStatus?: boolean;
  propagateRetirementAsExit: boolean;
  disableScoreValidation?: boolean;
  disableAutoCalc?: boolean;
  enableAutoCalc?: boolean;
  /** set only by the exit propagation cascade; the loser of a produced exit is scored by it */
  propagatingExit?: boolean;
};

/** the score a call carries, as CODES types it; `sets` is the source of truth, the strings are derived */
export type OutcomeScore = Score;

/** § 1: what one call to `setMatchUpStatus` asks for */
export type OutcomeRequest = {
  matchUpId?: string;
  matchUpStatus?: MatchUpStatusUnion;
  // the positional status-code array a client sends is split at the WRITE (§ 4 rule 3) and is not
  // read by any refusal, so it arrives with S2b, allowlisted at `scripts/verify/exitTenant.mjs`
  winningSide?: number;
  score?: OutcomeScore;
  matchUpFormat?: string;
  flags: OutcomeFlags;
};

/** § 2: one code, the row of the table that raised it, and what a person or a client needs to see */
export type Refusal = {
  code: string;
  /** the declared constant, so a client comparing `result.error` to it by value still matches */
  error: ErrorType;
  row: number;
  info?: string;
  context?: Record<string, unknown>;
};

/** what the refusal function may ask of the draw; built once per call by `buildOutcomeView` */
export type OutcomeView = {
  hasDrawDefinition: boolean;
  /** the call's `matchUpFormat` parses (true when none was given) */
  formatRecognized: boolean;
  drawType?: string;
  found: boolean;
  isTeam: boolean;
  /** this matchUp is a line of a TEAM dual; the dual's id */
  matchUpTieId?: string;
  existing: {
    matchUpStatus?: MatchUpStatusUnion;
    winningSide?: number;
    score?: OutcomeScore;
    roundPosition?: number;
    collectionId?: string;
    /** the matchUp's own format, resolved up the hierarchy when it has none */
    matchUpFormat?: string;
    /** the existing score, under the resolved format, is a valid win */
    validWinningScore: boolean;
  };
  /** what the requested score would decide under the format the call would apply; undefined when nothing */
  impliedWinningSide?: number;
  /** a clear now would leave a propagated exit standing downstream (§ 2 row 10) */
  propagatedExitStands: boolean;
  /** something later depends on this result (§ 3) */
  activeDownstream: boolean;
  participants: {
    required: boolean;
    count: number;
    /** an exit with one participant may be awarded to the empty side (§ 2.1) */
    exitAwardable: boolean;
    requireForScoring: boolean;
  };
  /** § 2 row 12: the loser of the linked round has already been directed under the previous outcome */
  feedEligibilityBlockedBy?: string;
  /** a line of a dual: what the dual projects once this line is written */
  line?: {
    dualMatchUpId: string;
    dualMatchUpStatus?: MatchUpStatusUnion;
    dualWinningSide?: number;
    projectedWinningSide?: number;
    autoCalcDisabled: boolean;
  };
  /** a TEAM dual under `enableAutoCalc`: the winner its lines project */
  dualProjection?: { projectedWinningSide?: number };
};

export type BuildViewArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  policyDefinitions?: PolicyDefinitions;
  event?: Event;
  request: OutcomeRequest;
};
