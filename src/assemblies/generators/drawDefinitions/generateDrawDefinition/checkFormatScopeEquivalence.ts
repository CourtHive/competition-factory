import { setMatchUpMatchUpFormat } from '@Mutate/matchUps/matchUpFormat/setMatchUpMatchUpFormat';
import { checkTieFormat } from '@Mutate/tieFormat/checkTieFormat';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

export function checkFormatScopeEquivalence({
  existingQualifyingStructures,
  tournamentRecord,
  drawDefinition,
  matchUpFormat,
  matchUpType,
  tieFormat,
  event,
}) {
  // if there is a defined matchUpFormat/tieFormat only attach to drawDefinition...
  // ...when there is not an equivalent definition on the parent event
  if (matchUpFormat || tieFormat) {
    const equivalentInScope =
      (matchUpFormat && event?.matchUpFormat === matchUpFormat) ||
      (event?.tieFormat && tieFormat && JSON.stringify(event.tieFormat) === JSON.stringify(tieFormat));

    // if an equivalent matchUpFormat or tieFormat is attached to the event
    // there is no need to attach to the drawDefinition
    if (!equivalentInScope) {
      if (tieFormat) {
        // on a COPY: checkTieFormat mints missing collectionIds IN PLACE, and `tieFormat` here is the
        // caller's object — which is the shared `fixtures.tieFormats.*` object when a published fixture
        // was passed. Stamping ids onto it would give every later record the same collection identities.
        const result = checkTieFormat({ tieFormat: makeDeepCopy(tieFormat, false, true) });
        if (result.error) return result;

        const existingQualifyingTieFormats = existingQualifyingStructures?.every((structure) => structure.tieFormat);
        if (!existingQualifyingStructures?.length || existingQualifyingTieFormats) {
          // if there are no existing qualifying structures or if all existing qualifying structures have a tieFormat
          drawDefinition.tieFormat = result.tieFormat ?? tieFormat;
        }
      } else if (matchUpFormat) {
        const result = setMatchUpMatchUpFormat({
          tournamentRecord,
          drawDefinition,
          matchUpFormat,
          event,
        });
        if (result.error) {
          return {
            info: 'matchUpFormat or tieFormat error',
            error: result.error,
          };
        }
      }

      if (matchUpType) drawDefinition.matchUpType = matchUpType;
    }
  }

  return { error: undefined };
}
