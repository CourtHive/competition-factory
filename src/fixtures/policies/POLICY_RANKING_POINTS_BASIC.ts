/**
 * Basic Ranking Points Policy — Simple finishing-position-based points.
 *
 * Designed as a universal, category-agnostic policy that works for any
 * singles or doubles elimination event regardless of level, age category,
 * or draw size. Useful for club tournaments, local leagues, and as a
 * starting point for custom policies.
 *
 * Points are awarded purely by finishing position:
 *   1st:  100
 *   2nd:   70
 *   3-4:   50
 *   5-8:   30
 *   9-16:  15
 *   17-32: 8
 *   33-64: 4
 *   65+:   1
 *
 * No level scoping, no category filtering, no quality win bonuses.
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

const awardProfiles = [
  {
    profileName: 'Basic finishing position points',
    finishingPositionRanges: {
      1: 100,
      2: 70,
      4: 50,
      8: 30,
      16: 15,
      32: 8,
      64: 4,
      128: 1,
    },
  },
];

export const POLICY_RANKING_POINTS_BASIC = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Basic Ranking Points',
    policyVersion: '1.0',

    awardProfiles,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_BASIC;
