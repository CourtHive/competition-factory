import { DrawDefinition, Structure, Event } from '@Types/tournamentTypes';
import { getObjectTieFormat } from './getObjectTieFormat';
import { getItemTieFormat } from './getItemTieFormat';

// use with resolved objects, not uuid references to objects

type ResolveTieFormatArgs = {
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  matchUp?: object;
  event?: Event;
};

export function resolveTieFormat({ drawDefinition, structure, matchUp, event }: ResolveTieFormatArgs) {
  return {
    tieFormat:
      getItemTieFormat({
        item: matchUp,
        drawDefinition,
        structure,
        event,
      }) ||
      getItemTieFormat({
        item: structure,
        drawDefinition,
        structure,
        event,
      }) ||
      getObjectTieFormat(drawDefinition) ||
      getObjectTieFormat(event),
  };
}
