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
  const allowed = new Set(['primary', 'secondary']);
  if (keys.some((key) => !allowed.has(key))) return { error: INVALID_VALUES };
  const { primary, secondary } = teamColors as Record<string, unknown>;
  const hex = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  if (!hex(primary) || (secondary !== undefined && !hex(secondary))) return { error: INVALID_VALUES };
  return {
    teamColors: {
      primary: primary.toUpperCase(),
      ...(secondary !== undefined && { secondary: secondary.toUpperCase() }),
    },
  };
}
