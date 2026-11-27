import { structuresOf, matchUpsOf } from '@Helpers/drawTopology/structureMembers';

// constants and types
import { INVALID_EVENT_TYPE, INVALID_TIE_FORMAT, type ErrorType } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, MatchUp, Structure } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';

/**
 * A tieFormat describes the lines of a TEAM tie. It belongs only to a TEAM event and its TEAM draws, structures and
 * matchUps. Supplied for anything else (a SINGLES, DOUBLES or HYBRID event, or a draw whose matchUpType is not TEAM),
 * it is refused rather than stored, ignored, or allowed to outrank the event's own matchUpFormat and type.
 */

type TieFormatInputs = {
  tieFormats?: unknown[];
  tieFormatName?: unknown;
  tieFormatId?: unknown;
  tieFormat?: unknown;
};

export type TieFormatRefusal = { error: ErrorType; info: string; context: { [key: string]: unknown } };

const NOT_TEAM_INFO = 'a tieFormat applies only to a TEAM event';

const isNonTeam = (type: unknown) => type !== undefined && type !== null && type !== TEAM;

function typesContext(eventType: unknown, matchUpType: unknown): { [key: string]: unknown } {
  const context: { [key: string]: unknown } = {};
  if (eventType !== undefined) context.eventType = eventType;
  if (matchUpType !== undefined) context.matchUpType = matchUpType;
  return context;
}

/** Which of the tieFormat inputs were supplied: a tieFormat, a tieFormatName, a tieFormatId or a non-empty tieFormats. */
export function suppliedTieFormatInputs(inputs: TieFormatInputs): string[] {
  const supplied: string[] = [];
  if (inputs.tieFormat) supplied.push('tieFormat');
  if (inputs.tieFormatName) supplied.push('tieFormatName');
  if (inputs.tieFormatId) supplied.push('tieFormatId');
  if (Array.isArray(inputs.tieFormats) && inputs.tieFormats.length) supplied.push('tieFormats');
  return supplied;
}

/**
 * The refusal for tieFormat inputs supplied where the event type or matchUpType is not TEAM, or undefined when nothing
 * was supplied or the target is TEAM. An undefined type is not judged here: the caller resolves it first. `inputs` is
 * read, never copied, so a caller passes its own event, params or profile object.
 */
export function nonTeamTieFormatRefusal(
  inputs: TieFormatInputs,
  eventType?: unknown,
  matchUpType?: unknown,
): TieFormatRefusal | undefined {
  if (!isNonTeam(eventType) && !isNonTeam(matchUpType)) return undefined;
  const supplied = suppliedTieFormatInputs(inputs);
  if (!supplied.length) return undefined;
  return {
    error: INVALID_TIE_FORMAT,
    info: NOT_TEAM_INFO,
    context: { ...typesContext(eventType, matchUpType), supplied },
  };
}

function structureHoldsTieFormat(structure: Structure): boolean {
  if (structure.tieFormat || structure.tieFormatId) return true;
  // tieMatchUps are generated from a tieFormat, wherever in the hierarchy it is held
  const tieBearing = (matchUp: MatchUp) =>
    Boolean(matchUp.tieFormat ?? matchUp.tieFormatId) || !!matchUp.tieMatchUps?.length;
  if ((matchUpsOf(structure) ?? []).some(tieBearing)) return true;
  return (structuresOf(structure) ?? []).some(structureHoldsTieFormat);
}

/** Whether a draw carries a tieFormat anywhere (the draw, a structure, nested included, or a matchUp), or tieMatchUps. */
export function drawHoldsTieFormat(drawDefinition?: DrawDefinition): boolean {
  if (!drawDefinition) return false;
  if (drawDefinition.tieFormat || drawDefinition.tieFormatId) return true;
  return (drawDefinition.structures ?? []).some(structureHoldsTieFormat);
}

/** Whether an event carries a tieFormat anywhere: on itself, in its `tieFormats`, or in any of its draws. */
export function eventHoldsTieFormat(event?: Event): boolean {
  if (!event) return false;
  if (event.tieFormat || event.tieFormatId || event.tieFormats?.length) return true;
  return (event.drawDefinitions ?? []).some(drawHoldsTieFormat);
}

/** The refusal for a draw that carries a tieFormat being added to an event that is not TEAM. */
export function nonTeamDrawTieFormatRefusal({
  drawDefinition,
  event,
}: {
  drawDefinition?: DrawDefinition;
  event?: Event;
}): TieFormatRefusal | undefined {
  const eventType = event?.eventType;
  const matchUpType = drawDefinition?.matchUpType;
  if (!isNonTeam(eventType) && !isNonTeam(matchUpType)) return undefined;
  if (!drawHoldsTieFormat(drawDefinition)) return undefined;
  return { error: INVALID_TIE_FORMAT, info: NOT_TEAM_INFO, context: typesContext(eventType, matchUpType) };
}

/** The refusal for changing a TEAM event that holds a tieFormat to a type that is not TEAM. */
export function eventTypeChangeTieFormatRefusal({
  eventType,
  event,
}: {
  eventType?: unknown;
  event?: Event;
}): TieFormatRefusal | undefined {
  if (!isNonTeam(eventType) || !eventHoldsTieFormat(event)) return undefined;
  return {
    error: INVALID_EVENT_TYPE,
    info: 'an event that holds a tieFormat stays TEAM',
    context: { eventType, currentEventType: event?.eventType },
  };
}

/**
 * The refusal for a tieFormat edit whose target is not TEAM (an event that is not TEAM, or a draw whose matchUpType is
 * not TEAM) and still holds a tieFormat, which only a record written before 8.0.0 can. A target that holds none is left
 * to the edit's own MISSING_TIE_FORMAT.
 */
export function nonTeamTieFormatTargetRefusal({
  drawDefinition,
  event,
}: {
  drawDefinition?: DrawDefinition;
  event?: Event;
}): TieFormatRefusal | undefined {
  const eventType = event?.eventType;
  const matchUpType = drawDefinition?.matchUpType;
  if (!isNonTeam(eventType) && !isNonTeam(matchUpType)) return undefined;
  if (!eventHoldsTieFormat(event) && !drawHoldsTieFormat(drawDefinition)) return undefined;
  return { error: INVALID_TIE_FORMAT, info: NOT_TEAM_INFO, context: typesContext(eventType, matchUpType) };
}
