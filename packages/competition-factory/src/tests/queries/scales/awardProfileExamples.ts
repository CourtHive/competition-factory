import type { AwardProfile } from '@Types/rankingTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

// prettier-ignore
export const awardProfileFlights = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  drawSizes: [4, 8, 16], // this awardProfile is only valid for these drawSizes
  maxDrawSize: 16, // alternative declaration
  levels: [4, 5], // this awardProfile is only valid for levels 4 and 5
  maxFlightNumber: 4,
  finishingPositionRanges: {
    1: {
      level: {
        4: { flights: [540, 351, 270, 189] },
        5: [
          { flight: 1, v: 300 },
          { f: 2, v: 195 },
          { f: 3, v: 150 },
          { f: 4, v: 105 },
        ],
      },
    },
    2: { level: { 4: { f: [405, 263, 203, 142] }, 5: { f: [225, 146, 113, 79] }}},
    3: { level: { 4: { f: [324, 211, 162, 113] }, 5: { f: [180, 117, 90, 63] }}},
    4: { level: { 4: { f: [270, 176, 135, 95] }, 5: { f: [150, 98, 75, 53] }}},
    8: { level: { 4: { f: [95, 61, 47, 33] }, 5: { f: [53, 34, 26, 18] }}},
  },
  perWinPoints: {
    participationOrders: [2, 3, 4, 5],
    level: { 4: { f: [84, 54, 42, 29] }, 5: { f: [47, 30, 23, 16] }},
  },
} satisfies AwardProfile;

export const awardProfilePercentageFlights = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  flights: { flightNumbers: [1, 2], pct: { 2: 0.65, 3: 0.5, 4: 0.35 } },
  drawSizes: [4, 8, 16], // this awardProfile is only valid for these drawSizes
  maxDrawSize: 16, // alternative declaration
  levels: [4, 5], // this awardProfile is only valid for levels 4 and 5
  maxFlightNumber: 4,
  finishingPositionRanges: {
    1: { level: { 4: 540, 5: 300 } },
    2: { level: { 4: 405, 5: 225 } },
    3: { level: { 4: 324, 5: 180 } },
    4: { level: { 4: 270, 5: 150 } },
    8: { level: { 4: 95, 5: 53 } },
  },
  perWinPoints: {
    participationOrders: [2, 3, 4, 5],
    level: { 4: 84, 5: 47 },
  },
} satisfies AwardProfile;

export const awardProfileExpandedLevels = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  finishingPositionPoints: { participationOrders: [1] }, // only assign points for finishing positions when participationOrder: 1
  perWinPoints: [
    // this can be an array so that drawSize can be used to differentiate
    {
      participationOrders: [2, 3, 4, 5],
      level: { 1: 105, 2: 62, 3: 32, 4: 19, 5: 11 },
    },
  ],
  finishingPositionRanges: {
    1: [{ level: { 1: 3000, 2: 1650, 3: 900, 4: 540, 5: 300 } }],
    2: [{ level: { 1: 2400, 2: 1238, 3: 675, 4: 405, 5: 225 } }],
    3: [{ level: { 1: 1950, 2: 990, 3: 540, 4: 324, 5: 180 } }],
    4: [{ level: { 1: 1800, 2: 825, 3: 450, 4: 270, 5: 150 } }],
    8: [{ level: { 1: 1110, 2: 578, 3: 315, 4: 189, 5: 105 } }],
    16: [{ level: { 1: 750, 2: 297, 3: 162, 4: 97, 5: 54 } }],
    32: [{ level: { 1: 450, 2: 165, 3: 90, 4: 54, 5: 30 } }],
    64: [{ level: { 1: 270, 2: 99, 3: 54, 4: 32, 5: 18 } }],
    128: [{ level: { 1: 120, 2: 66, 3: 36, 4: 22, 5: 12 } }],
    256: [{ level: { 1: 90, 2: 33, 3: 18, 4: 11, 5: 6 } }],
  },
} satisfies AwardProfile;

export const awardProfileLevels = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  maxLevel: 5, // this awardProfile is only valid for levels up to 5
  perWinPoints: {
    // this can also be an array so that drawSize can be used to differentiate (see above example)
    participationOrders: [2, 3, 4, 5],
    level: [105, 62, 32, 19, 11],
  },
  finishingPositionPoints: { participationOrders: [1] }, // only assign points for finishing positions when participationOrder: 1
  finishingPositionRanges: {
    1: { level: [3000, 1650, 900, 540, 300] },
    2: { level: [2400, 1238, 675, 405, 225] },
    3: { level: [1950, 990, 540, 324, 180] },
    4: { level: [1800, 825, 450, 270, 150] },
    8: { level: [1110, 578, 315, 189, 105] },
    16: { level: [750, 297, 162, 97, 54] },
    32: { level: [450, 165, 90, 54, 30] },
    64: { level: [270, 99, 54, 32, 18] },
    128: { level: [120, 66, 36, 22, 12] },
    256: { level: [90, 33, 18, 11, 6] },
  },
} satisfies AwardProfile;

export const awardProfileLevelLines = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  eventTypes: [TEAM_EVENT],
  perWinPoints: {
    level: {
      1: { line: [300, 275, 250, 225, 200, 175] },
      2: { line: [180, 156, 131, 108, 84, 59] },
      3: { line: [156, 133, 109, 86, 62, 51], limit: 5 },
      4: { line: [105, 91, 78, 65, 53, 39], limit: 5 },
      5: { line: [57, 49, 42, 35, 29, 21], limit: 4 },
      6: { line: [24, 21, 18, 15, 12, 10], limit: 4 },
      7: { line: [14, 12, 10, 9, 7, 6], limit: 4 },
    },
  },
} satisfies AwardProfile;

export const awardProfileThresholds = {
  dateRanges: [{ startDate: undefined, endDate: undefined }], // optional
  finishingPositionRanges: {
    1: [
      { drawSize: 64, threshold: true, value: 3000 }, // threshold means any drawSize >= that defined will match
      { drawSizes: [], value: 2800 },
    ],
    2: [
      { drawSize: 64, threshold: true, value: 2400 },
      { drawSize: 16, threshold: true, value: 2000 },
      { drawSizes: [], value: 1800 },
    ],
    3: [{ value: 1950 }],
    4: [
      { drawSize: 64, threshold: true, value: 1800 },
      { drawSizes: [32, 8], value: 1750 },
      { drawSize: 4, threshold: true, value: 1775 },
    ],
    8: [{ value: 1110 }],
    16: [{ value: 750 }],
    32: [{ value: 450 }],
    64: [{ value: 270 }],
    128: [{ value: 120 }],
    256: [{ value: 90 }],
  },
} satisfies AwardProfile;
