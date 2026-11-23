import { definedAttributes } from '@Tools/definedAttributes';
import { extensionsToAttributes } from '@Tools/makeDeepCopy';

export function processEventEntry({
  convertExtensions,
  seedAssignments,
  participant,
  withSeeding,
  seedValue,
  eventId,
  ranking,
  entry,
}) {
  const { entryStatus, entryStage, entryPosition, extensions } = entry;

  const entryExtensions =
    extensions?.length && convertExtensions ? Object.assign({}, ...extensionsToAttributes(extensions ?? [])) : {};

  const attributes = Object.assign(entryExtensions, {
    entryPosition,
    entryStatus,
    entryStage,
    ranking,
    eventId,
  });
  participant.events[eventId] = definedAttributes(attributes, false, false, true);

  if (withSeeding) {
    if (seedAssignments) participant.events[eventId].seedAssignments = seedAssignments;
    if (seedValue) participant.events[eventId].seedValue = seedValue;
  }
}
