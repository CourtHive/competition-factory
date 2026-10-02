import type {
  DrawDefinition,
  Event,
  MatchUpStatusCodeElement,
  MatchUpStatusUnion,
  Score,
  Tournament,
} from '@Types/tournamentTypes';
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
  /** the positional array a client sends; read by no refusal, split at the write (§ 4 rule 3) */
  matchUpStatusCodes?: MatchUpStatusCodeElement[];
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
    matchUpStatusCodes?: MatchUpStatusCodeElement[];
    winningSide?: number;
    score?: OutcomeScore;
    /** the existing score carries a value (a set with games, or a tiebreak, or points) */
    scoreHasValue: boolean;
    /** `schedule.scoredTime` is present */
    scoredTime: boolean;
    roundPosition?: number;
    collectionId?: string;
    /** the matchUp's own format, resolved up the hierarchy when it has none */
    matchUpFormat?: string;
    /** the format stored ON the matchUp, unresolved: what a write keeps (§ 4) */
    ownMatchUpFormat?: string;
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
  /** § 5 rule 1: where direction sends a winner, and who is on each side now */
  targets: {
    winnerMatchUpId?: string;
    loserMatchUpId?: string;
    /** a lucky draw's pre-feed round: nobody advances from it */
    luckyPreFeed: boolean;
    sideParticipantIds: { 1?: string; 2?: string };
    sideDrawPositions: { 1?: number; 2?: number };
    /** the loser link, when there is one: its condition and the round it feeds */
    loserLink?: { linkCondition?: string; targetRoundNumber?: number };
    /** the loserMatchUp's round in its own structure (an FMLC feed lands in round 2) */
    loserMatchUpRoundNumber?: number;
    /** the loserMatchUp's structure and drawPositions: where a kept-out loser's BYE lands */
    loserStructureId?: string;
    loserMatchUpDrawPositions?: number[];
    /** wins each side's drawPosition holds in this structure, this matchUp left out */
    priorWins: { 1: number; 2: number };
  };
  /** § 3: facts the routes ask */
  draw: {
    isAdHoc: boolean;
    /** a dual in a round-robin container (§ 3 `team round robin`) */
    teamRoundRobin: boolean;
    /** the matchUp's drawPositions include a BYE assignment (§ 3 `BYE`) */
    includesBye: boolean;
    /** a line whose last set format is timed: the score survives a status that would otherwise remove it */
    timedTie: boolean;
  };
};

/** § 3: the one route a call takes once the refusals have passed */
export type Route =
  | 'swap' // allowChangePropagation with a different winner: swapWinnerLoser (write deferred to S2c)
  | 'winner' // attemptToSetWinningSide: write the result, then direct
  | 'line-score' // a line of a dual that is being rescored: write the score, the dual recomputes
  | 'remove-directed' // a score or status without a winner over a decided matchUp: take the direction back
  | 'noop' // already in the requested double exit
  | 'only-score' // a winner exists and the status is directing: write the score
  | 'completed-to-double-exit' // remove the directed participants, then advance the double exit (deferred)
  | 'existing-winner-removed' // a winner exists, the status is not directing: take the direction back
  | 'clear' // a non-directing status: clear the score
  | 'bye' // the BYE path
  | 'double-exit' // clear the score, then advance the double exit (the advance is deferred)
  | 'team-round-robin' // a dual in a round-robin container: write the score
  | 'propagating' // propagateExitStatus: write the score
  | 'clear-score' // nothing else matched: the score is removed
  | 'apply-values' // downstream is active: write the values without re-directing
  | 'refused'; // § 3's own refusals: unrecognized, notDirecting, fallthrough (deferred to the apply)

/** § 4: what the matchUp itself holds once the write has landed */
export type MatchUpWrite = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  scoreStringSide1?: string;
  scoreStringSide2?: string;
  sets?: unknown[];
  matchUpFormat?: string;
  matchUpStatusCodes?: MatchUpStatusCodeElement[];
  scoredTime: boolean;
};

export type BuildViewArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  policyDefinitions?: PolicyDefinitions;
  event?: Event;
  request: OutcomeRequest;
};

/** § 5 rule 1: what direction must have done once the route has written */
export type DirectionPlan = {
  winner?: { matchUpId: string; participantId: string };
  /** S2c: the loser stands in `matchUpId` (`arrives`), or must not (a first-match-loser feed with prior wins) */
  loser?: {
    matchUpId: string;
    participantId: string;
    arrives: boolean;
    /** when the loser is kept out of an FMLC feed: the propagated BYE that takes their place */
    bye?: { structureId: string; drawPosition: number };
  };
};
