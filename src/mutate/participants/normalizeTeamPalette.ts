// constants and types
import type { TeamColors } from '@Types/tournamentTypes';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]';
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const colorId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value);
const only = (value: Record<string, unknown>, keys: string[]) => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};
const label = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim().length > 0 && value.length <= 100);

/** Validate and normalize the CODES TEAM palette; display colors are ID references. */
export function normalizeTeamPalette(value: unknown): TeamColors | undefined {
  if (!object(value)) return undefined;
  if (!only(value, ['palette', 'display']) || !Array.isArray(value.palette)) return undefined;
  if (!value.palette.length || value.palette.length > 32) return undefined;
  if (!object(value.display) || !only(value.display, ['primary', 'secondary'])) return undefined;
  const ids = new Set<string>();
  const palette: TeamColors['palette'] = [];
  for (const entry of value.palette) {
    if (!object(entry) || !only(entry, ['colorId', 'value', 'name', 'group'])) return undefined;
    if (!colorId(entry.colorId) || ids.has(entry.colorId) || !hex(entry.value)) return undefined;
    if (!label(entry.name) || !label(entry.group)) return undefined;
    ids.add(entry.colorId);
    palette.push({
      colorId: entry.colorId,
      value: entry.value.toUpperCase(),
      ...(typeof entry.name === 'string' && { name: entry.name.trim() }),
      ...(typeof entry.group === 'string' && { group: entry.group.trim() }),
    });
  }
  const { primary, secondary } = value.display;
  if (!colorId(primary) || !ids.has(primary)) return undefined;
  if (secondary !== undefined && (!colorId(secondary) || !ids.has(secondary))) return undefined;
  return { palette, display: { primary, ...(typeof secondary === 'string' && { secondary }) } };
}
