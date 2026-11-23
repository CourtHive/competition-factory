export function getItemTieFormat({ item, drawDefinition, structure, event }) {
  if (!item) return;
  if (item.tieFormat) return item.tieFormat;

  // if there is a tieFormatId, only possible to look for referenced tieFormat in tieFormats on drawDefinition and event
  //
  // `drawDefinition` and `event` are OPTIONAL on `resolveTieFormat`, so they must
  // be treated as such here. They were dereferenced unguarded, which only ever
  // mattered after `aggregateTieFormats()` — before aggregation an item carries an
  // inline `tieFormat` and returns above, so this branch is never reached. Any
  // caller that hydrated without threading `event` therefore worked fine until a
  // tournament was aggregated and then threw
  // `Cannot read properties of undefined (reading 'tieFormat')`.
  // the referenced tieFormat first, the draw's then the event's own after it (CA 2026-10-26, hydration OPEN-4: the
  // draw's inline tieFormat was returned before the reference was looked up)
  if (item.tieFormatId) {
    const referenced =
      drawDefinition?.tieFormats?.find((tf) => item.tieFormatId === tf.tieFormatId) ??
      event?.tieFormats?.find((tf) => item.tieFormatId === tf.tieFormatId);
    return referenced ?? drawDefinition?.tieFormat ?? event?.tieFormat;
  }
  if (structure?.tieFormat) return structure.tieFormat;
  if (structure?.tieFormatId) {
    const structureTieFormat = drawDefinition.tieFormats?.find((tf) => structure.tieFormatId === tf.tieFormatId);
    if (structureTieFormat) return structureTieFormat;
  }
}
