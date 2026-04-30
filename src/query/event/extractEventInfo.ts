export function extractEventInfo({ event }) {
  const {
    surfaceCategory,
    onlineResources,
    matchUpFormat,
    discipline,
    eventLevel,
    eventName,
    eventType,
    startDate,
    category,
    ballType,
    eventId,
    endDate,
    gender,
    notes,
  } = event;

  const entriesCount = event.entries?.length ?? 0;

  const eventInfo = {
    drawDefinitionCount: event.drawDefinitions?.length,
    entriesCount,
    surfaceCategory,
    onlineResources,
    matchUpFormat,
    discipline,
    eventLevel,
    eventName,
    eventType,
    ballType,
    startDate,
    category,
    endDate,
    eventId,
    gender,
    notes,
  };

  return { eventInfo };
}
