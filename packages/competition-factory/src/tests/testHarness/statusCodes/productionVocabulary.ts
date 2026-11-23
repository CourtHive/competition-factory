/**
 * A deployed production `matchUpStatusCode` vocabulary — 29 codes across 5 populated categories.
 *
 * Captured 2026-09-11 from a deployed consumer's client bundle, where it drives their scoring modal.
 * It is substantially richer than `POLICY_SCORING_USTA`, which carries a handful of codes in a flat
 * map keyed by matchUpStatus: this has four fields per entry and a two-level category grouping.
 *
 * WHY IT IS HERE. These codes travel on `matchUp.matchUpStatusCodes`, the array that also carries
 * propagation provenance and `{ code }` wrappers. A coercion in `progressExitStatus` used to rewrite
 * EVERY object element of that array to `OUTCOME_WALKOVER` and persist the result — and
 * `updateMatchUpStatusCodes` wraps string codes as `{ code }` before stamping provenance on them, so
 * a real code could reach that coercion as an object and be relabelled. Recording `DQ`
 * (disqualification) or `WD.WD` (double withdrawal) as a walkover is a records problem, not a
 * cosmetic one.
 *
 * The tests consuming this assert that EVERY code survives EVERY shape it can legitimately take.
 * Adding a code here extends that coverage automatically.
 */
const DEFAULTS = 'Defaults';
const ILLNESS = 'Illness';
const INJURY = 'Injury';
const OTHER = 'Other';
const PERSONAL_CIRCUMSTANCE = 'Personal circumstance';
const RETIREMENTS = 'Retirements';
const WALKOVERS = 'Walkovers';
const WITHDRAWALS = 'Withdrawals';

export type ProductionStatusCode = {
  category: string;
  code: string;
  display: string;
  label: string;
};

export const PRODUCTION_STATUS_CODES: ProductionStatusCode[] = [
  {
    category: WALKOVERS,
    code: 'W1',
    display: 'Wo [inj]',
    label: INJURY,
  },
  {
    category: WALKOVERS,
    code: 'W2',
    display: 'Wo [ill]',
    label: ILLNESS,
  },
  {
    category: WALKOVERS,
    code: 'W3',
    display: 'Wo [pc]',
    label: PERSONAL_CIRCUMSTANCE,
  },
  {
    category: WALKOVERS,
    code: 'W4',
    display: 'Wo [Tae]',
    label: 'Tournament Administrative Error',
  },
  {
    category: WALKOVERS,
    code: 'W5',
    display: 'Wo/Withdrawn',
    label: 'Withdrawn',
  },
  {
    category: WALKOVERS,
    code: 'WOWO',
    display: 'Wo/Wo',
    label: 'Double walkover',
  },
  {
    category: DEFAULTS,
    code: 'D4',
    display: 'Def [refsl]',
    label:
      'Refusal to start match for reason other than adult discipline, injury, illness, or personal circumstance. (After the Referee has conclusively confirmed that a player refuses to play a match, the Referee need not wait until the scheduled time of the match to records the result.)',
  },
  {
    category: DEFAULTS,
    code: 'D5',
    display: 'Def [ad]',
    label: 'Failure to start match because of adult discipline',
  },
  {
    category: DEFAULTS,
    code: 'D6',
    display: 'Def [ns]',
    label: 'Not showing up',
  },
  {
    category: DEFAULTS,
    code: 'D7',
    display: 'Score + Def [late]',
    label:
      'Lateness for match including, but not limited to, intending to play but mistakenly arriving at the wrong time, location, or without proper equipment',
  },
  {
    category: DEFAULTS,
    code: 'D9',
    display: 'Def [refsl]',
    label:
      'Refusal to continue playing a match for reason other than injury, illness, personal circumstance, or adult discipline',
  },
  {
    category: DEFAULTS,
    code: 'DD',
    display: 'Def/Def',
    label: 'Double default',
  },
  {
    category: DEFAULTS,
    code: 'DI',
    display: 'Def [med]',
    label: 'Default for receiving an injection, IV, or supplemental oxygen',
  },
  {
    category: DEFAULTS,
    code: 'DM',
    display: 'Def [cond]',
    label: 'Misconduct before or between matches',
  },
  {
    category: DEFAULTS,
    code: 'DP',
    display: 'Def [pps]',
    label: 'Default under Point Penalty System',
  },
  {
    category: DEFAULTS,
    code: 'DQ',
    display: 'Def [dq]',
    label: 'Disqualification for cause or ineligibility',
  },
  {
    category: RETIREMENTS,
    code: 'RC',
    display: 'Ret [pc]',
    label: PERSONAL_CIRCUMSTANCE,
  },
  {
    category: RETIREMENTS,
    code: 'RD',
    display: 'Ret [ad]',
    label: 'Retirement because of adult discipline',
  },
  {
    category: RETIREMENTS,
    code: 'RI',
    display: 'Ret [ill]',
    label: ILLNESS,
  },
  {
    category: RETIREMENTS,
    code: 'RJ',
    display: 'Ret [inj]',
    label: INJURY,
  },
  {
    category: RETIREMENTS,
    code: 'RU',
    display: 'Ret [elg]',
    label:
      'A player who retires from a match remains eligible for consolations, place playoffs, doubles and subsequent round robin matches',
  },
  {
    category: OTHER,
    code: 'OA',
    display: 'Abandoned',
    label: 'Abandoned match',
  },
  {
    category: OTHER,
    code: 'OC',
    display: 'Unplayed or Cancelled',
    label: 'Cancelled match',
  },
  {
    category: OTHER,
    code: 'OI',
    display: 'Incomplete',
    label: 'Incomplete match',
  },
  {
    category: WITHDRAWALS,
    code: 'WD.ILL',
    display: 'Wd [ill]',
    label: ILLNESS,
  },
  {
    category: WITHDRAWALS,
    code: 'WD.INJ',
    display: 'Wd [inj]',
    label: INJURY,
  },
  {
    category: WITHDRAWALS,
    code: 'WD.PC',
    display: 'Wd [pc]',
    label: PERSONAL_CIRCUMSTANCE,
  },
  {
    category: WITHDRAWALS,
    code: 'WD.TAE',
    display: 'Wd [Tae]',
    label: 'Tournament Administrative Error',
  },
  {
    category: WITHDRAWALS,
    code: 'WD.WD',
    display: 'Wd/Wd',
    label: 'Double withdrawal',
  },
];

/** Codes grouped by the category the scoring modal files them under. */
export const PRODUCTION_STATUS_CODES_BY_CATEGORY: Record<string, ProductionStatusCode[]> =
  PRODUCTION_STATUS_CODES.reduce((grouped: Record<string, ProductionStatusCode[]>, entry) => {
    (grouped[entry.category] ??= []).push(entry);
    return grouped;
  }, {});
