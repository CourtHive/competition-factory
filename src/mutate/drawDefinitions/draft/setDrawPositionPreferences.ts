import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { DRAFT_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_DRAW_POSITION,
  INVALID_PARTICIPANT_ID,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';
type SetDrawPositionPreferencesArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  participantId: string;
  preferences: number[];
};

export function setDrawPositionPreferences({
  drawDefinition,
  participantId,
  preferences,
}: SetDrawPositionPreferencesArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!participantId) return { error: INVALID_PARTICIPANT_ID };
  if (!Array.isArray(preferences)) return { error: INVALID_VALUES };

  const { extension } = findExtension({ element: drawDefinition, name: DRAFT_STATE });
  if (!extension?.value) return { error: NOT_FOUND, info: 'No active draft found' };

  const draftState = extension.value;

  // verify draft is in a state that accepts preferences
  if (draftState.status === 'COMPLETE') return { error: INVALID_VALUES, info: 'Draft is already complete' };

  // verify participant is in a tier
  const participantTier = draftState.tiers?.find((tier: any) => tier.participantIds?.includes(participantId));
  if (!participantTier) return { error: INVALID_PARTICIPANT_ID, info: 'Participant not in any draft tier' };

  // verify all preferences are valid unassigned draw positions
  const validPositions = new Set(draftState.unassignedDrawPositions);
  for (const pref of preferences) {
    if (!validPositions.has(pref)) {
      return { error: INVALID_DRAW_POSITION, info: `Draw position ${pref} is not available` };
    }
  }

  // enforce max preferences count
  const maxPrefs = draftState.preferencesCount ?? 3;
  const trimmedPreferences = preferences.slice(0, maxPrefs);

  // store preferences
  draftState.preferences[participantId] = trimmedPreferences;

  // update status to COLLECTING_PREFERENCES if still at SEEDS_PLACED
  if (draftState.status === 'SEEDS_PLACED') {
    draftState.status = 'COLLECTING_PREFERENCES';
  }

  addExtension({
    element: drawDefinition,
    extension: { name: DRAFT_STATE, value: draftState },
  });

  return { ...SUCCESS };
}
