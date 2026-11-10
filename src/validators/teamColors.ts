// constants and types
import type { TeamPresentation, TeamPaletteColor, TeamColorRole, TeamColors } from '@Types/tournamentTypes';

export const TEAM_COLOR_ROLES = new Set<TeamColorRole>([
  'team.surface',
  'team.text',
  'team.accent',
  'score.surface',
  'score.text',
]);

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

/** Validate the portable palette independently of any renderer or tournament. */
export function normalizeTeamPalette(value: unknown): TeamColors | undefined {
  if (!object(value) || !only(value, ['palette', 'display']) || !Array.isArray(value.palette)) return undefined;
  if (!value.palette.length) return undefined;
  const ids = new Set<string>();
  const palette: TeamPaletteColor[] = [];
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
  if (value.display === undefined) return { palette };
  if (!object(value.display) || !only(value.display, ['roles']) || !object(value.display.roles)) return undefined;
  const roles: Partial<Record<TeamColorRole, string>> = {};
  for (const [role, reference] of Object.entries(value.display.roles)) {
    if (!TEAM_COLOR_ROLES.has(role as TeamColorRole) || !colorId(reference) || !ids.has(reference)) return undefined;
    roles[role as TeamColorRole] = reference;
  }
  return { palette, display: { roles } };
}

/**
 * Read sparse tournament settings without coupling them to a particular TEAM palette. Invalid entries are
 * dropped individually (an empty team exception inherits) and described in `issues`; writers reject any issue.
 */
export function normalizeTeamPresentation(value: unknown, issues: string[] = []): TeamPresentation | undefined {
  if (!object(value)) {
    issues.push('teamPresentation must be an object');
    return undefined;
  }
  for (const key of Object.keys(value)) if (key !== 'roles' && key !== 'teams') issues.push(`unknown field ${key}`);
  const read = (input: unknown, references: boolean, path: string) => {
    const roles: Partial<Record<TeamColorRole, string | { theme: true }>> = {};
    if (input === undefined) return roles;
    if (!object(input)) {
      issues.push(`${path} must be an object`);
      return roles;
    }
    for (const [role, color] of Object.entries(input)) {
      if (!TEAM_COLOR_ROLES.has(role as TeamColorRole)) issues.push(`${path}: unknown role ${role}`);
      else if (object(color) && only(color, ['theme']) && color.theme === true) {
        roles[role as TeamColorRole] = { theme: true };
      } else if (hex(color)) roles[role as TeamColorRole] = color.toUpperCase();
      else if (references && colorId(color)) roles[role as TeamColorRole] = color;
      else issues.push(`${path}: invalid ${role}`);
    }
    return roles;
  };
  const result: TeamPresentation = {};
  if (value.roles !== undefined) result.roles = read(value.roles, false, 'roles');
  if (value.teams !== undefined) {
    if (object(value.teams)) {
      result.teams = {};
      for (const [id, team] of Object.entries(value.teams)) {
        if (!id || id.length > 200 || !object(team) || !only(team, ['roles'])) {
          issues.push(`invalid team exception ${id.slice(0, 200)}`);
          continue;
        }
        Object.defineProperty(result.teams, id, {
          value: { roles: read(team.roles, true, `teams.${id}`) },
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    } else issues.push('teams must be an object');
  }
  return result;
}
