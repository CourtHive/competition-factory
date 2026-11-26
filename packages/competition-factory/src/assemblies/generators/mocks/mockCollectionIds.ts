import { makeDeepCopy } from '@Tools/makeDeepCopy';

/**
 * A profile's tieFormat for a mock record: a copy in which each collection without a `collectionId` gets
 * `<eventId>-COL-<n>`, the id the mocks engine gives its own formats, so a record generated twice is the same record.
 * Outside a mock record, or when every collection has an id, the tieFormat is returned as given and `addEvent` mints
 * any missing ids.
 */
export function withMockCollectionIds<T extends { collectionDefinitions?: { collectionId?: string }[] }>(
  tieFormat: T,
  { eventId, isMock }: { eventId?: string; isMock?: boolean },
): T {
  if (!isMock || !tieFormat?.collectionDefinitions?.some(({ collectionId }) => !collectionId)) return tieFormat;
  const copy = makeDeepCopy(tieFormat, false, true);
  copy.collectionDefinitions?.forEach((collectionDefinition, index) => {
    collectionDefinition.collectionId ||= `${eventId}-COL-${index + 1}`;
  });
  return copy;
}
