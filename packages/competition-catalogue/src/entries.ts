import { competitionFormats } from './competitionFormats';
import { tieFormats } from './tieFormats';
import { policies } from './policies';
import { provenance } from './provenance';

import type { CatalogueProvenance } from './provenance';

export type CatalogueEntryKind = 'policy' | 'tieFormat' | 'competitionFormat';

export type CatalogueEntry = {
  kind: CatalogueEntryKind;
  provenance: CatalogueProvenance;
  definition: unknown;
  version: string;
  name: string;
};

/**
 * Each entry's version. Raise an entry's version whenever its content changes. It is independent of the package's
 * version, so a record or a host that pinned an entry can tell which content it holds.
 */
export const entryVersions: Record<string, string> = {
  // policies
  TEMPLATE_OFFICIATING_CONFLICT_OF_INTEREST_ITF: '1.0.0',
  TEMPLATE_OFFICIATING_EVALUATION_CHAIR_UMPIRE: '1.0.0',
  TEMPLATE_OFFICIATING_EVALUATION_REFEREE: '1.0.0',
  TEMPLATE_PROGRESSION_USTA: '1.0.0',
  TEMPLATE_RANKING_POINTS_ATP: '1.0.0',
  TEMPLATE_RANKING_POINTS_CTS: '1.0.0',
  TEMPLATE_RANKING_POINTS_ITF_JUNIOR: '1.0.0',
  TEMPLATE_RANKING_POINTS_ITF_JUNIOR_2025: '1.0.0',
  TEMPLATE_RANKING_POINTS_ITF_WTT: '1.0.0',
  TEMPLATE_RANKING_POINTS_LTA: '1.0.0',
  TEMPLATE_RANKING_POINTS_TENNIS_AUSTRALIA: '1.0.0',
  TEMPLATE_RANKING_POINTS_TENNIS_CANADA: '1.0.0',
  TEMPLATE_RANKING_POINTS_TENNIS_EUROPE: '1.0.0',
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2025: '1.0.0',
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2026: '1.0.0',
  TEMPLATE_RANKING_POINTS_WTA: '1.0.0',
  TEMPLATE_RATINGS_ELO_538_NBA: '1.0.0',
  TEMPLATE_RATINGS_ELO_538_NFL: '1.0.0',
  TEMPLATE_RATINGS_ELO_538_NHL: '1.0.0',
  TEMPLATE_RATINGS_ELO_538_TENNIS: '1.0.0',
  TEMPLATE_RATINGS_ELO_WELO_TENNIS: '1.0.0',
  TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL: '1.0.0',
  TEMPLATE_RATINGS_FIFA_SUM: '1.0.0',
  TEMPLATE_RATINGS_FIFA_WOMEN: '1.0.0',
  TEMPLATE_RATINGS_FIVB: '1.0.0',
  TEMPLATE_RATINGS_WORLD_RUGBY: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_FIBA: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_FIVB: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_JTT: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_MLS: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_PREMIER_LEAGUE: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_TOC: '1.0.0',
  TEMPLATE_ROUND_ROBIN_TALLY_USTA_LEAGUE: '1.0.0',
  TEMPLATE_SANCTIONING_ITF: '1.0.0',
  TEMPLATE_SANCTIONING_USTA: '1.0.0',
  TEMPLATE_SCORING_USTA: '1.0.0',
  TEMPLATE_SEEDING_ITF: '1.0.0',

  // tie formats
  COLLEGE_D3: '1.0.0',
  COLLEGE_DEFAULT: '1.0.0',
  COLLEGE_JUCO: '1.0.0',
  DOMINANT_DUO: '1.0.0',
  DOMINANT_DUO_MIXED: '1.0.0',
  INTENNSE_2026: '1.0.0',
  LAVER_CUP: '1.0.0',
  TEAM_DOUBLES_3_AGGREGATION: '1.0.0',
  USTA_BREWER_CUP: '1.0.0',
  USTA_COLLEGE: '1.0.0',
  USTA_GOLD_TEAM_CHALLENGE: '1.0.0',
  USTA_INTERSECTIONAL: '1.0.0',
  USTA_LEVEL_1: '1.0.0',
  USTA_OZAKI_CUP: '1.0.0',
  USTA_SECTION_BATTLE: '1.0.0',
  USTA_SOUTHERN_LEVEL_5: '1.0.0',
  USTA_TOC: '1.0.0',
  USTA_WTT_ITT: '1.0.0',
  USTA_ZONAL: '1.0.0',

  // competition formats
  INTENNSE_STANDARD: '1.0.0',
};

function entriesOf(kind: CatalogueEntryKind, group: Record<string, unknown>): CatalogueEntry[] {
  return Object.entries(group).map(([name, definition]) => ({
    kind,
    name,
    version: entryVersions[name],
    provenance: provenance[name],
    definition,
  }));
}

/** Every entry in the catalogue, with its kind, name, version and provenance. */
export const catalogueEntries: CatalogueEntry[] = [
  ...entriesOf('policy', policies),
  ...entriesOf('tieFormat', tieFormats),
  ...entriesOf('competitionFormat', competitionFormats),
];
