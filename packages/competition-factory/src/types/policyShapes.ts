import type { RotatingPartnerScoringPolicies } from './rotatingPartnerScoring';
import type { DrawTypeUnion } from './tournamentTypes';
import type { IdCollections } from './factoryTypes';

/**
 * One participant attribute an avoidance policy separates on: a `key` path into the participant
 * (`'person.nationalityCode'`), a `directive` naming an id collection, or explicit `groupings`.
 */
export type PolicyAttribute = {
  groupings?: { [groupName: string]: string[] };
  directive?: keyof IdCollections;
  significantCharacters?: number;
  includeIds?: string[];
  key?: string;
};

/** The avoidance policy (`POLICY_TYPE_AVOIDANCE`) as positioning reads it. */
export type AvoidancePolicy = {
  policyAttributes?: PolicyAttribute[];
  roundsToSeparate?: number;
  targetDivisions?: number;
  candidatesCount?: number;
  policyName?: string;
};

/**
 * One entry of an actions policy's `enabledStructures` or `disabledStructures`: the structures it
 * matches (an empty or absent list matches all) and, when enabled, the actions it allows.
 */
export type ActionsStructurePolicy = {
  disabledActions?: string[];
  enabledActions?: string[];
  structureTypes?: string[];
  stageSequences?: number[];
  feedProfiles?: string[];
  stages?: string[];
};

/** The matchUp actions policy (`POLICY_TYPE_MATCHUP_ACTIONS`) as `matchUpActions` reads it. */
export type MatchUpActionsPolicy = {
  participants?: { enforceCategory?: boolean; enforceGender?: boolean };
  enabledStructures?: ActionsStructurePolicy[];
  processCodes?: { substitution?: string[] };
  substituteAfterCompleted?: boolean;
  substituteWithoutScore?: boolean;
  policyName?: string;
};

/**
 * The position actions policy (`POLICY_TYPE_POSITION_ACTIONS`) as `positionActions` reads it. `enabledStructures: false`
 * disables every position action; an empty or absent list enables them all.
 */
export type PositionActionsPolicy = {
  enabledStructures?: false | ActionsStructurePolicy[];
  disabledStructures?: ActionsStructurePolicy[];
  /** Actions offered even when the structure has active draw positions. */
  activePositionOverrides?: string[];
  /** Qualifiers may be placed in any round, not only the round their qualifying structure targets. */
  disableRoundRestrictions?: boolean;
  /** Qualifiers are offered only once their qualifying structure is complete. */
  requireCompletedStructures?: boolean;
  /** Entries in other flights of the event are offered as alternates. */
  otherFlightEntries?: boolean;
  /** Alternates for a qualifying structure come only from qualifying entries, and for others only from the rest. */
  restrictQualifyingAlternates?: boolean;
  policyName?: string;
};

/** The voluntary consolation policy (`POLICY_TYPE_VOLUNTARY_CONSOLATION`): who may enter a voluntary consolation. */
export type VoluntaryConsolationPolicy = {
  excludedMatchUpStatuses?: string[];
  includeEventParticipants?: boolean;
  finishingRoundLimit?: number;
  roundNumberLimit?: number;
  matchUpsLimit?: number;
  requirePlay?: boolean;
  requireLoss?: boolean;
  allEntries?: boolean;
  winsLimit?: number;
  policyName?: string;
};

/** A point the competitive-bands prediction curve passes through. */
export type PredictionAnchor = {
  probability: number;
  delta: number;
};

/** The two anchors per curve that `predictMatchUpCompetitiveBands` fits its logistic curves to. */
export type PredictionModel = {
  competitiveAnchors: PredictionAnchor[];
  decisiveAnchors: PredictionAnchor[];
};

/**
 * One entry in a `deltaBands` ordered boundary list.
 *
 * A boundary is `max` (absolute rating units) XOR `maxPct` (percent of the
 * scale's range). Both on one entry is a validation error, not a precedence
 * rule. The FINAL entry omits both and catches the remainder, so N entries
 * always produce exactly N bands.
 */
export type DeltaBand = {
  maxPct?: number;
  max?: number;
  key: string;
};

/** The competitive bands policy (`POLICY_TYPE_COMPETITIVE_BANDS`). */
export type CompetitiveBandsPolicy = {
  /** Spread thresholds, in percent, keyed by band (`DECISIVE`, `ROUTINE`); a spread above them all is COMPETITIVE. */
  profileBands?: { [band: string]: number };
  /** The signed exposure axis: an ordered boundary list whose final entry omits its bound. */
  deltaBands?: DeltaBand[];
  predictionModel?: PredictionModel;
  policyName?: string;
};

/**
 * A participant attribute template: `true` keeps an attribute, `false` drops it, a nested template filters an object
 * (or each element of an array of objects), and an array keeps an element only when the attribute's value is listed.
 * A key may name alternatives (`'a||b'`), and `'*'` keeps every attribute the template does not set to `false`.
 */
export type AttributeFilterTemplate = {
  [attribute: string]: boolean | unknown[] | AttributeFilterTemplate;
};

/** The participant (privacy) policy (`POLICY_TYPE_PARTICIPANT`): which participant attributes leave the engine. */
export type ParticipantPolicy = {
  participant?: AttributeFilterTemplate;
  policyName?: string;
};

/** The progression policy (`POLICY_TYPE_PROGRESSION`): what follows a result into connected structures. */
export type ProgressionPolicy = {
  /** A double exit produces a BYE for its loser's seat (default `true`); `false` produces a WALKOVER / DEFAULTED. */
  doubleExitPropagateBye?: boolean;
  autoReplaceQualifiers?: boolean;
  autoRemoveQualifiers?: boolean;
  autoPlaceQualifiers?: boolean;
  policyName?: string;
};

/** The feed-in policy (`POLICY_TYPE_FEED_IN`): how a main structure's losers feed a consolation. */
export type FeedInPolicy = {
  /** Per round, the order in which groups of feeding positions are taken. */
  roundGroupedOrder?: number[][];
  /** Per round, `TOP_DOWN` or `BOTTOM_UP`. */
  roundFeedProfiles?: string[];
  feedFromMainFinal?: boolean;
  policyName?: string;
};

/** An entry of a draws policy's `allowedDrawTypes`, selected by category. */
export type AllowedDrawTypeDefinition = {
  drawType?: DrawTypeUnion;
  categoryNames?: string[];
  categoryTypes?: string[];
  description?: string;
};

/** The draws policy (`POLICY_TYPE_DRAWS`). */
export type DrawsPolicy = {
  /** `true` or `false` for every draw type, or per draw type `true`, `false` or the participants count it applies up to. */
  drawTypeCoercion?: boolean | { [drawType: string]: boolean | number };
  allowedDrawTypes?: AllowedDrawTypeDefinition[];
  policyName?: string;
};

/** An entry of a scoring policy's `matchUpFormats`, selected by category. */
export type ScoringMatchUpFormatDefinition = {
  matchUpFormat: string;
  categoryNames?: string[];
  categoryTypes?: string[];
  description?: string;
};

/** A refinement of a matchUpStatus offered by a scoring policy's `matchUpStatusCodes`. */
export type MatchUpStatusCodeDefinition = {
  matchUpStatusCodeDisplay?: string;
  matchUpStatusCode: string;
  description?: string;
  label?: string;
};

/** Scoring requirements for one stage, or one stage sequence of a stage. */
export type ScoringSequencePolicy = { requireAllPositionsAssigned?: boolean };

/** Scoring requirements per stage, then per stage sequence. */
export type ScoringStagePolicies = {
  [stage: string]: ScoringSequencePolicy & { stageSequence?: { [stageSequence: string]: ScoringSequencePolicy } };
};

/**
 * The scoring policy (`POLICY_TYPE_SCORING`). A propagation flag set here, `true` or `false`, overrides the call's;
 * absent, the call decides.
 */
export type ScoringPolicy = {
  defaultMatchUpFormat?: string;
  matchUpFormats?: ScoringMatchUpFormatDefinition[];
  /** Keyed by matchUpStatus, or by a label group such as `WITHDRAWN` that is not a matchUpStatus. */
  matchUpStatusCodes?: { [statusGroup: string]: MatchUpStatusCodeDefinition[] };
  allowDeletionWithScoresPresent?: { drawDefinitions?: boolean; structures?: boolean };
  requireParticipantsForScoring?: boolean;
  requireAllPositionsAssigned?: boolean;
  /** Requires all positions assigned per stage and stage sequence, as bundled policies state it. */
  stage?: ScoringStagePolicies;
  /** Requires all positions assigned per stage and stage sequence, where structure scoring reads it. */
  structures?: { stage?: ScoringStagePolicies };
  processCodes?: { incompleteAssignmentsOnDefault?: string[] };
  allowChangePropagation?: boolean;
  propagateExitStatus?: boolean;
  propagateRetirementAsExit?: boolean;
  rotatingPartners?: RotatingPartnerScoringPolicies;
  policyName?: string;
};

/**
 * The audit policy (`POLICY_TYPE_AUDIT`), keyed by the audit extension it governs (`DRAW_DELETIONS`,
 * `POSITION_ACTIONS`, `TIE_FORMAT_MODIFICATIONS`): `false` suppresses an audit kept by default, `true` enables one kept
 * only on request.
 */
export type AuditPolicy = {
  [auditExtension: string]: boolean | string | undefined;
  policyName?: string;
};

/**
 * The display policy (`POLICY_TYPE_DISPLAY`): storage for client displays (`{ public: {}, admin: {} }`). The factory
 * never reads it; its keys are defined by the client.
 */
export type DisplayPolicy = Record<string, unknown>;

/**
 * The print policy (`POLICY_TYPE_PRINT`), retired: `attachPolicies` refuses it and nothing reads it. Its keys were
 * defined by the printing application.
 */
export type PrintPolicy = Record<string, unknown>;
