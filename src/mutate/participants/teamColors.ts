import { normalizeTeamPalette } from './normalizeTeamPalette';

// constants and types
import { INVALID_PARTICIPANT_TYPE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { TeamColors } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/participantConstants';
import type { ResultType } from '@Types/factoryTypes';

/** null/omission leaves branding alone; {} clears it; a nonempty object replaces it. */
export function planTeamColors(
  teamColors: unknown,
  participantType: unknown,
): ResultType & {
  teamColors?: TeamColors;
  clear?: boolean;
} {
  if (teamColors === undefined || teamColors === null) return {};
  if (participantType !== TEAM) return { error: INVALID_PARTICIPANT_TYPE };
  if (typeof teamColors !== 'object' || Object.prototype.toString.call(teamColors) !== '[object Object]')
    return { error: INVALID_VALUES };
  const keys = Object.keys(teamColors);
  if (!keys.length) return { clear: true };
  const palette = normalizeTeamPalette(teamColors);
  return palette ? { teamColors: palette } : { error: INVALID_VALUES };
}
