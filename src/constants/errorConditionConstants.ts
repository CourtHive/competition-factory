export type ErrorType = {
  message: string;
  info?: string;
  code: string;
};

export const ANACHRONISM = {
  message: 'Chronological error; time violation.',
  code: 'ANACHRONISM',
};
export const DUPLICATE_ENTRY = {
  message: 'Duplicate entry',
  code: 'DUPLICATE_ENTRY',
};
export const CANNOT_REMOVE_MAIN_STRUCTURE = {
  message: 'Cannot remove main structure',
  code: 'ERR_CANNOT_REMOVE_MAIN_STRUCTURE',
};
export const INVALID_RECORDS = {
  message: 'records must be an object with tournamentId keys',
  code: 'ERR_INVALID_TOURNAMENTS',
};
export const MISSING_TOURNAMENT_RECORDS = {
  message: 'Missing tournamentRecords',
  code: 'ERR_MISSING_TOURNAMENTS',
};
export const MISSING_TOURNAMENT_RECORD = {
  message: 'Missing tournamentRecord',
  code: 'ERR_MISSING_TOURNAMENT',
};
export const INVALID_TOURNAMENT_RECORD = {
  message: 'Invalid tournamentRecord',
  code: 'ERR_INVALID_TOURNAMENT',
};
export const MISSING_TOURNAMENT_ID = {
  message: 'Missing tournamentId',
  code: 'ERR_MISSING_TOURNAMENT_ID',
};

export const INVALID_DRAW_DEFINITION = {
  message: 'Invalid drawDefinition',
  code: 'ERR_INVALID_DRAWDEF',
};
export const MISSING_DRAW_DEFINITION = {
  message: 'Missing drawDefinition',
  code: 'ERR_MISSING_DRAWDEF',
};
export const EXISTING_DRAW_DEFINITIONS = {
  message: 'Existing drawDefinition(s)',
  code: 'ERR_EXISTING_DRAWDEFS',
};
export const DRAW_DEFINITION_NOT_FOUND = {
  message: 'drawDefinition not found',
  code: 'ERR_NOT_FOUND_DRAWDEF',
};
export const INVALID_STRUCTURE = {
  message: 'Invalid structure',
  code: 'ERR_INVALID_STRUCTURE',
};
export const INCOMPLETE_SOURCE_STRUCTURE = {
  message: 'Incomplete source structure',
  code: 'ERR_INCOMPLETE_STRUCTURE',
};

export const INVALID_DRAW_POSITION_FOR_SEEDING = {
  message: 'Invalid drawPosition for seedAssignment',
  code: 'ERR_INVALID_SEEDING_POSITION',
};
export const DRAW_POSITION_ASSIGNED = {
  message: 'drawPosition already assigned',
  code: 'ERR_EXISTING_POSITION_ASSIGNMENT',
};
export const SCHEDULE_NOT_CLEARED = {
  message: 'Schedule not cleared',
  code: 'ERR_UNCHANGED_SCHEDULE_NOT_CLEARED',
};
export const SCHEDULE_CONFLICT_DOUBLE_BOOKING = {
  message: 'Schedule conflict: court slot already occupied',
  code: 'ERR_SCHEDULE_CONFLICT_DOUBLE_BOOKING',
};
export const DRAW_POSITION_NOT_CLEARED = {
  message: 'drawPosition not cleared',
  code: 'ERR_FAILURE_POSITION_NOT_CLEARED',
};
export const DRAW_POSITION_NOT_FOUND = {
  message: 'drawPosition not found',
  code: 'ERR_NOT_FOUND_DRAW_POSITION',
};
export const UNRECOGNIZED_DRAW_TYPE = {
  message: 'Unrecognized drawType',
  code: 'ERR_UNRECOGNIZED_DRAW_TYPE',
};
export const MISSING_DRAW_POSITIONS = {
  message: 'Missing drawPositions',
  code: 'ERR_MISSING_DRAW_POSITIONS',
};
export const DRAW_POSITION_ACTIVE = {
  message: 'drawPosition is active',
  code: 'ERR_ACTIVE_DRAW_POSITION',
};
export const DRAW_POSITION_OCCUPIED = {
  message: 'drawPosition is occupied',
  code: 'ERR_OCCUPIED_DRAW_POSITION',
};
export const INVALID_DRAW_POSITION = {
  message: 'Invlid drawPosition',
  code: 'ERR_INVALID_DRAW_POSITION',
};
export const MISSING_DRAW_POSITION = {
  message: 'Missing drawPosition',
  code: 'ERR_MISSING_DRAW_POSITION',
};
export const INVALID_DRAW_TYPE = {
  message: 'Invalid drawType',
  code: 'ERR_INVALID_DRAW_TYPE',
};
export const INVALID_DRAW_SIZE = {
  message: 'Invalid drawSize',
  code: 'ERR_INVALID_DRAW_SIZE',
};
export const DRAW_SIZE_MISMATCH = {
  message: 'Cannot set drawSize to be less than existing entries',
  code: 'ERR_INVALID_DRAW_SIZE_MISMATCH',
};
export const MISSING_DRAW_SIZE = {
  message: 'Missing drawSize',
  code: 'ERR_MISSING_DRAW_SIZE',
};
export const MISSING_DRAW_ID = {
  message: 'Missing drawId',
  code: 'ERR_MISSING_DRAW_ID',
};
export const DRAW_ID_EXISTS = {
  message: 'drawId exists',
  code: 'ERR_EXISTING_DRAW_ID',
};
export const INVALID_PARTICIPANT_SEEDING = {
  message: 'participantId cannot be assigned to multiple seedNumbers',
  code: 'INVALID_PARTICIPANT_SEEDING',
};
export const SEEDSCOUNT_GREATER_THAN_DRAW_SIZE = {
  message: 'seedsCount greater than drawSize',
  code: 'ERR_INVALID_SEED_COUNT',
};
export const MISSING_SEEDCOUNT_THRESHOLDS = {
  message: 'Missing seedCountThresholds',
  code: 'ERR_MISSING_SEED_COUNT_THRESHOLD',
};
export const INVALID_ACTION = {
  message: 'Invalid action',
  code: 'ERR_INVALID_ACTION',
};
export const INVALID_ASSIGNMENT = {
  message: 'Invalid assignment',
  code: 'ERR_INVALID_ASSIGNMENT',
};
export const MISSING_SEED_ASSIGNMENTS = {
  message: 'Missing seedAssignments',
  code: 'ERR_MISSING_SEED_ASSIGNMENTS',
};
export const INVALID_SEED_NUMBER = {
  message: 'Invalid seedNumber',
  code: 'ERR_INVALID_SEED_NUMBER',
};
export const INVALID_SEED_POSITION = {
  message: 'Invalid seedPosition',
  code: 'ERR_INVALID_SEED_POSITION',
};

export const MISSING_TARGET_LINK = {
  message: 'Missing targetLink',
  code: 'ERR_MISSING_LINK_TARGET',
};

export const EXISTING_ROUND = {
  message: 'Existing round',
  code: 'ERR_EXISTING_ROUND',
};
export const MISSING_ROUND_NUMBER = {
  message: 'Missing roundNumber',
  code: 'ERR_MISSING_ROUND_NUMBER',
};
export const MISSING_STRUCTURE_ID = {
  message: 'Missing structureId',
  code: 'ERR_MISSING_STRUCTURE_ID',
};
export const STRUCTURE_NOT_FOUND = {
  message: 'structure not found',
  code: 'ERR_NOT_FOUND_STRUCTURE',
};
export const MISSING_STRUCTURES = {
  message: 'Missing structures',
  code: 'ERR_MISSING_STRUCTURES',
};
export const MISSING_STRUCTURE = {
  message: 'Missing structure',
  code: 'ERR_MISSING_STRUCTURE',
};
export const MISSING_MAIN_STRUCTURE = {
  message: 'Missing MAIN structure',
  code: 'ERR_MISSING_MAIN_STRUCTURE',
};
export const UNLINKED_STRUCTURES = {
  message: 'drawDefinition contains unlinked structures',
  code: 'ERR_MISSING_STRUCTURE_LINKS',
};

export const INVALID_EVENT_TYPE = {
  message: 'Invalid eventType',
  code: 'ERR_INVALID_EVENT_TYPE',
};
export const UNRECOGNIZED_EVENT_TYPE = {
  message: 'Unrecognized eventType',
  code: 'ERR_UNRECOGNIZED_EVENT_TYPE',
};
export const MISSING_EVENT = {
  message: 'Missing event / eventId',
  code: 'ERR_MISSING_EVENT_ID',
};
export const EVENT_NOT_FOUND = {
  message: 'Event not found',
  code: 'ERR_NOT_FOUND_EVENT',
};
export const EVENT_EXISTS = {
  message: 'Event exists',
  code: 'ERR_EXISTING_EVENT',
};

export const MISSING_ENTRIES = {
  message: 'Missing entries',
  code: 'ERR_MISSING_ENTRIES',
};
export const INVALID_ENTRIES = {
  message: 'Invalid entries',
  code: 'ERR_INVALID_ENTRIES',
};
export const MISSING_ASSIGNMENTS = {
  message: 'Missing assignments',
  code: 'ERR_MISSING_ASSIGNMENTS',
};

export const MISSING_STAGE = {
  message: 'Missing stage',
  code: 'ERR_MISSING_STAGE',
};
export const INVALID_STAGE = {
  message: 'Invalid stage',
  code: 'ERR_INVALID_STAGE',
};
export const STAGE_SEQUENCE_LIMIT = {
  message: 'stageSequence limit',
  code: 'ERR_LIMIT_STAGE_SEQUENCE',
};
export const MISSING_POSITION_ASSIGNMENTS = {
  message: 'Missing positionAssignments',
  code: 'ERR_MISSING_POSITION_ASSIGNMENTS',
};
export const INVALID_MATCHUP_STATUS_BYE = {
  message: 'Cannot Assign BYE status if no assignment: { bye: true }',
  code: 'ERR_UNCHANGED_CANNOT_ASSIGN_BYE',
};
export const LUCKY_DRAW_BYE_LIMIT = {
  message: 'Lucky draw first round allows at most one BYE',
  code: 'ERR_LUCKY_DRAW_BYE_LIMIT',
};
export const UNRECOGNIZED_MATCHUP_STATUS = {
  message: 'Unrecognized matchUpStatus',
  code: 'ERR_UNRECOGNIZED_MATCHUP_STATUS',
};
export const UNRECOGNIZED_MATCHUP_FORMAT = {
  message: 'Unrecognized matchUpFormat',
  code: 'ERR_UNRECOGNIZED_MATCHUP_FORMAT',
};
export const INCOMPATIBLE_MATCHUP_STATUS = {
  message: 'Incompatible matchUpStatus',
  code: 'ERR_INCOMPATIBLE_MATCHUP_STATUS',
};
export const PROPAGATED_EXITS_DOWNSTREAM = {
  message: 'Propagated exits downstream',
  code: 'ERR_PROPAGATED_EXITS_DOWNSTREAM',
};
export const INVALID_MATCHUP_STATUS = {
  message: 'Invalid matchUpStatus',
  code: 'ERR_INVALID_MATCHUP_STATUS',
};
export const INVALID_TIE_FORMAT = {
  message: 'Invalid tieFormat',
  code: 'ERR_INVALID_TIE_FORMAT',
};
export const INVALID_MATCHUP_FORMAT = {
  message: 'Invalid matchUpFormat',
  code: 'ERR_INVALID_MATCHUP_FORMAT',
};
export const MISSING_MATCHUP_FORMAT = {
  message: 'Missing matchUpFormat',
  code: 'ERR_MISSING_MATCHUP_FORMAT',
};
export const MISSING_COLLECTION_DEFINITION = {
  message: 'Missing collectionDefinition',
  code: 'ERR_MISSING_COLLECTION_DEFINITION',
};
export const MISSING_TIE_FORMAT = {
  message: 'Missing tieFormat',
  code: 'ERR_MISSING_TIE_FORMAT',
};
export const MISSING_MATCHUP_ID = {
  message: 'Missing matchUpId',
  code: 'ERR_MISSING_MATCHUP_ID',
};
export const MISSING_MATCHUP_IDS = {
  message: 'Missing matchUpIds',
  code: 'ERR_MISSING_MATCHUP_IDS',
};
export const MATCHUP_NOT_FOUND = {
  message: 'matchUp not found',
  code: 'ERR_NOT_FOUND_MATCHUP',
};
export const MISSING_MATCHUPS = {
  message: 'Missing matchUps',
  code: 'ERR_MISSING_MATCHUPS',
};
export const MISSING_MATCHUP = {
  message: 'Missing matchUp',
  code: 'ERR_MISSING_MATCHUP',
};
export const INVALID_MATCHUP = {
  message: 'Invalid matchUp',
  code: 'ERR_INVALID_MATCHUP',
};

export const MISSING_POLICY_TYPE = {
  message: 'Missing policyType',
  code: 'ERR_MISSING_POLICY_TYPE',
};
export const MISSING_POLICY_DEFINITION = {
  message: 'Missing policyDefinitions',
  code: 'ERR_MISSING_POLICY_DEFINITIONS',
};
export const MISSING_SEEDING_POLICY = {
  message: 'Missing seeding policy',
  code: 'ERR_MISSING_POLICY_SEEDING',
};
export const MISSING_AVOIDANCE_POLICY = {
  message: 'Missing avoidance policy',
  code: 'ERR_MISSING_POLICY_AVOIDANCE',
};
export const MISSING_POLICY_ATTRIBUTES = {
  message: 'Missing policy attributes',
  code: 'ERR_MISSING_POLICY_ATTRIBUTES',
};
export const INVALID_POLICY_DEFINITION = {
  message: 'Invalid policyDefinitions',
  code: 'ERR_INVALID_POLICY_DEFINITIONS',
};
export const EXISTING_POLICY_TYPE = {
  message: 'existing policyType',
  code: 'ERR_EXISTING_POLICY_TYPE',
};
export const POLICY_NOT_ATTACHED = {
  message: 'Policy not attached',
  code: 'ERR_FAILURE_POLICY_NOT_ATTACHED',
};
export const POLICY_NOT_FOUND = {
  message: 'Policy not found',
  code: 'ERR_NOT_FOUND_POLICY',
};
export const MISSING_SCORING_POLICY = {
  message: 'Missing scoring policy / matchUpFormats',
  code: 'ERR_MISSING_POLICY_SCORING_MATCHUP_FORMATS',
};

export const INVALID_SIDE_NUMBER = {
  message: 'Invalid sideNumber',
  code: 'ERR_INVALID_SIDE_NUMBER',
};
export const INVALID_SET_NUMBER = {
  message: 'Invalid setNumber',
  code: 'ERR_INVALID_SET_NUMBER',
};
export const MISSING_SET_OBJECT = {
  message: 'Missing setObject',
  code: 'ERR_MISSING_SET_ATTRIBUTE',
};
export const MISSING_SET_NUMBER = {
  message: 'Missing setNumber',
  code: 'ERR_MISSING_SET_NUMBER',
};
export const MISSING_SIDE_NUMBER = {
  message: 'Missing sideNumber',
  code: 'ERR_MISSING_SIDE_NUMBER',
};
export const MISSING_COURT_ID = {
  message: 'Missing courtId',
  code: 'ERR_MISSING_COURT_ID',
};
export const MISSING_VALUE = {
  message: 'Missing value',
  code: 'ERR_MISSING_VALUE',
};
export const MISSING_BIRTH_DATE = {
  message: 'Missing birthdate',
  code: 'ERR_MISSING_BIRTH_DATE',
};
export const MISSING_DATE = {
  message: 'Missing date',
  code: 'ERR_MISSING_DATE',
};
export const NO_VALID_DATES = {
  message: 'No valid dates',
  code: 'ERR_NO_VALID_DATES',
};

export const INVALID_BOOKINGS = {
  message: 'Invalid bookings',
  code: 'ERR_INVALID_BOOKINGS',
};
export const INVALID_DATE_AVAILABILITY = {
  message: 'Invalid dateAvailability',
  code: 'ERR_INVALID_DATE_AVAILABILITY',
};
export const MISSING_DATE_AVAILABILITY = {
  message: 'Missing dateAvailability',
  code: 'ERR_MISSING_DATE_AVAILABILITY',
};

// Javascript constant for Date() function
export const INVALID_DATE = {
  message: 'Invalid Date',
  code: 'ERR_INVALID_DATE',
};
export const INVALID_TIME = {
  message: 'Invalid time',
  code: 'ERR_INVALID_TIME',
};
export const INVALID_TOURNAMENT_DATES = {
  message: 'Invalid tournament dates',
  code: 'ERR_INVALID_DATES_TOURNAMENT',
};
export const MISSING_DATE_RANGE = {
  message: 'Missing date range',
  info: 'Event or tournament must have start and end dates',
  code: 'ERR_MISSING_DATE_RANGE',
};
export const INVALID_TIME_ZONE = {
  message: 'Invalid Time Zone',
  code: 'ERR_INVALID_TIME_ZONE',
};
export const INVALID_EMBARGO = {
  message: 'Invalid embargo: must be an ISO 8601 datetime with timezone (Z or ±HH:MM offset)',
  code: 'ERR_INVALID_EMBARGO',
};

export const INVALID_GAME_SCORES = {
  message: 'Invalid game scores',
  code: 'ERR_INVALID_SCORES_GAME',
};
export const INVALID_SCORE = {
  message: 'Invalid score',
  code: 'ERR_INVALID_SCORE',
};

export const INVALID_WINNING_SIDE = {
  message: 'Invalid winningSide',
  code: 'ERR_INVALID_WINNING_SIDE',
};

export const NO_PARTICIPANTS = {
  message: 'Tournament has no participants',
  code: 'ERR_NO_TOURNAMENT_PARTICIPANTS',
};
export const NO_PARTICIPANTS_GENERATED = {
  message: 'No participants generated',
  code: 'ERR_NO_PARTICIPANTS_GENERATED',
};
export const CANNOT_MODIFY_TIEFORMAT = {
  message: 'Cannot modify tieFormat',
  code: 'ERR_UNCHANGED_CANNOT_MODIFY_TIEFORMAT',
};
export const CANNOT_MODIFY_PARTICIPANT_TYPE = {
  message: 'Cannot modify participantType',
  code: 'ERR_UNCHANGED_CANNOT_MODIFY_PARTICIPANT_TYPE',
};
export const CANNOT_REMOVE_PARTICIPANTS = {
  message: 'Cannot remove participants',
  code: 'ERR_UNCHANGED_CANNOT_REMOVE_PARTICIPANTS',
};
export const CATEGORY_MISMATCH = {
  message: 'Participant category mismatch',
  code: 'ERR_CATEGORY_MISMATCH',
};
export const CANNOT_CHANGE_WINNING_SIDE = {
  message: 'Cannot change winningSide',
  code: 'ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE',
};
export const INVALID_PARTICIPANT = {
  message: 'Invalid participant',
  code: 'ERR_INVALID_PARTICIPANT',
};
export const INVALID_PARTICIPANT_ID = {
  message: 'Invalid participantId',
  code: 'ERR_INVALID_PARTICIPANT_ID',
};
export const INVALID_PARTICIPANT_IDS = {
  message: 'Invalid participantIds',
  code: 'ERR_INVALID_PARTICIPANT_IDS',
};
export const INVALID_PARTICIPANT_ROLE = {
  message: 'Invalid participantRole',
  code: 'ERR_INVALID_PARTICIPANT_ROLE',
};
export const INVALID_PARTICIPANT_TYPE = {
  message: 'Invalid participantType',
  code: 'ERR_INVALID_PARTICIPANT_TYPE',
};
export const MISSING_PARTICIPANT_ROLE = {
  message: 'Missing participantRole',
  code: 'ERR_MISSING_PARTICIPANT_ROLE',
};
export const MISSING_PARTICIPANT = {
  message: 'Missing participant',
  code: 'ERR_MISSING_PARTICIPANT',
};
export const MISSING_PARTICIPANTS = {
  message: 'Missing participants',
  code: 'ERR_MISSING_PARTICIPANTS',
};
export const MISSING_PARTICIPANT_ID = {
  message: 'Missing participantId',
  code: 'ERR_MISSING_PARTICIPANT_ID',
};
export const MISSING_QUALIFIED_PARTICIPANTS = {
  message: 'Missing qualified participants',
  code: 'ERR_MISSING_QUALIFIED_PARTICIPANTS',
};
export const PARTICIPANT_NOT_FOUND = {
  message: 'Participant Not Found',
  code: 'ERR_NOT_FOUND_PARTICIPANT',
};
export const PARTICIPANT_ID_EXISTS = {
  message: 'participantId exists',
  code: 'ERR_EXISTING_PARTICIPANT_ID',
};
export const PARTICIPANT_PAIR_EXISTS = {
  message: 'participant pair exists',
  code: 'ERR_EXISTING_PARTICIPANT_PAIR',
};
export const NO_PARTICIPANT_REMOVED = {
  message: 'No participant removed',
  code: 'ERR_UNCHANGED_NO_PARTICIPANT_REMOVED',
};
export const MISSING_PARTICIPANT_IDS = {
  message: 'Missing participantIds',
  code: 'ERR_MISSING_PARTICIPANT_IDS',
};
export const MISSING_PARTICIPANT_COUNT = {
  message: 'Missing participantsCount',
  code: 'ERR_MISSING_PARTICIPANT_COUNT',
};
export const PARTICIPANT_NOT_CHECKED_IN = {
  message: 'Participant not checked in',
  code: 'ERR_UNCHANGED_PARTICIPANT_NOT_CHECKED_IN',
};

export const MISSING_PERSON_DETAILS = {
  message: 'Missing person details',
  code: 'ERR_MISSING_PERSON_DETAILS',
};

export const EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT = {
  message: 'Existing participant drawPosition assignment',
  code: 'ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT',
};
export const EXISTING_PARTICIPANT = {
  message: 'Existing participant',
  code: 'ERR_EXISTING_PARTICIPANT',
};
export const PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE = {
  message: 'participantsCount exceeds drawSize',
  code: 'ERR_INVALID_PARTICIPANT_COUNT',
};

export const INVALID_ENTRY_STATUS = {
  message: 'Invalid entry status',
  code: 'ERR_INVALID_ENTRY_STATUS',
};
export const PARTICIPANT_ENTRY_NOT_FOUND = {
  message: 'Participant Entry Not Found',
  code: 'ERR_NOT_FOUND_PARTICIPANT_ENTRY',
};
export const PARTICIPANT_NOT_ENTERED_IN_STAGE = {
  message: 'Participant not entered in stage',
  code: 'ERR_UNCHANGED_PARTICIPANT_NOT_ENTERED',
};
export const PARTICIPANT_NOT_FOUND_IN_STAGE = {
  message: 'Participant not found in stageSequence',
  code: 'ERR_NOT_FOUND_PARTICIPANT_IN_STAGE',
};
export const ENTRY_STATUS_NOT_ALLOWED_IN_STAGE = {
  message: 'entryStatus not allowed in stage',
  code: 'ERR_INVALID_ENTRY_STATUS_IN_STAGE',
};
export const ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT = {
  message: 'entryStatus not allowed for event',
  code: 'ERR_INVALID_ENTRY_STATUS_IN_EVENT',
};
export const NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS = {
  message: 'No stage space available for entryStatus',
  code: 'ERR_UNCHANGED_NO_AVAILABLE_STAGE_SPACE',
};

export const NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS = {
  message: 'Insufficient drawPositions to accommodate qualifiers',
  code: 'ERR_UNCHANGED_NO_DRAW_POSITIONS_FOR_QUALIFIERS',
};
export const INSUFFICIENT_DRAW_POSITIONS = {
  message: 'Insufficient drawPositions to accommodate entries',
  code: 'ERR_INSUFFICIENT_DRAW_POSITIONS',
};

export const MISSING_PENALTY_TYPE = {
  message: 'Missing penaltyType',
  code: 'ERR_MISSING_PENALTY_TYPE',
};
export const MISSING_PENALTY_ID = {
  message: 'Missing penaltyId',
  code: 'ERR_MISSING_PENALTY_ID',
};
export const PENALTY_NOT_FOUND = {
  message: 'Penalty not found',
  code: 'ERR_NOT_FOUND_PENALTY',
};

export const MISSING_COURTS_INFO = {
  message: 'Missing courtsCount/courtNames',
  code: 'ERR_MISSING_COURTS_INFO',
};
export const COURT_NOT_FOUND = {
  message: 'Court not found',
  code: 'ERR_NOT_FOUND_COURT',
};
export const COURT_EXISTS = {
  message: 'Court exists',
  code: 'ERR_EXISTING_COURT',
};
export const BOOKING_NOT_FOUND = {
  message: 'Booking not found',
  code: 'ERR_NOT_FOUND_BOOKING',
};
export const EXISTING_DRAFT = {
  message: 'An active draft already exists for this draw',
  code: 'ERR_EXISTING_DRAFT',
};
export const EXISTING_MATCHUPS = {
  message: 'Existing matchUps conflict with booking',
  code: 'ERR_EXISTING_MATCHUPS',
};

export const VENUE_EXISTS = {
  message: 'Venue exists',
  code: 'ERR_EXISTING_VENUE',
};
export const VENUE_NOT_FOUND = {
  message: 'Venue not found',
  code: 'ERR_NOT_FOUND_VENUE',
};
export const MISSING_VENUE_ID = {
  message: 'Missing venueId',
  code: 'ERR_MISSING_VENUE_ID',
};

export const INVALID_END_TIME = {
  message: 'Invalid endTime',
  code: 'ERR_INVALID_END_TIME',
};
export const EXISTING_END_TIME = {
  message: 'Existing endTime',
  code: 'ERR_EXISTING_END_TIME',
};
export const INVALID_STOP_TIME = {
  message: 'Invalid stopTime',
  code: 'ERR_INVALID_STOP_TIME',
};
export const INVALID_START_TIME = {
  message: 'Invalid startTime',
  code: 'ERR_INVALID_START_TIME',
};
export const INVALID_RESUME_TIME = {
  message: 'Invalid resumeTime',
  code: 'ERR_INVALID_RESUME_TIME',
};
export const INVALID_TIME_ITEM = {
  message: 'Invalid timeItem',
  code: 'ERR_INVALID_TIME_ITEMS',
};
export const MISSING_ASYNC_STATE_PROVIDER = {
  message: 'Missing async state provider',
  code: 'ERR_MISSING_ASYNC_STATE_PROVIDER',
};
export const MISSING_TIME_ITEM = {
  message: 'Missing timeItem',
  code: 'ERR_MISSING_TIME_ITEM',
};
export const MISSING_TIME_ITEMS = {
  message: 'Missing timeItems',
  code: 'ERR_MISSING_TIME_ITEMS',
};
export const MISSING_CONTEXT = {
  message: 'Missing context',
  code: 'ERR_MISSING_CONTEXT',
};
export const MISSING_SCHEDULE = {
  message: 'Missing schedule',
  code: 'ERR_MISSING_SCHEDULE',
};

export const INVALID_SCALE_ITEM = {
  message: 'Invalid scaleItem',
  code: 'ERR_INVALID_SCALE_ITEM',
};

export const MODIFICATIONS_FAILED = {
  message: 'Modifications failed',
  code: 'ERR_FAILURE_MODIFICATIONS',
};
export const NO_MODIFICATIONS_APPLIED = {
  message: 'No modifications applied',
  code: 'ERR_UNCHANGED_NO_MODIFICATIONS_APPLIED',
};

export const UNABLE_TO_ASSIGN_COURT = {
  message: 'Unable to assign court',
  code: 'ERR_UNCHANGED_COURT_NOT_ASSIGNED',
};

export const NO_CANDIDATES = {
  message: 'No Candidates',
  code: 'ERR_UNCHANGED_NO_CANDIDATES',
};

export const INVALID_CONFIGURATION = {
  message: 'Invalid configuration',
  code: 'ERR_INVALID_CONFIG',
};
export const INVALID_COLLECTION_DEFINITION = {
  message: 'Invalid collectionDefinition',
  code: 'ERR_INVALID_COLLECTION_DEFINITION',
};
export const INVALID_OBJECT = {
  message: 'Invalid object',
  code: 'ERR_INVALID_OBJECT',
};
export const INVALID_GENDER = {
  message: 'Invalid gender',
  code: 'ERR_INVALID_GENDER',
};
export const INVALID_CATEGORY = {
  message: 'Invalid category',
  code: 'ERR_INVALID_CATEGORY',
};
export const INVALID_VALUES = {
  message: 'Invalid values',
  code: 'ERR_INVALID_VALUES',
};
export const DUPLICATE_VALUE = {
  message: 'Duplicate value',
  code: 'ERR_DUPLICATE_VALUE',
};

export const TEAM_NOT_FOUND = {
  message: 'Team not found',
  code: 'ERR_NOT_FOUND_TEAM',
};
export const NO_VALID_ACTIONS = {
  message: 'No valid actions',
  code: 'ERR_NO_VALID_ACTIONS',
};
export const NO_VALID_ATTRIBUTES = {
  message: 'No valid attributes',
  code: 'ERR_NO_VALID_ATTRIBUTES',
};

export const VALUE_UNCHANGED = {
  message: 'Value unchanged',
  code: 'ABORT_UNCHANGED',
};
export const NOT_FOUND = { message: 'Not found', code: 'ERR_NOT_FOUND' };
export const NOT_IMPLEMENTED = {
  message: 'Not implemented',
  code: 'ERR_NOT_IMPLEMENTED',
};

export const EXISTING_FLIGHT = {
  message: 'Existing flight',
  code: 'ERR_EXISTING_FLIGHT',
};
export const EXISTING_PROFILE = {
  message: 'Existing flight profile',
  code: 'ERR_EXISTING_FLIGHT_PROFILE',
};
export const EXISTING_OUTCOME = {
  message: 'Existing outcome',
  code: 'ERR_EXISTING_OUTCOME',
};

export const EXISTING_MATCHUP_ID = {
  message: 'Existing matchUpId',
  code: 'ERR_EXISTING_MATCHUP_ID',
};

export const EXISTING_STAGE = {
  message: 'Existing stage',
  code: 'ERR_EXISTING_STAGE',
};

export const EXISTING_STRUCTURE = {
  message: 'Existing structure',
  code: 'ERR_EXISTING_STRUCTURE',
};

export const METHOD_NOT_FOUND = {
  message: 'Method not found',
  code: 'ERR_NOT_FOUND_METHOD',
};

export const MUTATION_LOCKED = {
  message: 'Mutation blocked by active lock',
  code: 'ERR_MUTATION_LOCKED',
};
export const MUTATION_LOCK_EXISTS = {
  message: 'Active mutation lock already exists for scope',
  code: 'ERR_EXISTING_MUTATION_LOCK',
};
export const MUTATION_LOCK_NOT_FOUND = {
  message: 'Mutation lock not found',
  code: 'ERR_NOT_FOUND_MUTATION_LOCK',
};
export const UNAUTHORIZED_LOCK_OPERATION = {
  message: 'Lock token does not match',
  code: 'ERR_UNAUTHORIZED_LOCK_OPERATION',
};

export const SCHEDULED_MATCHUPS = {
  message: 'Scheduled matchUps',
  code: 'ERR_SCHEDULED_MATCHUPS',
};

export const SCORES_PRESENT = {
  message: 'Scores present',
  code: 'ERR_SCORES_PRESENT',
};

export const errorConditionConstants = {
  ANACHRONISM,
  BOOKING_NOT_FOUND,
  CANNOT_CHANGE_WINNING_SIDE,
  CANNOT_MODIFY_TIEFORMAT,
  CANNOT_MODIFY_PARTICIPANT_TYPE,
  CANNOT_REMOVE_MAIN_STRUCTURE,
  CANNOT_REMOVE_PARTICIPANTS,
  CATEGORY_MISMATCH,
  COURT_EXISTS,
  COURT_NOT_FOUND,
  EXISTING_DRAFT,
  EXISTING_MATCHUPS,
  DRAW_DEFINITION_NOT_FOUND,
  DRAW_ID_EXISTS,
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  DRAW_POSITION_NOT_CLEARED,
  DRAW_POSITION_NOT_FOUND,
  DRAW_SIZE_MISMATCH,
  DUPLICATE_ENTRY,
  DUPLICATE_VALUE,
  ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT,
  ENTRY_STATUS_NOT_ALLOWED_IN_STAGE,
  EVENT_EXISTS,
  EVENT_NOT_FOUND,
  EXISTING_DRAW_DEFINITIONS,
  EXISTING_END_TIME,
  EXISTING_FLIGHT,
  EXISTING_MATCHUP_ID,
  EXISTING_OUTCOME,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  EXISTING_PARTICIPANT,
  EXISTING_POLICY_TYPE,
  EXISTING_PROFILE,
  EXISTING_ROUND,
  EXISTING_STAGE,
  EXISTING_STRUCTURE,
  INCOMPATIBLE_MATCHUP_STATUS,
  INCOMPLETE_SOURCE_STRUCTURE,
  INSUFFICIENT_DRAW_POSITIONS,
  INVALID_ACTION,
  INVALID_ASSIGNMENT,
  INVALID_BOOKINGS,
  INVALID_CATEGORY,
  INVALID_COLLECTION_DEFINITION,
  INVALID_CONFIGURATION,
  INVALID_DATE_AVAILABILITY,
  INVALID_DATE,
  INVALID_DRAW_DEFINITION,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  INVALID_DRAW_POSITION,
  INVALID_DRAW_SIZE,
  INVALID_END_TIME,
  INVALID_ENTRIES,
  INVALID_EVENT_TYPE,
  INVALID_GAME_SCORES,
  INVALID_GENDER,
  INVALID_MATCHUP_FORMAT,
  INVALID_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS_BYE,
  INVALID_MATCHUP,
  INVALID_OBJECT,
  INVALID_PARTICIPANT_ID,
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_ROLE,
  INVALID_PARTICIPANT_SEEDING,
  INVALID_PARTICIPANT_TYPE,
  INVALID_PARTICIPANT,
  INVALID_POLICY_DEFINITION,
  INVALID_RECORDS,
  INVALID_SCALE_ITEM,
  INVALID_SEED_NUMBER,
  INVALID_SEED_POSITION,
  INVALID_SET_NUMBER,
  INVALID_SIDE_NUMBER,
  INVALID_SCORE,
  INVALID_STAGE,
  INVALID_START_TIME,
  INVALID_STRUCTURE,
  INVALID_STOP_TIME,
  INVALID_TIE_FORMAT,
  INVALID_TIME,
  INVALID_TIME_ITEM,
  INVALID_TOURNAMENT_DATES,
  INVALID_TOURNAMENT_RECORD,
  INVALID_VALUES,
  INVALID_WINNING_SIDE,
  LUCKY_DRAW_BYE_LIMIT,
  MATCHUP_NOT_FOUND,
  METHOD_NOT_FOUND,
  MUTATION_LOCKED,
  MUTATION_LOCK_EXISTS,
  MUTATION_LOCK_NOT_FOUND,
  MISSING_ASSIGNMENTS,
  MISSING_ASYNC_STATE_PROVIDER,
  MISSING_AVOIDANCE_POLICY,
  MISSING_BIRTH_DATE,
  MISSING_COLLECTION_DEFINITION,
  MISSING_COURT_ID,
  MISSING_COURTS_INFO,
  MISSING_DATE_AVAILABILITY,
  MISSING_DATE,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_ID,
  MISSING_DRAW_POSITION,
  MISSING_DRAW_POSITIONS,
  MISSING_DRAW_SIZE,
  MISSING_ENTRIES,
  MISSING_EVENT,
  MISSING_QUALIFIED_PARTICIPANTS,
  MISSING_MATCHUP_FORMAT,
  MISSING_MATCHUP_ID,
  MISSING_MATCHUP_IDS,
  MISSING_MATCHUP,
  MISSING_MATCHUPS,
  MISSING_PARTICIPANT_COUNT,
  MISSING_PARTICIPANT_ID,
  MISSING_PARTICIPANT_IDS,
  MISSING_PARTICIPANT_ROLE,
  MISSING_PARTICIPANT,
  MISSING_PARTICIPANTS,
  MISSING_PENALTY_ID,
  MISSING_PENALTY_TYPE,
  MISSING_PERSON_DETAILS,
  MISSING_POLICY_ATTRIBUTES,
  MISSING_POLICY_DEFINITION,
  MISSING_POLICY_TYPE,
  MISSING_POSITION_ASSIGNMENTS,
  MISSING_ROUND_NUMBER,
  MISSING_SCHEDULE,
  MISSING_SCORING_POLICY,
  MISSING_SEED_ASSIGNMENTS,
  MISSING_SEEDCOUNT_THRESHOLDS,
  MISSING_SEEDING_POLICY,
  MISSING_SET_NUMBER,
  MISSING_SET_OBJECT,
  MISSING_SIDE_NUMBER,
  MISSING_STAGE,
  MISSING_STRUCTURE_ID,
  MISSING_STRUCTURE,
  MISSING_MAIN_STRUCTURE,
  MISSING_STRUCTURES,
  MISSING_TARGET_LINK,
  MISSING_TIE_FORMAT,
  MISSING_TIME_ITEM,
  MISSING_TIME_ITEMS,
  MISSING_TOURNAMENT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  MISSING_VENUE_ID,
  MODIFICATIONS_FAILED,
  NO_CANDIDATES,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
  NO_MODIFICATIONS_APPLIED,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
  NO_PARTICIPANT_REMOVED,
  NO_VALID_ACTIONS,
  NO_VALID_ATTRIBUTES,
  NO_VALID_DATES,
  NOT_FOUND,
  NOT_IMPLEMENTED,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
  PARTICIPANT_ID_EXISTS,
  PARTICIPANT_NOT_CHECKED_IN,
  PARTICIPANT_NOT_FOUND,
  PARTICIPANT_PAIR_EXISTS,
  PENALTY_NOT_FOUND,
  POLICY_NOT_ATTACHED,
  POLICY_NOT_FOUND,
  SCHEDULE_NOT_CLEARED,
  SCHEDULE_CONFLICT_DOUBLE_BOOKING,
  SCHEDULED_MATCHUPS,
  SCORES_PRESENT,
  SEEDSCOUNT_GREATER_THAN_DRAW_SIZE,
  STAGE_SEQUENCE_LIMIT,
  STRUCTURE_NOT_FOUND,
  TEAM_NOT_FOUND,
  UNABLE_TO_ASSIGN_COURT,
  UNAUTHORIZED_LOCK_OPERATION,
  UNLINKED_STRUCTURES,
  UNRECOGNIZED_DRAW_TYPE,
  UNRECOGNIZED_MATCHUP_FORMAT,
  UNRECOGNIZED_MATCHUP_STATUS,
  VALUE_UNCHANGED,
  VENUE_EXISTS,
};

export default errorConditionConstants;
