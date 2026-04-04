// constants, fixtures and types
import { POLICY_POSITION_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_POSITION_ACTIONS_DEFAULT';
import { POLICY_MATCHUP_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { POLICY_TYPE_POSITION_ACTIONS, POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { PolicyDefinitions } from '@Types/factoryTypes';

export const POSITION_ACTION = 'positionAction';
export const MATCHUP_ACTION = 'matchUpAction';

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

  const actionsPolicy = policyType && (appliedPolicies?.[policyType] || defaultPolicy?.[policyType]);

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
