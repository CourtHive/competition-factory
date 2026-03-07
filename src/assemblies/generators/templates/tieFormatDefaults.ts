import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants, fixtures and types
import USTA_GOLD_TEAM_CHALLENGE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_GOLD_TEAM_CHALLENGE.json';
import TEAM_AGGREGATION_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/TEAM_DOUBLES_3_AGGREGATION.json';
import USTA_SOUTHERN_LEVEL_5_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_SOUTHERN_LEVEL_5.json';
import USTA_SECTION_BATTLE_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_SECTION_BATTLE.json';
import USTA_INTERSECTIONAL_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_INTERSECTIONAL.json';
import DOMINANT_DUO_MIXED_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/DOMINANT_DUO_MIXED.json';
import USTA_BREWER_CUP_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_BREWER_CUP.json';
import USTA_OZAKI_CUP_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_OZAKI_CUP.json';
import { FORMAT_ATP_DOUBLES, FORMAT_STANDARD } from '../../../fixtures/scoring/matchUpFormats';
import DOMINANT_DUO_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/DOMINANT_DUO.json';
import USTA_COLLEGE_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_COLLEGE.json';
import USTA_LEVEL_1_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_LEVEL_1.json';
import USTA_WTT_ITT_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_WTT_ITT.json';
import USTA_ZONAL_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_ZONAL.json';
import LAVER_CUP_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/LAVER_CUP.json';
import USTA_TOC_TIE_FORMAT from '../../../fixtures/scoring/tieFormats/USTA_TOC.json';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { Event } from '@Types/tournamentTypes';
import {
  COLLEGE_D3,
  COLLEGE_DEFAULT,
  COLLEGE_JUCO,
  DOMINANT_DUO,
  DOMINANT_DUO_MIXED,
  LAVER_CUP,
  TEAM_DOUBLES_3_AGGREGATION,
  USTA_BREWER_CUP,
  USTA_OZAKI_CUP,
  USTA_COLLEGE,
  USTA_GOLD_TEAM_CHALLENGE,
  USTA_INTERSECTIONAL,
  USTA_TOC,
  USTA_WTT_ITT,
  USTA_LEVEL_1,
  USTA_SECTION_BATTLE,
  USTA_SOUTHERN_LEVEL_5,
  USTA_ZONAL,
} from '@Constants/tieFormatConstants';

const STANDARD = 'STANDARD';

const namedFormats = {
  [STANDARD]: {
    hydrate: true,
    doubles: { matchUpCount: 3, matchUpValue: 1 },
    singles: { matchUpCount: 6, matchUpValue: 1 },
    valueGoal: 5,
  },
  [COLLEGE_D3]: {
    hydrate: true,
    doubles: {
      matchUpFormat: 'SET1-S:8/TB7@7',
      matchUpCount: 3,
      matchUpValue: 1,
    },
    singles: {
      matchUpFormat: FORMAT_STANDARD,
      matchUpCount: 6,
      matchUpValue: 1,
    },
    tieFormatName: COLLEGE_D3,
    valueGoal: 5,
  },
  [COLLEGE_DEFAULT]: {
    hydrate: true,
    doubles: {
      matchUpFormat: 'SET1-S:6/TB7',
      collectionValue: 1,
      matchUpCount: 3,
    },
    singles: {
      matchUpFormat: FORMAT_STANDARD,
      matchUpCount: 6,
      matchUpValue: 1,
    },
    tieFormatName: COLLEGE_DEFAULT,
    valueGoal: 4,
  },
  [COLLEGE_JUCO]: {
    hydrate: true,
    doubles: {
      matchUpFormat: 'SET1-S:8/TB7',
      matchUpCount: 3,
      matchUpValue: 1,
    },
    singles: {
      matchUpFormat: FORMAT_STANDARD,
      matchUpCount: 6,
      matchUpValue: 1,
    },
    tieFormatName: COLLEGE_JUCO,
    valueGoal: 5,
  },
  [LAVER_CUP]: LAVER_CUP_TIE_FORMAT,
  [DOMINANT_DUO]: DOMINANT_DUO_TIE_FORMAT,
  [DOMINANT_DUO_MIXED]: DOMINANT_DUO_MIXED_TIE_FORMAT,
  [TEAM_DOUBLES_3_AGGREGATION]: TEAM_AGGREGATION_TIE_FORMAT,
  [USTA_BREWER_CUP]: USTA_BREWER_CUP_TIE_FORMAT,
  [USTA_OZAKI_CUP]: USTA_OZAKI_CUP_TIE_FORMAT,
  [USTA_COLLEGE]: USTA_COLLEGE_TIE_FORMAT,
  [USTA_GOLD_TEAM_CHALLENGE]: USTA_GOLD_TEAM_CHALLENGE_FORMAT,
  [USTA_INTERSECTIONAL]: USTA_INTERSECTIONAL_TIE_FORMAT,
  [USTA_LEVEL_1]: USTA_LEVEL_1_TIE_FORMAT,
  [USTA_SECTION_BATTLE]: USTA_SECTION_BATTLE_TIE_FORMAT,
  [USTA_SOUTHERN_LEVEL_5]: USTA_SOUTHERN_LEVEL_5_TIE_FORMAT,
  [USTA_WTT_ITT]: USTA_WTT_ITT_TIE_FORMAT,
  [USTA_TOC]: USTA_TOC_TIE_FORMAT,
  [USTA_ZONAL]: USTA_ZONAL_TIE_FORMAT,
};

type TieFormatDefaultArgs = {
  hydrateCollections?: boolean;
  namedFormat?: string;
  isMock?: boolean;
  uuids?: string[];
  event?: Event;
};

export const tieFormatDefaults = (params?: TieFormatDefaultArgs) => {
  const namedFormat =
    params?.namedFormat && Object.keys(namedFormats).includes(params.namedFormat) ? params.namedFormat : STANDARD;

  const uuids = Array.isArray(params?.uuids) ? params?.uuids : [];

  let tieFormat;
  const { category, gender } = params?.event ?? {};
  const template = makeDeepCopy(namedFormats[namedFormat], false, true);

  const getCollectionId = (index) => {
    if ((!params?.isMock && !params?.event?.isMock) || !params.event) return uuids?.pop() ?? UUID();
    const eventId = params?.event?.eventId;
    return uuids.pop() ?? `${eventId}-COL-${index + 1}`;
  };
  if (template.hydrate) {
    tieFormat = {
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

    if (template.tieFormatName) tieFormat.tieFormatName = template.tieFormatName;
  } else {
    template.collectionDefinitions.forEach(
      (collectionDefinition, i) => (collectionDefinition.collectionId = getCollectionId(i)),
    );
    tieFormat = template;
  }

  if (params?.hydrateCollections) {
    tieFormat.collectionDefinitions.forEach((collectionDefinition) => {
      if (category && !collectionDefinition.category) collectionDefinition.category = category;
      if (gender && !collectionDefinition.gender) collectionDefinition.gender = gender;
    });
  }

  return tieFormat;
};

export default tieFormatDefaults;
