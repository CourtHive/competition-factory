// Scale name for ranking points stored on participants
export const RANKING_POINTS = 'RANKING_POINTS';

// Bonus type identifiers
export const QUALITY_WIN = 'QUALITY_WIN';

// Doubles attribution modes
export const FULL_TO_EACH = 'fullToEach';
export const SPLIT_EVEN = 'splitEven';
export const TEAM_ONLY = 'teamOnly';

// Category scope field names (for specificity scoring)
export const CATEGORY_SCOPE_FIELDS = [
  'ageCategoryCodes',
  'genders',
  'categoryNames',
  'categoryTypes',
  'ratingTypes',
  'ballTypes',
  'wheelchairClasses',
  'subTypes',
] as const;

// Award profile scope fields (for specificity scoring)
export const PROFILE_SCOPE_FIELDS = [
  'eventTypes',
  'drawTypes',
  'drawSizes',
  'maxDrawSize',
  'stages',
  'stageSequences',
  'levels',
  'maxLevel',
  'flights',
  'maxFlightNumber',
  'participationOrder',
  'dateRanges',
] as const;

export const rankingConstants = {
  RANKING_POINTS,
  QUALITY_WIN,
  FULL_TO_EACH,
  SPLIT_EVEN,
  TEAM_ONLY,
  CATEGORY_SCOPE_FIELDS,
  PROFILE_SCOPE_FIELDS,
} as const;
