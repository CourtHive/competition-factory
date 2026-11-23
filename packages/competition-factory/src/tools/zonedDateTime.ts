/**
 * `zonedDateTime` — a calendar day and a wall clock resolved against a zone.
 *
 * The intent this module owns is "which actual moment": a `plainDate` plus a
 * `plainTime` plus a frame that says how to read them. It is the only module in
 * the calendar-intent set that resolves an offset, and it is the single
 * implementation of that arithmetic — `@Tools/timeZone` is a thin public adapter
 * over these functions and holds no conversion logic of its own.
 *
 * ## Why a zone and not an offset
 *
 * A single `utcOffsetMinutes` is the offset at *one* moment. Applied to a
 * tournament that spans a DST change it is wrong by an hour on the far side of
 * the change — in the US that is the March and November weekends, which do host
 * competition. The error is silent: times simply read an hour off, and a
 * recovery figure derived from them is wrong by 60 minutes in a report whose
 * whole purpose is to measure recovery in minutes.
 *
 * An IANA zone identifier (`America/New_York`) resolves the offset **per
 * instant** instead, so both sides of the change convert correctly. `Intl` is
 * built into Node and every browser, so this adds no dependency and keeps the
 * factory pure.
 *
 * ## The frame, and why the caller is told which one it got
 *
 * Three inputs, three answers — never a substituted number:
 *
 * | `timeZone` | result | `source` |
 * |---|---|---|
 * | absent | the caller's `utcOffsetMinutes` (default 0) | `'offset'` |
 * | present, unrecognised | **`null`** — refused | — |
 * | present, recognised | resolved per instant | `'zone'` |
 *
 * A caller that supplies no zone has declared its own frame, and that is
 * legitimate — most tournaments carry no zone. A caller that supplies a zone the
 * system cannot honour has made a config error, and substituting a different
 * frame turns a 90-minute recovery into a 330-minute one that still reads as
 * measured. `source` exists so the difference is visible in the return value
 * rather than in a log nobody reads.
 */

const MS_PER_MINUTE = 60_000;

/**
 * `Intl.DateTimeFormat` construction is expensive relative to formatting, and a
 * timeline resolves thousands of instants against a handful of zones.
 *
 * Deliberate module-level state. It is safe under `asyncEngine`'s per-request
 * isolation because the entries are pure derived data keyed by zone identifier:
 * no request state, no mutation after insert. It is bounded by the IANA zone set
 * (~420 entries) because a zone that fails to construct is never written — the
 * catch below returns without a `set`, so unrecognised input cannot grow it.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | undefined {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      second: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hourCycle: 'h23',
      timeZone,
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    // An unrecognised zone must not throw. It is refused by the callers below
    // rather than silently replaced, so the failure reaches the caller as a
    // value instead of disappearing here.
    return undefined;
  }
}

/** Which frame a conversion actually used. Never inferred by the caller. */
export type FrameSource = 'zone' | 'offset';

export type Frame = {
  /** Fixed offset, used only when no `timeZone` is supplied. */
  utcOffsetMinutes?: number;
  /** IANA zone identifier; when supplied it wins over `utcOffsetMinutes`. */
  timeZone?: string;
};

/** Whether `Intl` recognises this zone identifier. Cached, so repeat checks are free. */
export function isZone(timeZone?: string): boolean {
  return typeof timeZone === 'string' && timeZone !== '' && formatterFor(timeZone) !== undefined;
}

/**
 * The zone's offset from UTC, in minutes, **at a specific instant**
 * (local = UTC + offset). `undefined` when no zone is given, the zone is not
 * recognised, or the instant is not finite — never a substituted `0`.
 */
export function offsetMinutesAt(ms: number, timeZone?: string): number | undefined {
  if (!timeZone) return undefined;
  if (!Number.isFinite(ms)) return undefined;
  const formatter = formatterFor(timeZone);
  if (!formatter) return undefined;

  const parts: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(new Date(ms))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  if (!Number.isFinite(parts.year)) return undefined;

  // Read the zone's wall clock back as though it were UTC; the difference from
  // the true instant is the offset.
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const minutes = Math.round((asIfUtc - ms) / MS_PER_MINUTE);
  // `formatToParts` resolves to the second, so a zone at offset 0 yields a small
  // negative difference and `Math.round` hands back `-0`. That is equal to 0 by
  // `===` but not by `Object.is`, so it fails a `toBe(0)` and any Map/Set keyed
  // on the offset. Normalise it away at the source rather than at each caller.
  return minutes === 0 ? 0 : minutes;
}

/** Resolve which frame applies at `ms`. `null` means a zone was given and refused. */
function frameAt(
  ms: number,
  { timeZone, utcOffsetMinutes = 0 }: Frame,
): { offset: number; source: FrameSource } | null {
  if (!timeZone) return { offset: utcOffsetMinutes, source: 'offset' };
  const offset = offsetMinutesAt(ms, timeZone);
  if (offset === undefined) return null;
  return { offset, source: 'zone' };
}

/** `YYYY-MM-DD` (padding optional) → UTC ms at midnight. `null` when out of range or malformed. */
function civilDateToMs(date: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC rolls a day past a month's end forward; reject rather than accept a
  // different day than the caller wrote.
  return new Date(ms).getUTCDate() === day ? ms : null;
}

/**
 * Venue-local `YYYY-MM-DD` + `HH:MM` → UTC ms.
 *
 * Converting local → UTC is circular: the offset depends on the instant, and the
 * instant is what we are solving for. Resolved by interpreting the wall clock as
 * UTC, taking the offset at that approximate instant, then re-reading the offset
 * at the corrected one — which settles everywhere except inside the one
 * ambiguous hour a fall-back transition repeats, where either reading is
 * defensible and both are within an hour of the truth.
 *
 * This two-pass block is a native-`Date` workaround, not behaviour to preserve:
 * `Temporal.PlainDateTime.from(…).toZonedDateTime(tz, { disambiguation })` does
 * it in one step and turns the ambiguous hour into an explicit choice.
 *
 * `null` when the date or time is malformed, or when a supplied zone is not
 * recognised.
 */
export function zonedWallClockToMs(args: Frame & { date?: string; time?: string }): {
  ms: number;
  source: FrameSource;
} | null {
  const { date, time } = args;
  if (!date || !time) return null;

  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!timeMatch) return null;
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hours > 23 || minutes > 59) return null;

  const base = civilDateToMs(date);
  if (base === null) return null;

  const naive = base + (hours * 60 + minutes) * MS_PER_MINUTE;

  const frame = frameAt(naive, args);
  if (!frame) return null;
  if (frame.source === 'offset') return { ms: naive - frame.offset * MS_PER_MINUTE, source: 'offset' };

  const approximate = naive - frame.offset * MS_PER_MINUTE;
  const settled = offsetMinutesAt(approximate, args.timeZone) ?? frame.offset;
  return { ms: naive - settled * MS_PER_MINUTE, source: 'zone' };
}

/**
 * UTC ms → venue-local calendar date + wall clock, per-instant when a zone is
 * supplied. `null` when the instant is not finite, or a supplied zone is not
 * recognised.
 */
export function zonedParts(args: Frame & { ms: number }): { date: string; time: string; source: FrameSource } | null {
  const { ms } = args;
  if (!Number.isFinite(ms)) return null;

  const frame = frameAt(ms, args);
  if (!frame) return null;

  const shifted = new Date(ms + frame.offset * MS_PER_MINUTE);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    source: frame.source,
  };
}

export const zonedDateTime = {
  zonedWallClockToMs,
  offsetMinutesAt,
  zonedParts,
  isZone,
};
