import { findExtension } from '@Acquire/findExtension';

// constants and types
import { MISSING_DRAW_DEFINITION, NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';

type GetDraftStateArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
};

export function getDraftState({ drawDefinition }: GetDraftStateArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { extension } = findExtension({ element: drawDefinition, name: DRAFT_STATE });
  if (!extension?.value) return { error: NOT_FOUND, info: 'No draft found' };

  const draftState = extension.value;

  // compute summary stats
  const totalParticipants = draftState.tiers?.reduce(
    (sum: number, tier: any) => sum + (tier.participantIds?.length ?? 0),
    0,
  );
  const preferencesSubmitted = Object.keys(draftState.preferences ?? {}).length;
  const tiersResolved = draftState.tiers?.filter((t: any) => t.resolved).length ?? 0;

  return {
    draftState,
    summary: {
      status: draftState.status,
      totalParticipants,
      preferencesSubmitted,
      preferencesOutstanding: totalParticipants - preferencesSubmitted,
      tiersTotal: draftState.tiers?.length ?? 0,
      tiersResolved,
      unassignedDrawPositions: draftState.unassignedDrawPositions,
      preferencesCount: draftState.preferencesCount,
    },
  };
}
