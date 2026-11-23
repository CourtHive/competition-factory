export function getObjectTieFormat(obj) {
  if (!obj) return;
  const { tieFormatId, tieFormats } = obj;
  if (obj.tieFormat) {
    return obj.tieFormat;
  } else if (tieFormatId && Array.isArray(tieFormats)) {
    return tieFormats.find((tf) => tf.tieFormatId === tieFormatId);
  }
}
