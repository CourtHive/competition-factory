import { getObjectTieFormat } from '@Query/hierarchical/tieFormats/getObjectTieFormat';
import tieFormatDefaults from '@Helpers/tieFormats/tieFormatDefaults';
import { validateTieFormat } from '@Validators/validateTieFormat';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { TieFormat } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';
import { ResultType } from '@Types/factoryTypes';

const NOT_HELD = 'tieFormatName names no tieFormat the event holds: pass a tieFormat';

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

    // a tieFormatName selects, by its label, one of the tieFormats the event holds: event.tieFormats[], then event.tieFormat
    const eventNamedTieFormat =
      tieFormatName &&
      (event?.tieFormats?.find((tf) => tf.tieFormatName === tieFormatName) ||
        (eventTieFormat?.tieFormatName === tieFormatName && eventTieFormat));

    tieFormat = tieFormat || referencedTieFormat || existingMainTieFormat || eventNamedTieFormat;

    // The core holds no named formats, so a name the event does not carry selects nothing. It is refused, not
    // replaced by the default: a draw in a format nobody asked for is worse than no draw.
    if (!tieFormat && tieFormatName) return { context: { tieFormatName }, error: INVALID_VALUES, info: NOT_HELD };

    // if no tieFormat is found on event then will use default
    tieFormat ||= eventTieFormat || tieFormatDefaults({ event, isMock, hydrateCollections });

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
      enforceValues: true,
      gender: event?.gender,
      enforceGender,
      tieFormat,
    });
    if (result.error) return result;
  }

  return { tieFormat, matchUpFormat };
}
