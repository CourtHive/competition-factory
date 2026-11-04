import { findPolicy } from '@Acquire/findPolicy';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 * A scheduling period's minutes, when stated: a round's own `periodLength`, or a scheduling policy's
 * `defaultPeriodLength`. Anything that is not a positive finite number is not a statement, and is ignored rather than
 * refused: the scheduler falls through to the next source (scheduling-pipeline.md § 1).
 */
export function statedPeriodLength(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

type DrawPeriodLengthArgs = {
  tournamentRecord?: Tournament;
  drawId?: string;
};

/** the scheduling policy's `defaultPeriodLength` for a draw: the draw's policy, else its event's, else the tournament's */
export function drawDefaultPeriodLength({ tournamentRecord, drawId }: DrawPeriodLengthArgs): number | undefined {
  if (!tournamentRecord) return undefined;
  const { event, drawDefinition } = drawId ? findEvent({ tournamentRecord, drawId }) : {};
  const { policy } = findPolicy({ policyType: POLICY_TYPE_SCHEDULING, tournamentRecord, drawDefinition, event });
  return statedPeriodLength(policy?.defaultPeriodLength);
}

/**
 * A resolver of draws' default periods that reads each draw once: the planners ask it per round or per matchUp, and
 * many share a draw.
 */
export function drawDefaultPeriodLengthResolver(tournamentRecords: { [tournamentId: string]: Tournament }) {
  const resolved = new Map<string, number | undefined>();
  return ({ tournamentId, drawId }: { tournamentId?: string; drawId?: string }) => {
    const key = `${tournamentId}|${drawId}`;
    if (!resolved.has(key)) {
      const tournamentRecord = tournamentId ? tournamentRecords[tournamentId] : undefined;
      resolved.set(key, drawDefaultPeriodLength({ tournamentRecord, drawId }));
    }
    return resolved.get(key);
  };
}

/**
 * The tournaments' default period, for a scheduler that knows no draw: the smallest `defaultPeriodLength` any record's
 * own scheduling policy states (a finer grid never denies a format the periods it needs), or none.
 */
export function recordsDefaultPeriodLength(tournamentRecords?: { [tournamentId: string]: Tournament }) {
  const stated = Object.values(tournamentRecords ?? {})
    .map((tournamentRecord) => drawDefaultPeriodLength({ tournamentRecord }))
    .filter((minutes): minutes is number => minutes !== undefined);
  return stated.length ? Math.min(...stated) : undefined;
}
