import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { modifyVenueNotice } from '@Mutate/venues/venueNotices';
import { removeExtension } from './removeExtension';
import { addExtension } from './addExtension';

// types
import type { TournamentRecords } from '@Types/factoryTypes';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';

type ElementParams = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  element?: object;
};

/** How to announce a stored element whose extensions a write changed. */
type Owner = { element: { extensions?: unknown[] }; announce: () => void };

/**
 * Finds the stored element that IS `element`: the tournament record itself, one of its events,
 * drawDefinitions (and their structures and matchUps), venues or participants. By identity, because the engine methods take the element
 * itself rather than an id. A copy (what `getEvent` or `getParticipants` hands out) matches nothing,
 * which is right: writing to a copy changes no record and has nothing to announce.
 */
function findOwner(params?: ElementParams): Owner | undefined {
  const element = params?.element;
  if (!element || typeof element !== 'object') return undefined;
  const records: Tournament[] = params?.tournamentRecords
    ? Object.values(params.tournamentRecords)
    : [params?.tournamentRecord].filter((record): record is Tournament => !!record);
  for (const tournamentRecord of records) {
    const owner = findInRecord(tournamentRecord, element);
    if (owner) return owner;
  }
  return undefined;
}

function findInRecord(tournamentRecord: Tournament, element: object): Owner | undefined {
  const tournamentId = tournamentRecord?.tournamentId;
  if (element === tournamentRecord) {
    const announce = () =>
      modifyTournamentDetailNotice({ tournamentRecord, detail: { extensions: tournamentRecord.extensions ?? [] } });
    return { element: tournamentRecord, announce };
  }
  for (const event of tournamentRecord?.events ?? []) {
    if (event === element) return { element: event, announce: () => modifyEventNotice({ tournamentId, event }) };
    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (drawDefinition === element) {
        const announce = () => modifyDrawNotice({ tournamentId, eventId: event.eventId, drawDefinition });
        return { element: drawDefinition, announce };
      }
      const owner = findInDraw({ tournamentId, eventId: event.eventId, drawDefinition, element });
      if (owner) return owner;
    }
  }
  const venue = tournamentRecord?.venues?.find((candidate) => candidate === element);
  if (venue) return { element: venue, announce: () => modifyVenueNotice({ tournamentId, venue }) };
  const participant = tournamentRecord?.participants?.find((candidate) => candidate === element);
  if (participant) {
    return {
      element: participant,
      announce: () => modifyParticipantsNotice({ tournamentId, participants: [participant] }),
    };
  }
  return undefined;
}

type DrawScope = { tournamentId?: string; eventId?: string; drawDefinition: DrawDefinition; element: object };

/** A structure (a round robin group included) or a matchUp (a TEAM matchUp's tieMatchUps included) of a stored draw. */
function findInDraw({ tournamentId, eventId, drawDefinition, element }: DrawScope): Owner | undefined {
  const structures = (drawDefinition.structures ?? []).flatMap((structure) => [
    structure,
    ...(structuresOf(structure) ?? []),
  ]);
  for (const structure of structures) {
    const { structureId } = structure;
    if (structure === element) {
      const announce = () => modifyDrawNotice({ tournamentId, eventId, drawDefinition, structureIds: [structureId] });
      return { element: structure, announce };
    }
    const matchUps = (matchUpsOf(structure) ?? []).flatMap((matchUp) => [matchUp, ...(matchUp.tieMatchUps ?? [])]);
    const matchUp = matchUps.find((candidate) => candidate === element);
    if (matchUp) {
      const announce = () =>
        modifyMatchUpNotice({ context: 'addExtension', tournamentId, eventId, drawDefinition, structureId, matchUp });
      return { element: matchUp, announce };
    }
  }
  return undefined;
}

const extensionsKey = (owner: Owner) => JSON.stringify(owner.element.extensions ?? []);

function withElementNotice<T extends { error?: unknown }>(params: ElementParams | undefined, write: () => T): T {
  const owner = findOwner(params);
  const before = owner && extensionsKey(owner);
  const result = write();
  if (owner && !result?.error && extensionsKey(owner) !== before) owner.announce();
  return result;
}

/**
 * The engine's `addExtension`: `addExtension`, plus the notice for the element when it is stored in a
 * loaded record and the write changed its extensions: MODIFY_TOURNAMENT_DETAIL for the record itself,
 * MODIFY_EVENT, MODIFY_DRAW_DEFINITION (a structure too, named in `structureIds`), MODIFY_MATCHUP, MODIFY_VENUE or
 * MODIFY_PARTICIPANTS (CA 2026-10-18: a stored matchUp or structure is announced). Internal callers use
 * `addExtension` directly and announce in their own terms.
 *
 * Any other element (a copy, an object in no loaded record) is written as before, with no notice.
 */
export function addElementExtension(params?: Parameters<typeof addExtension>[0]): ReturnType<typeof addExtension> {
  return withElementNotice(params, () => addExtension(params));
}

/** The engine's `removeExtension`, announced as `addElementExtension` is. */
export function removeElementExtension(
  params?: Parameters<typeof removeExtension>[0],
): ReturnType<typeof removeExtension> {
  return withElementNotice(params, () => removeExtension(params));
}
