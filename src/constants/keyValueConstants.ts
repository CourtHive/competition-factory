export const SPACE_CHARACTER = ' ';

export const OUTCOME_DEFAULT = 'DEF';
export const OUTCOME_COMPLETE = 'COMPLETED';
export const OUTCOME_WALKOVER = 'WO';
export const OUTCOME_DOUBLE_WALKOVER = 'WO/WO';
export const OUTCOME_ABANDONED = 'ABN';
export const OUTCOME_SUSPENDED = 'SUS';
export const OUTCOME_RETIREMENT = 'RET';
export const OUTCOME_INTERRUPTED = 'INT';
export const OUTCOMES = [
  OUTCOME_RETIREMENT,
  OUTCOME_DEFAULT,
  OUTCOME_WALKOVER,
  OUTCOME_DOUBLE_WALKOVER,
  OUTCOME_ABANDONED,
  OUTCOME_SUSPENDED,
  OUTCOME_INTERRUPTED,
];

export const WINNING_OUTCOMES = [OUTCOME_RETIREMENT, OUTCOME_DEFAULT, OUTCOME_WALKOVER];

export const STATUS_DEFAULT = 'DEFAULTED';
export const STATUS_COMPLETE = 'COMPLETED';
export const STATUS_WALKOVER = 'WALKOVER';
export const STATUS_DOUBLE_DEFAULT = 'DOUBLE_DEFAULT';
export const STATUS_DOUBLE_WALKOVER = 'DOUBLE_WALKOVER';
export const STATUS_ABANDONED = 'ABANDONED';
export const STATUS_SUSPENDED = 'SUSPENDED';
export const STATUS_RETIREMENT = 'RETIRED';
export const STATUS_INTERRUPTED = 'INTERRUPTED';
export const STATUSES = [
  STATUS_RETIREMENT,
  STATUS_DEFAULT,
  STATUS_WALKOVER,
  STATUS_DOUBLE_DEFAULT,
  STATUS_DOUBLE_WALKOVER,
  STATUS_ABANDONED,
  STATUS_SUSPENDED,
  STATUS_INTERRUPTED,
];

export const WINNING_STATUSES = [STATUS_RETIREMENT, STATUS_DEFAULT, STATUS_WALKOVER];

export const PROMPT = 'Enter Score';
export const SET_TIEBREAK_BRACKETS = '()';
export const MATCH_TIEBREAK_BRACKETS = '[]';

export const MOVEUP = ['up', 'left', 'shift+tab'];
export const MOVEDOWN = ['enter', 'down', 'tab', 'right'];

export const BACKSPACE = 'backspace';
export const RETIRE = 'r';
export const SUSPEND = 's';
export const ABANDON = 'a';
export const DEFAULT = 'd';
export const WALKOVER = 'w';
export const INTERRUPT = 'i';
export const OUTCOMEKEYS = [RETIRE, DEFAULT, WALKOVER, ABANDON, SUSPEND, INTERRUPT];

export const SPACE_KEY = 'space';
export const OPENERS = ['[', '('];
export const CLOSERS = [...MOVEUP, ...MOVEDOWN, SPACE_KEY, ']'];

export const DASH = '-';
export const FORWARD_SLASH = '/';

export const SCORE_JOINER = DASH;
export const MATCH_TIEBREAK_JOINER = DASH;
export const ALTERNATE_JOINERS = [FORWARD_SLASH];

export const ZERO = 0;
export const TEST = ['=', '+', 'num_1', 'num_2', 'shift+=', 'shift+-'];
export const SIDE1KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].concat(OUTCOMEKEYS);
export const SIDE2KEYS = SIDE1KEYS.map((key) => `shift+${key}`);
export const MODIFIERS = [SCORE_JOINER, BACKSPACE].concat(CLOSERS, ALTERNATE_JOINERS);
export const VALID_VALUE_KEYS = [SIDE1KEYS, SIDE2KEYS, MODIFIERS].join(',');
// Each key once: MODIFIERS already carries MOVEUP and MOVEDOWN (through CLOSERS), and a hotkey library that
// registers every occurrence runs its handler twice for a key named twice.
export const HOTKEYS = [...new Set([VALID_VALUE_KEYS, MOVEUP, MOVEDOWN, TEST].join(',').split(','))].join(',');

// for testing purposes; side keys overrepresented
export const SCORE_TEST_KEYS = [].concat(
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  ...SIDE1KEYS,
  ...SIDE1KEYS,
  ...MODIFIERS,
  ...SIDE1KEYS,
  ...SIDE1KEYS,
  ...SIDE1KEYS,
  ...SIDE1KEYS,
  ...SIDE1KEYS,
  ...SIDE1KEYS,
);

export const keyValueConstants = {
  OUTCOMEKEYS,
  SIDE1KEYS,
  SIDE2KEYS,
  MODIFIERS,
  PROMPT,
  MOVEUP,
  MOVEDOWN,
  HOTKEYS,
};
