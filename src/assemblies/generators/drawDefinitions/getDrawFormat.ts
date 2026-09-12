import { getObjectTieFormat } from '@Query/hierarchical/tieFormats/getObjectTieFormat';
import { validateTieFormat } from '@Assemblies/governors/scoreGovernor';
import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';

// constants and types
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { TieFormat } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';
import { TEAM } from '@Constants/eventConstants';

export function getDrawFormat(params): ResultType & { tieFormat?: TieFormat; matchUpFormat?: string } {
  const {
    existingDrawDefinition,
    hydrateCollections,
    enforceGender,
    tieFormatName,
    tieFormatId,
    matchUpType,
    eventType,
    isMock,
    event,
  } = params;
  // drawDefinition cannot have both tieFormat and matchUpFormat
  let { tieFormat, matchUpFormat } = params;

  if (matchUpType === TEAM && eventType === TEAM) {
    // if there is an existingDrawDefinition which has a tieFormat on MAIN structure
    // use this tieFormat ONLY when no tieFormat is specified in params
    const existingMainTieFormat = existingDrawDefinition?.structures?.find(({ stage }) => stage === MAIN)?.tieFormat;

    // look up tieFormatId in event.tieFormats[] if provided
    const referencedTieFormat = tieFormatId && event?.tieFormats?.find((tf) => tf.tieFormatId === tieFormatId);

    // resolve event tieFormat (handles both inline and tieFormatId reference)
    const eventTieFormat = getObjectTieFormat(event);

    tieFormat =
      tieFormat ||
      referencedTieFormat ||
      existingMainTieFormat ||
      // if tieFormatName is provided, check event.tieFormats[] array first, then event.tieFormat
      (tieFormatName && event?.tieFormats?.find((tf) => tf.tieFormatName === tieFormatName)) ||
      (tieFormatName && eventTieFormat?.tieFormatName === tieFormatName && eventTieFormat) ||
      // if the tieFormatName is not found in the factory then will use default
      (tieFormatName &&
        tieFormatDefaults({
          namedFormat: tieFormatName,
          hydrateCollections,
          isMock,
          event,
        })) ||
      // if no tieFormat is found on event then will use default
      eventTieFormat ||
      tieFormatDefaults({ event, isMock, hydrateCollections });

    matchUpFormat = undefined;
  } else if (!matchUpFormat) {
    tieFormat = undefined;
    if (!event?.matchUpFormat) {
      matchUpFormat = FORMAT_STANDARD;
    }
  }

  if (tieFormat) {
    // `checkCollectionIds: false` because this resolves WHICH tieFormat to use and runs before
    // `generateDrawTypeAndModifyDrawDefinition` mints ids onto it. The shape is validated here; the
    // id check belongs after the mint, where it now runs. The same reasoning gates `checkTieFormat`.
    const result = validateTieFormat({
      checkCollectionIds: false,
      gender: event?.gender,
      enforceGender,
      tieFormat,
    });
    if (result.error) return result;
  }

  return { tieFormat, matchUpFormat };
}
