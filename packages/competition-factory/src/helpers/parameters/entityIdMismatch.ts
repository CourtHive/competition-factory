import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

// the params an entity is resolved from: by id, or as an object carrying its own id
export type EntityParams = {
  [key: string]: unknown;
  tournamentRecord?: { tournamentId?: string };
  drawDefinition?: { drawId?: string };
  event?: { eventId?: string };
  matchUp?: { drawId?: string };
  tournamentId?: string;
  drawId?: string;
  eventId?: string;
};

// each entity a call may be given as an object, and the param that names it by id
const ENTITIES: ['tournamentRecord' | 'drawDefinition' | 'event', 'tournamentId' | 'drawId' | 'eventId'][] = [
  ['tournamentRecord', 'tournamentId'],
  ['drawDefinition', 'drawId'],
  ['event', 'eventId'],
];

/**
 * An entity given both as an object and by its id must be one entity (CA 2026-10-30): a call given an event whose own
 * eventId is not the eventId it is also given is refused, with the engine or without it, rather than writing to one
 * and reporting the other.
 */
export function entityIdMismatch(params?: EntityParams): ResultType | undefined {
  if (!params || typeof params !== 'object') return undefined;
  for (const [entity, idParam] of ENTITIES) {
    const ownId = (params[entity] as { [id: string]: unknown } | undefined)?.[idParam];
    const given = params[idParam];
    if (ownId && given && ownId !== given)
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: `${idParam} ${given} does not match ${entity}.${idParam} ${ownId}`,
        stack: 'entityIdMismatch',
      });
  }
  return undefined;
}
