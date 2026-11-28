/**
 * Where each catalogue entry comes from, and what it is not.
 *
 * Every entry is a starting template, modelled on a published source: a governing body's regulations, a league's
 * handbook, a rating method's paper. Copy one and own it. CourtHive does not maintain the templates against their
 * sources (`maintained: false`), and the bodies they are modelled on have not reviewed or endorsed them
 * (`endorsed: false`). The statement sits beside the entry, not in its definition, so the engine never reads it and
 * attaching a template does not carry it onto a record.
 */
export type CatalogueProvenance = {
  status: 'template';
  /** The body, league or method the content is modelled on. */
  modelledOn: string;
  /** The published document the content was read from, when one is known. */
  sourceDocument?: string;
  maintainer: 'CourtHive';
  /** CourtHive does not track the source's changes. */
  maintained: false;
  /** The body named has not reviewed or endorsed the template. */
  endorsed: false;
};

// name: [modelledOn, sourceDocument?]
const sources: Record<string, [string, string?]> = {
  // policies
  TEMPLATE_OFFICIATING_CONFLICT_OF_INTEREST_ITF: ['ITF'],
  TEMPLATE_OFFICIATING_EVALUATION_CHAIR_UMPIRE: ['ITF'],
  TEMPLATE_OFFICIATING_EVALUATION_REFEREE: ['ITF'],
  TEMPLATE_PROGRESSION_USTA: ['USTA', 'USTA Tournament Desk double-exit behaviour (ustatournamentdesk.com)'],
  TEMPLATE_RANKING_POINTS_ATP: ['ATP', 'atp-2026-points-table.pdf (2026 season)'],
  TEMPLATE_RANKING_POINTS_CTS: ['ČTS (Czech Tennis Association)', 'ČTS Klasifikační řád, 2025 edition'],
  TEMPLATE_RANKING_POINTS_ITF_JUNIOR: [
    'ITF',
    '2026 ITF World Tennis Tour Juniors Regulations, Regulations 10–14 and 31',
  ],
  TEMPLATE_RANKING_POINTS_ITF_JUNIOR_2025: [
    'ITF',
    '2025 ITF World Tennis Tour Juniors Regulations, Regulations 10–14 and 31',
  ],
  TEMPLATE_RANKING_POINTS_ITF_WTT: ['ITF', 'itf-points-explained.pdf (2020 rules)'],
  TEMPLATE_RANKING_POINTS_LTA: ['LTA', 'LTA Rankings Individual and Team Points Tables (Open), April 2020'],
  TEMPLATE_RANKING_POINTS_TENNIS_AUSTRALIA: [
    'Tennis Australia',
    'Tennis Australia Junior Tour pages (2025-2026 season)',
  ],
  TEMPLATE_RANKING_POINTS_TENNIS_CANADA: [
    'Tennis Canada',
    'Tennis Alberta Junior Competitive Structure (October 2025); Tennis Canada National Bank Rankings',
  ],
  TEMPLATE_RANKING_POINTS_TENNIS_EUROPE: ['Tennis Europe', '2026 Tennis Europe Junior Tour Regulations'],
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2025: ['USTA', 'jr-points-table-2025.pdf and jr-ranking-system-2025.pdf'],
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2026: ['USTA', 'jr-points-table-2026.pdf and jr-ranking-system-2025.pdf'],
  TEMPLATE_RANKING_POINTS_WTA: ['WTA', 'wtatennis.com/rankings-explained (2026)'],
  TEMPLATE_RATINGS_ELO_538_NBA: ['FiveThirtyEight', '"How We Calculate NBA Elo Ratings" (2015)'],
  TEMPLATE_RATINGS_ELO_538_NFL: ['FiveThirtyEight', '"How Our NFL Predictions Work" (2018, modified 2023)'],
  TEMPLATE_RATINGS_ELO_538_NHL: ['FiveThirtyEight', '"How Our NHL Predictions Work" (2021)'],
  TEMPLATE_RATINGS_ELO_538_TENNIS: [
    'FiveThirtyEight',
    'Kovalchik, "Searching for the GOAT of tennis win prediction", J. Quant. Anal. Sports 12(3), 2016',
  ],
  TEMPLATE_RATINGS_ELO_WELO_TENNIS: [
    'Weighted Elo (Angelini, Candila and De Angelis)',
    '"Weighted Elo rating for tennis match predictions", EJOR 297(1), 2022',
  ],
  TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL: ['World Football Elo Ratings', 'eloratings.net, "About"'],
  TEMPLATE_RATINGS_FIFA_SUM: ['FIFA', '"Revision of the FIFA / Coca-Cola World Ranking" (2018)'],
  TEMPLATE_RATINGS_FIFA_WOMEN: ['FIFA', '"Women\'s ranking procedures" (April 2023)'],
  TEMPLATE_RATINGS_FIVB: ['FIVB', 'FIVB Volleyball World Ranking, "How it works" and "Examples"'],
  TEMPLATE_RATINGS_WORLD_RUGBY: ['World Rugby', '"Rankings Explanation"'],
  TEMPLATE_ROUND_ROBIN_TALLY_FIBA: ['FIBA', 'Official Basketball Rules 2026, Appendix D'],
  TEMPLATE_ROUND_ROBIN_TALLY_FIVB: ['FIVB', 'Volleyball Nations League 2026 Competition Regulations, § 2.5'],
  TEMPLATE_ROUND_ROBIN_TALLY_JTT: ['USTA Junior Team Tennis'],
  TEMPLATE_ROUND_ROBIN_TALLY_MLS: ['MLS', 'MLS 2026 Competition Guidelines'],
  TEMPLATE_ROUND_ROBIN_TALLY_PREMIER_LEAGUE: ['Premier League', 'Premier League Handbook 2025/26, Section C'],
  TEMPLATE_ROUND_ROBIN_TALLY_TOC: ['USTA Tennis on Campus'],
  TEMPLATE_ROUND_ROBIN_TALLY_USTA_LEAGUE: [
    'USTA League',
    'USTA/Midwest Section 2026 League Rules and Regulations, Combo section M',
  ],
  TEMPLATE_SANCTIONING_ITF: ['ITF', 'ITF World Tennis Tour Regulations and Organisational Requirements'],
  TEMPLATE_SANCTIONING_USTA: ['USTA', 'USTA Junior and Adult Tournament Regulations'],
  TEMPLATE_SCORING_USTA: ['USTA'],
  TEMPLATE_SEEDING_ITF: ['ITF'],

  // tie formats
  COLLEGE_D3: ['US college tennis (Division III)'],
  COLLEGE_DEFAULT: ['US college tennis'],
  COLLEGE_JUCO: ['US college tennis (junior college)'],
  DOMINANT_DUO: ['Dominant Duo'],
  DOMINANT_DUO_MIXED: ['Dominant Duo'],
  INTENNSE_2026: ['INTENNSE'],
  LAVER_CUP: ['Laver Cup'],
  TEAM_DOUBLES_3_AGGREGATION: ['Doubles Shuffle'],
  USTA_BREWER_CUP: ['USTA'],
  USTA_COLLEGE: ['USTA'],
  USTA_GOLD_TEAM_CHALLENGE: ['USTA'],
  USTA_INTERSECTIONAL: ['USTA'],
  USTA_LEVEL_1: ['USTA'],
  USTA_OZAKI_CUP: ['USTA'],
  USTA_SECTION_BATTLE: ['USTA'],
  USTA_SOUTHERN_LEVEL_5: ['USTA'],
  USTA_TOC: ['USTA Tennis on Campus'],
  USTA_WTT_ITT: ['World Team Tennis'],
  USTA_ZONAL: ['USTA'],

  // competition formats
  INTENNSE_STANDARD: ['INTENNSE'],
};

/** Each entry's provenance, by name. */
export const provenance: Record<string, CatalogueProvenance> = Object.fromEntries(
  Object.entries(sources).map(([name, [modelledOn, sourceDocument]]) => [
    name,
    {
      status: 'template',
      modelledOn,
      ...(sourceDocument && { sourceDocument }),
      maintainer: 'CourtHive',
      maintained: false,
      endorsed: false,
    },
  ]),
);
