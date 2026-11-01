/**
 * The standings engine's own policy shape (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5). The stored policy stays the
 * `roundRobinTally` policy; `fromV1` normalises it into this, so every rule v1 applied implicitly is a visible field
 * here. The core reads only this shape.
 */

/**
 * How a two-participant head-to-head is read. RECORD: the participant with more wins over the other across every
 * meeting; level records do not split. FIRST_VICTORY is v1 (K1): any one victory, whichever participant is checked
 * first; it survives only so the frozen v1 behaviour stays expressible.
 */
export type HeadToHeadMode = 'FIRST_VICTORY' | 'RECORD';

export type StandingsDirective = {
  attribute: string;
  /** lower is better */
  reversed?: boolean;
  /** compute over only the matchUps among the set being sorted (the mini-league) */
  idsFilter?: boolean;
  /** percentages over the whole group's totals rather than the participant's own */
  groupTotals?: boolean;
  /** skipped when more participants than this are being sorted */
  maxParticipants?: number;
  /** skipped when fewer participants than this are being sorted (aggregate measures for three or more, A6) */
  minParticipants?: number;
  /**
   * applies only for these purposes (e.g. a promotion cut, A8) and/or only in this phase: FINAL criteria are skipped
   * while standings are provisional. A skipped directive is not reported.
   */
  when?: { purposes?: string[]; phase?: StandingsPhase };
  /** the sets this directive splits off skip the head-to-head directive when they are sorted */
  disableHeadToHead?: boolean;
  /** for attribute 'headToHead' */
  mode?: HeadToHeadMode;
  /**
   * a ratio measure with nothing lost: MAX (default) ranks it first, ZERO ranks it as 0, SKIP passes the directive over
   * for any set where it happens (spec § 5.10)
   */
  zeroDivision?: 'MAX' | 'ZERO' | 'SKIP';
};

export type StandingsPhase = 'PROVISIONAL' | 'FINAL';

/**
 * What a split does next (spec § 4). RESTART (default, v1): every part goes back to the first directive. CONTINUE: every
 * part continues with the next directive, except that a mini-league directive (`idsFilter`) is first re-applied to the
 * residue it leaves. EXTRACT_ONE: one leader is resolved per step and everyone else goes back to the first directive.
 */
export type SplitMode = 'RESTART' | 'CONTINUE' | 'EXTRACT_ONE';

/**
 * What happens to a set no directive splits. ADJUDICATE (default, v1): the set shares a place and an organiser's
 * `subOrderMap` may order it. SHARE: the place is shared and stays shared. LOT: a draw seeded by the caller's
 * `lotSeed`, reproducible from the seed.
 */
export type TerminalStep = 'ADJUDICATE' | 'SHARE' | 'LOT';

export type StandingsPolicy = {
  /** the measure every participant is first partitioned by, higher first */
  primary: string;
  /** applied in order to each set the primary measure leaves tied; the first that splits it wins */
  directives: StandingsDirective[];
  /**
   * v1 (K11): a directive's `disableHeadToHead` is honoured only when the stored policy declares a `headToHead`
   * object at all
   */
  honourDisableHeadToHead: boolean;
  /**
   * measures that disqualify: a participant with any (e.g. a walkover conceded) is ordered below every participant
   * with none, and the two sets are ordered separately (K8)
   */
  demote?: string[];
  onSplit?: SplitMode;
  terminal?: TerminalStep;
  /** decimal places ratios are compared to (default 3), or EXACT; the same rule the ledger's percentages use */
  precision?: number | 'EXACT';
};

/** the finishing record the core produces for one participant */
export type FinishingPosition = {
  participantId: string;
  resolved?: boolean;
  subGroup?: number[];
  position?: number;
  rankOrder?: number;
  groupOrder?: number;
  subOrder?: number;
  ties?: number;
  GEMscore?: number;
  /** a policy's `crossGroup` values for this participant, compared in order across groups (best finishers) */
  crossGroupValues?: number[];
  /** a SHARE terminal: the place stays shared, whatever an organiser's sub-order says */
  shared?: boolean;
};

/** one participant's ledger record: counters and derived measures by name, plus the opponents beaten */
export type ParticipantTally = { victories: string[]; [measure: string]: unknown };
export type ParticipantResults = Record<string, ParticipantTally>;

/** recomputes the per-participant results over a scope: the matchUps among `participantIds`, or all of them */
export type Recalculate = (params: { participantIds?: string[]; groupingTotal?: string }) => {
  participantResults?: ParticipantResults;
  error?: unknown;
};
