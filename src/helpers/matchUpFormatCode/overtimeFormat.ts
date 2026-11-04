import type { SetFormat } from './parse';

/** Grammar only until the overtime reducer/record workstream activates live scoring. */
export type OvertimeFormat = {
  count: number | 'unlimited';
  exactly?: true;
  suddenDeath?: true;
  setFormat: SetFormat;
};

/** The first slash separates the policy from a reusable segment, which can itself contain a slash. */
export function parseOvertimeFormat(
  value: string,
  parseSegment: (value: string) => SetFormat | false | undefined,
): OvertimeFormat | undefined {
  const match = /^([1-9]\d*|U)(X)?(SD)?\/(.+)$/.exec(value);
  if (!match) return undefined;
  const count = match[1] === 'U' ? 'unlimited' : Number(match[1]);
  const setFormat = parseSegment(match[4]);
  const overtime: OvertimeFormat | undefined = setFormat
    ? {
        count,
        ...(match[2] ? { exactly: true as const } : {}),
        ...(match[3] ? { suddenDeath: true as const } : {}),
        setFormat,
      }
    : undefined;
  return overtime && isOvertimeFormat(overtime) ? overtime : undefined;
}

export function isOvertimeFormat(value: OvertimeFormat): boolean {
  if (!value || typeof value !== 'object') return false;
  if (value.count !== 'unlimited' && (!Number.isSafeInteger(value.count) || value.count < 1)) return false;
  if (value.exactly !== undefined && value.exactly !== true) return false;
  if (value.suddenDeath !== undefined && value.suddenDeath !== true) return false;
  if (value.exactly && (value.count === 'unlimited' || value.suddenDeath)) return false;
  return !!value.setFormat && value.setFormat.combinedPointTotal === undefined;
}

export function stringifyOvertimeFormat(
  value: OvertimeFormat,
  stringifySegment: (segment: SetFormat) => string | false | undefined,
): string | undefined {
  if (!isOvertimeFormat(value)) return undefined;
  const segment = stringifySegment(value.setFormat);
  if (!segment) return undefined;
  const count = value.count === 'unlimited' ? 'U' : value.count;
  return `${count}${value.exactly ? 'X' : ''}${value.suddenDeath ? 'SD' : ''}/${segment}`;
}
