/**
 * The standings engine's own policy shape (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 5). The stored policy stays the
 * `roundRobinTally` policy; `fromV1` normalises it into this, so every rule v1 applied implicitly is a visible field
 * here. The core reads only this shape.
 */

/** how a two-participant head-to-head is read; v1 looks for one victory (K1), the record is S3 */
export type HeadToHeadMode = 'FIRST_VICTORY';

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
  /** the sets this directive splits off skip the head-to-head directive when they are sorted */
  disableHeadToHead?: boolean;
  /** for attribute 'headToHead' */
  mode?: HeadToHeadMode;
};

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
};

/** one participant's ledger record: counters and derived measures by name, plus the opponents beaten */
export type ParticipantTally = { victories: string[]; [measure: string]: unknown };
export type ParticipantResults = Record<string, ParticipantTally>;

/** recomputes the per-participant results over a scope: the matchUps among `participantIds`, or all of them */
export type Recalculate = (params: { participantIds?: string[]; groupingTotal?: string }) => {
  participantResults?: ParticipantResults;
  error?: unknown;
};
