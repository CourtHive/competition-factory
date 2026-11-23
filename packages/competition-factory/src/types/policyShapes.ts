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
