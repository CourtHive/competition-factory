import TEAM_DOUBLES_3_AGGREGATION from './TEAM_DOUBLES_3_AGGREGATION.json';
import USTA_GOLD_TEAM_CHALLENGE from './USTA_GOLD_TEAM_CHALLENGE.json';
import USTA_SOUTHERN_LEVEL_5 from './USTA_SOUTHERN_LEVEL_5.json';
import USTA_SECTION_BATTLE from './USTA_SECTION_BATTLE.json';
import USTA_INTERSECTIONAL from './USTA_INTERSECTIONAL.json';
import DOMINANT_DUO_MIXED from './DOMINANT_DUO_MIXED.json';
import USTA_BREWER_CUP from './USTA_BREWER_CUP.json';
import COLLEGE_DEFAULT from './COLLEGE_DEFAULT.json';
import USTA_OZAKI_CUP from './USTA_OZAKI_CUP.json';
import INTENNSE_2026 from './INTENNSE_2026.json';
import USTA_WTT_ITT from './USTA_WTT_ITT.json';
import USTA_LEVEL_1 from './USTA_LEVEL_1.json';
import USTA_COLLEGE from './USTA_COLLEGE.json';
import DOMINANT_DUO from './DOMINANT_DUO.json';
import COLLEGE_JUCO from './COLLEGE_JUCO.json';
import USTA_ZONAL from './USTA_ZONAL.json';
import COLLEGE_D3 from './COLLEGE_D3.json';
import LAVER_CUP from './LAVER_CUP.json';
import USTA_TOC from './USTA_TOC.json';

/**
 * The named tie formats, as published. They are templates: a `collectionId` identifies a collection within one
 * record, so use `resolveTieFormat`, which returns a copy without them, and let the engine mint the ids.
 */
export const tieFormats = {
  COLLEGE_D3,
  COLLEGE_DEFAULT,
  COLLEGE_JUCO,
  DOMINANT_DUO_MIXED,
  DOMINANT_DUO,
  INTENNSE_2026,
  LAVER_CUP,
  TEAM_DOUBLES_3_AGGREGATION,
  USTA_BREWER_CUP,
  USTA_COLLEGE,
  USTA_GOLD_TEAM_CHALLENGE,
  USTA_INTERSECTIONAL,
  USTA_LEVEL_1,
  USTA_OZAKI_CUP,
  USTA_SECTION_BATTLE,
  USTA_SOUTHERN_LEVEL_5,
  USTA_TOC,
  USTA_WTT_ITT,
  USTA_ZONAL,
};

/** The names of the tie formats, for code that selects one by name: `tieFormats[tieFormatConstants.DOMINANT_DUO]`. */
export const tieFormatConstants = {
  COLLEGE_D3: 'COLLEGE_D3',
  COLLEGE_DEFAULT: 'COLLEGE_DEFAULT',
  COLLEGE_JUCO: 'COLLEGE_JUCO',
  DOMINANT_DUO_MIXED: 'DOMINANT_DUO_MIXED',
  DOMINANT_DUO: 'DOMINANT_DUO',
  INTENNSE_2026: 'INTENNSE_2026',
  LAVER_CUP: 'LAVER_CUP',
  TEAM_DOUBLES_3_AGGREGATION: 'TEAM_DOUBLES_3_AGGREGATION',
  USTA_BREWER_CUP: 'USTA_BREWER_CUP',
  USTA_COLLEGE: 'USTA_COLLEGE',
  USTA_GOLD_TEAM_CHALLENGE: 'USTA_GOLD_TEAM_CHALLENGE',
  USTA_INTERSECTIONAL: 'USTA_INTERSECTIONAL',
  USTA_LEVEL_1: 'USTA_LEVEL_1',
  USTA_OZAKI_CUP: 'USTA_OZAKI_CUP',
  USTA_SECTION_BATTLE: 'USTA_SECTION_BATTLE',
  USTA_SOUTHERN_LEVEL_5: 'USTA_SOUTHERN_LEVEL_5',
  USTA_TOC: 'USTA_TOC',
  USTA_WTT_ITT: 'USTA_WTT_ITT',
  USTA_ZONAL: 'USTA_ZONAL',
} as const;

export type TieFormatName = keyof typeof tieFormats;
