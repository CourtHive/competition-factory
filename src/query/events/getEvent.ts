import { requireParams } from '@Helpers/parameters/requireParams';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';

type GetEventArgs = {
  context: { [key: string]: any };
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  event: Event;
};

export function getEvent({ tournamentRecord, drawDefinition, context, event }: GetEventArgs) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const eventCopy = makeDeepCopy(event);
  if (context) Object.assign(eventCopy, context);

  const drawDefinitionCopy =
    drawDefinition && eventCopy.drawDefinitions?.find(({ drawId }) => drawDefinition.drawId === drawId);

  return definedAttributes({
    drawDefinition: drawDefinitionCopy,
    event: eventCopy,
  });
}
