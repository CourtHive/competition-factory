import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getTournamentRecords } from '@Global/state/globalState';

// constants and types
import type { Tournament } from '@Types/tournamentTypes';

/**
 * A value as an object graph: every value, a key holding undefined, the keys in their order, and WHICH objects are one
 * object (an object met again is named by where it was first met). Two graphs are equal where one write leaves what the
 * other leaves, object for object.
 */
export function objectGraph(root: unknown) {
  const met = new Map<object, number>();
  const visit = (value: unknown): unknown => {
    if (value === undefined) return { undefined: true };
    if (value === null || typeof value !== 'object') return value;
    if (met.has(value)) return { met: met.get(value) };
    met.set(value, met.size);
    return Object.entries(value).map(([key, held]) => [key, visit(held)]);
  };
  return visit(root);
}

export const storedRecord = () => Object.values(getTournamentRecords())[0] as Tournament;

/**
 * the stored record as an object graph, with the cleared fixture's objects (every matchUp cleared with it shares them)
 * and whatever else is given: a call's result, which can hold objects of the record
 */
export const storedGraph = (...besides: unknown[]) =>
  objectGraph([toBePlayed.matchUpStatusCodes, toBePlayed.score, storedRecord(), ...besides]);
