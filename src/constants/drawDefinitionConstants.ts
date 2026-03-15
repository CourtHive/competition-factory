// stage types
export const MAIN = 'MAIN';
export const QUALIFYING = 'QUALIFYING';
export const CONSOLATION = 'CONSOLATION';
export const VOLUNTARY_CONSOLATION = 'VOLUNTARY_CONSOLATION';
export const PLAY_OFF = 'PLAY_OFF';

export const validStages = [MAIN, QUALIFYING, CONSOLATION, PLAY_OFF, VOLUNTARY_CONSOLATION];

export const stageOrder = {
  [QUALIFYING]: 1,
  [MAIN]: 2,
  [PLAY_OFF]: 3,
  [CONSOLATION]: 3,
  [VOLUNTARY_CONSOLATION]: 4,
};

export const FINISHING_POSITIONS = 'finishingPositions';
export const AGGREGATE_EVENT_STRUCTURES = 'aggregateEventStructures';

export const finishOrder = {
  [MAIN]: 1,
  [PLAY_OFF]: 2,
  [CONSOLATION]: 3,
  [QUALIFYING]: 4,
  [VOLUNTARY_CONSOLATION]: 5,
};

// for aggregateOrder { stage: MAIN, stageSequence: 1 } is always first
export const aggregateOrder = {
  [PLAY_OFF]: 1,
  [MAIN]: 2,
  [CONSOLATION]: 3,
  [QUALIFYING]: 4,
  [VOLUNTARY_CONSOLATION]: 5,
};

// seedingProfile.positioning
export const CLUSTER = 'CLUSTER';
export const ADJACENT = 'ADJACENT'; // synonym for CLUSTER
export const SEPARATE = 'SEPARATE';
export const WATERFALL = 'WATERFALL';

// structureType
export const ITEM = 'ITEM';
export const CONTAINER = 'CONTAINER';

// positioningProfile
export const DRAW: any = 'DRAW';
export const RANDOM: any = 'RANDOM';
export const TOP_DOWN: any = 'TOP_DOWN';
export const BOTTOM_UP: any = 'BOTTOM_UP';

// Match and Link types
export const POSITION: any = 'POSITION'; // participant advances based on their finishing position
export const WINNER: any = 'WINNER'; // participant advances based on winning a matchUp
export const LOSER: any = 'LOSER'; // partticipant advances based on losing a matchUp
export const FIRST_MATCHUP = 'FIRST_MATCHUP'; // condition for valididty of link

// draw types
// NOTE: PLAY_OFF (underscore) is a STAGE type (see validStages). PLAYOFF (no underscore) is a DRAW TYPE.
export const AD_HOC = 'AD_HOC';
export const FLEX_ROUNDS = 'AD_HOC';
export const FEED_IN = 'FEED_IN';
export const COMPASS = 'COMPASS';
export const OLYMPIC = 'OLYMPIC';
export const KNOCKOUT = 'SINGLE_ELIMINATION';
export const ELIMINATION = 'SINGLE_ELIMINATION';
export const SINGLE_ELIMINATION = 'SINGLE_ELIMINATION';
export const DOUBLE_ELIMINATION = 'DOUBLE_ELIMINATION';
export const FIRST_MATCH_LOSER_CONSOLATION = 'FIRST_MATCH_LOSER_CONSOLATION';
export const FIRST_ROUND_LOSER_CONSOLATION = 'FIRST_ROUND_LOSER_CONSOLATION';

export const LUCKY_DRAW = 'LUCKY_DRAW';
export const ADAPTIVE = 'ADAPTIVE';
export const CURTIS = 'CURTIS_CONSOLATION';
export const CURTIS_CONSOLATION = 'CURTIS_CONSOLATION';

export const FICSF = 'FEED_IN_CHAMPIONSHIP_TO_SF';
export const FEED_IN_CHAMPIONSHIP_TO_SF = 'FEED_IN_CHAMPIONSHIP_TO_SF';
export const FICQF = 'FEED_IN_CHAMPIONSHIP_TO_QF';
export const FEED_IN_CHAMPIONSHIP_TO_QF = 'FEED_IN_CHAMPIONSHIP_TO_QF';
export const FICR16 = 'FEED_IN_CHAMPIONSHIP_TO_R16';
export const FEED_IN_CHAMPIONSHIP_TO_R16 = 'FEED_IN_CHAMPIONSHIP_TO_R16';
export const MFIC = 'MODIFIED_FEED_IN_CHAMPIONSHIP';
export const MODIFIED_FEED_IN_CHAMPIONSHIP = 'MODIFIED_FEED_IN_CHAMPIONSHIP';
export const FEED_IN_CHAMPIONSHIP = 'FEED_IN_CHAMPIONSHIP';
export const PLAYOFF = 'PLAYOFF';

export const DOUBLE_ROUND_ROBIN = 'DOUBLE_ROUND_ROBIN';
export const ROUND_ROBIN = 'ROUND_ROBIN';
export const ROUND_ROBIN_WITH_PLAYOFF = 'ROUND_ROBIN_WITH_PLAYOFF';

// structure naming
export const DECIDER = 'DECIDER';
export const BACKDRAW = 'BACKDRAW';
export const COMPASS_ATTRIBUTES = {
  0: { name: 'East', abbreviation: 'E' },
  '0-1': { name: 'West', abbreviation: 'W' },
  '0-2': { name: 'North', abbreviation: 'N' },
  '0-3': { name: 'Northeast', abbreviation: 'NE' },
  '0-1-1': { name: 'South', abbreviation: 'S' },
  '0-1-2': { name: 'Southwest', abbreviation: 'SW' },
  '0-2-1': { name: 'Northwest', abbreviation: 'NW' },
  '0-1-1-1': { name: 'Southeast', abbreviation: 'SE' },
};
export const OLYMPIC_ATTRIBUTES = {
  0: { name: 'East', abbreviation: 'E' },
  '0-1': { name: 'West', abbreviation: 'W' },
  '0-2': { name: 'North', abbreviation: 'N' },
  '0-1-1': { name: 'South', abbreviation: 'S' },
};
export const ADAPTIVE_ATTRIBUTES = {
  0: { name: 'East', abbreviation: 'E' },
  '0-1': { name: 'West', abbreviation: 'W' },
  '0-2': { name: 'North', abbreviation: 'N' },
  '0-3': { name: 'Northeast', abbreviation: 'NE' },
  '0-1-1': { name: 'South', abbreviation: 'S' },
  '0-1-2': { name: 'Southwest', abbreviation: 'SW' },
  '0-2-1': { name: 'Northwest', abbreviation: 'NW' },
  '0-1-1-1': { name: 'Southeast', abbreviation: 'SE' },
};

// finishingPosition determination
export const WIN_RATIO = 'WIN_RATIO';
export const ROUND_OUTCOME = 'ROUND_OUTCOME';

export const MULTI_STRUCTURE_DRAWS = [
  ADAPTIVE,
  COMPASS,
  CURTIS,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  FICQF,
  FICR16,
  FICSF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  PLAYOFF,
  ROUND_ROBIN_WITH_PLAYOFF,
];

export const generatedDrawTypes = [
  AD_HOC,
  ADAPTIVE,
  COMPASS,
  CURTIS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  PLAYOFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
];

export const drawDefinitionConstants = {
  MAIN,
  QUALIFYING,
  CONSOLATION,

  ITEM,
  CONTAINER,

  FIRST_MATCHUP,
  WINNER,
  LOSER,

  AD_HOC,
  FEED_IN,
  FLEX_ROUNDS,
  COMPASS,
  PLAY_OFF,
  PLAYOFF,
  OLYMPIC,
  KNOCKOUT,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,

  CURTIS,
  FICSF,
  FICQF,
  FICR16,
  MFIC,

  VOLUNTARY_CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  LUCKY_DRAW,
  ADAPTIVE,

  ROUND_ROBIN_WITH_PLAYOFF,
  ROUND_ROBIN,

  DECIDER,
  BACKDRAW,
  COMPASS_ATTRIBUTES,
  OLYMPIC_ATTRIBUTES,
  ADAPTIVE_ATTRIBUTES,

  DRAW,
  RANDOM,
  TOP_DOWN,
  BOTTOM_UP,
  CLUSTER,
  ADJACENT,
  SEPARATE,
  WATERFALL,

  WIN_RATIO,
  ROUND_OUTCOME,

  MULTI_STRUCTURE_DRAWS,
  generatedDrawTypes,

  stageOrder,
  finishOrder,
  AGGREGATE_EVENT_STRUCTURES,
  FINISHING_POSITIONS,
};

export default drawDefinitionConstants;
