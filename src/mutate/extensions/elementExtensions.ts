import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { removeExtension } from './removeExtension';
import { addExtension } from './addExtension';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { TournamentRecords } from '@Types/factoryTypes';

type DrawOwner = { tournamentRecord: Tournament; drawDefinition: DrawDefinition; event: Event };

type ElementParams = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  element?: object;
};

/**
 * Finds the loaded drawDefinition that IS `element` — by identity, because the engine methods take
 * the element itself rather than an id. A copy (what `getEvent` hands out) matches nothing, which is
 * right: writing to a copy changes no record and has nothing to announce.
 */
function findDrawOwner(params?: ElementParams): DrawOwner | undefined {
  const element = params?.element;
  if (!element || typeof element !== 'object') return undefined;
  const records: Tournament[] = params?.tournamentRecords
    ? Object.values(params.tournamentRecords)
    : [params?.tournamentRecord].filter((record): record is Tournament => !!record);
  for (const tournamentRecord of records) {
    for (const event of tournamentRecord?.events ?? []) {
      const drawDefinition = event.drawDefinitions?.find((candidate) => candidate === element);
      if (drawDefinition) return { tournamentRecord, drawDefinition, event };
    }
  }
  return undefined;
}

function withDrawNotice<T extends { error?: unknown }>(params: ElementParams | undefined, write: () => T): T {
  const owner = findDrawOwner(params);
  const before = owner && attributesSnapshot(owner.drawDefinition, []);
  const result = write();
  if (owner && before !== undefined && !result?.error) {
    announceDrawChange({ ...owner, attributes: [], before });
  }
  return result;
}

/**
 * The engine's `addExtension`: `addExtension`, plus a MODIFY_DRAW_DEFINITION when the element is a
 * drawDefinition in a loaded record and the write changed it. Internal callers use `addExtension`
 * directly and announce in their own terms.
 *
 * Only a drawDefinition element is announced here; any other element is written as before.
 */
export function addElementExtension(params?: Parameters<typeof addExtension>[0]): ReturnType<typeof addExtension> {
  return withDrawNotice(params, () => addExtension(params));
}

/** The engine's `removeExtension`, announced as `addElementExtension` is. */
export function removeElementExtension(
  params?: Parameters<typeof removeExtension>[0],
): ReturnType<typeof removeExtension> {
  return withDrawNotice(params, () => removeExtension(params));
}
