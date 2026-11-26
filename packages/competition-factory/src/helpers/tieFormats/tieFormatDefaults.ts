import { UUID } from '@Tools/UUID';

// constants and types
import { FORMAT_ATP_DOUBLES, FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { Event, TieFormat } from '@Types/tournamentTypes';

/** The default TEAM format: three doubles and six singles, a point each, first to five. */
const STANDARD = {
  doubles: { matchUpCount: 3, matchUpValue: 1 },
  singles: { matchUpCount: 6, matchUpValue: 1 },
  valueGoal: 5,
};

type TieFormatDefaultArgs = {
  hydrateCollections?: boolean;
  isMock?: boolean;
  uuids?: string[];
  event?: Event;
};

/**
 * The default TEAM tieFormat, built for `event`: the format a TEAM draw takes when neither the call nor the event gives
 * one. The core holds no named formats; a caller passes a `tieFormat` object for any other.
 */
export const tieFormatDefaults = (params?: TieFormatDefaultArgs) => {
  const uuids = Array.isArray(params?.uuids) ? params?.uuids : [];

  const { category, gender } = params?.event ?? {};
  const template = STANDARD;

  const getCollectionId = (index) => {
    if ((!params?.isMock && !params?.event?.isMock) || !params.event) return uuids?.pop() ?? UUID();
    const eventId = params?.event?.eventId;
    return uuids.pop() ?? `${eventId}-COL-${index + 1}`;
  };
  const tieFormat: TieFormat = {
    winCriteria: {
      valueGoal: template.valueGoal,
    },
    collectionDefinitions: [
      {
        collectionId: getCollectionId(0),
        matchUpFormat: FORMAT_ATP_DOUBLES,
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        ...template.doubles,
      },
      {
        collectionId: getCollectionId(1),
        matchUpFormat: FORMAT_STANDARD,
        collectionName: 'Singles',
        matchUpType: SINGLES,
        ...template.singles,
      },
    ],
  };

  if (params?.hydrateCollections) {
    tieFormat.collectionDefinitions.forEach((collectionDefinition) => {
      if (category && !collectionDefinition.category) collectionDefinition.category = category;
      if (gender && !collectionDefinition.gender) collectionDefinition.gender = gender;
    });
  }

  return tieFormat;
};

export default tieFormatDefaults;
