// constants, fixtures and types
import { POLICY_TYPE_POSITION_ACTIONS, POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { POLICY_POSITION_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_POSITION_ACTIONS_DEFAULT';
import { POLICY_MATCHUP_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { DrawDefinition, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { HydratedParticipant } from '@Types/hydrated';

export const POSITION_ACTION = 'positionAction';
export const MATCHUP_ACTION = 'matchUpAction';

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
 * What every position and matchUp action carries: its `type`, and for most the `method` to call with
 * `payload` as its params. `willDisableLinks` warns that taking it disables a structure's links.
 */
type ValidActionBase = {
  payload?: { [key: string]: unknown };
  willDisableLinks?: boolean;
  method?: string;
  info?: string;
  type: string;
};

/** A position a SWAP_PARTICIPANTS action can exchange with, and who holds it. */
type SwapAssignment = PositionAssignment & { participant?: HydratedParticipant; sourceDrawPositionRange?: string };

/** An entry of `positionActions`' `validActions`, with the options each action type offers. */
export type PositionAction = ValidActionBase & {
  availableAssignments?: SwapAssignment[];
  availableIndividualParticipants?: HydratedParticipant[];
  existingIndividualParticipants?: HydratedParticipant[];
  availableAlternatesParticipantIds?: string[];
  availableLuckyLoserParticipantIds?: string[];
  availableIndividualParticipantIds?: string[];
  existingIndividualParticipantIds?: string[];
  availableAlternates?: HydratedParticipant[];
  availableLuckyLosers?: HydratedParticipant[];
  qualifyingParticipants?: HydratedParticipant[];
  participantsAvailable?: HydratedParticipant[];
  qualifyingParticipantIds?: string[];
  availableParticipantIds?: string[];
  participant?: HydratedParticipant;
  seedNumber?: number;
};

/** A TEAM collection matchUp offers its available participants per side when no sideNumber is given. */
type SideAvailability<T> = { participants?: T[]; sideNumber: number };

/** An entry of `matchUpActions`' `validActions`, with the options each action type offers. */
export type MatchUpAction = ValidActionBase & {
  availableParticipants?: HydratedParticipant[] | SideAvailability<HydratedParticipant>[];
  availableParticipantIds?: string[] | SideAvailability<string>[];
  participantsAvailable?: HydratedParticipant[];
  swappableParticipants?: HydratedParticipant[];
  existingParticipants?: HydratedParticipant[];
  substitutedParticipantIds?: string[];
  swappableParticipantIds?: string[];
  existingParticipantIds?: string[];
};

type GetEnabledStructuresArgs = {
  appliedPolicies?: PolicyDefinitions;
  drawDefinition: DrawDefinition;
  structure?: Structure;
  actionType?: string;
};
export function getEnabledStructures({
  actionType = POSITION_ACTION,
  appliedPolicies,
  drawDefinition,
  structure,
}: GetEnabledStructuresArgs) {
  const policyType =
    (actionType === POSITION_ACTION && POLICY_TYPE_POSITION_ACTIONS) ||
    (actionType === MATCHUP_ACTION && POLICY_TYPE_MATCHUP_ACTIONS);

  const defaultPolicy =
    (actionType === POSITION_ACTION && POLICY_POSITION_ACTIONS_DEFAULT) ||
    (actionType === MATCHUP_ACTION && POLICY_MATCHUP_ACTIONS_DEFAULT);

  const actionsPolicy = policyType && (appliedPolicies?.[policyType] ?? defaultPolicy?.[policyType]);

  const relevantLinks = drawDefinition.links?.filter((link) => link?.target?.structureId === structure?.structureId);
  const targetFeedProfiles = relevantLinks?.map(({ target }) => target.feedProfile) ?? [];

  const { enabledStructures, disabledStructures } = actionsPolicy ?? {};
  const actionsDisabled = disabledStructures?.find((structurePolicy) => {
    const { stages, stageSequences, structureTypes, feedProfiles } = structurePolicy;
    return (
      (!feedProfiles?.length ||
        (Array.isArray(feedProfiles) &&
          feedProfiles.some((feedProfile) => targetFeedProfiles.includes(feedProfile)))) &&
      (!stages?.length || (Array.isArray(stages) && stages?.includes(structure?.stage))) &&
      (!structureTypes?.length ||
        (Array.isArray(structureTypes) && structureTypes?.includes(structure?.structureType))) &&
      (!stageSequences?.length || (Array.isArray(stageSequences) && stageSequences.includes(structure?.stageSequence)))
    );
  });

  return { enabledStructures, actionsDisabled, actionsPolicy };
}

export function activePositionsCheck({ activePositionOverrides, activeDrawPositions, action }) {
  if (action && activePositionOverrides.includes(action)) return true;
  return !activeDrawPositions.length;
}

export function getPolicyActions({ enabledStructures, drawDefinition, structure }) {
  if (enabledStructures === false) return {};

  if (!enabledStructures?.length) return { policyActions: { enabledActions: [], disabledActions: [] } };

  const { stage, stageSequence, structureType } = structure ?? {};

  const relevantLinks = drawDefinition.links?.filter((link) => link?.target?.structureId === structure?.structureId);
  const targetFeedProfiles = relevantLinks?.map(({ target }) => target.feedProfile) ?? [];

  const policyActions = enabledStructures.find((structurePolicy) => {
    const { stages, stageSequences, structureTypes, feedProfiles } = structurePolicy ?? {};

    const matchesStage = !stages?.length || (Array.isArray(stages) && stages.includes(stage));
    const matchesStageSequence =
      !stageSequences?.length || (Array.isArray(stageSequences) && stageSequences.includes(stageSequence));
    const matchesStructureType =
      !structureTypes?.length || (Array.isArray(structureTypes) && structureTypes.includes(structureType));
    const matchesFeedProfile =
      !feedProfiles?.length ||
      (Array.isArray(feedProfiles) && feedProfiles.some((feedProfile) => targetFeedProfiles.includes(feedProfile)));
    return matchesStageSequence && matchesStructureType && matchesFeedProfile && structurePolicy && matchesStage;
  });

  return { policyActions };
}

export function isAvailableAction({ action, policyActions }) {
  const disabled =
    !policyActions?.enabledActions ||
    (policyActions?.disabledActions?.length && policyActions.disabledActions.includes(action));
  if (disabled) return false;

  const enabled = policyActions?.enabledActions.length === 0 || policyActions?.enabledActions.includes(action);

  return enabled && !disabled;
}
