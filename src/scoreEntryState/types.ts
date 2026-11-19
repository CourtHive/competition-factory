import type { OvertimeFormat } from '@Helpers/matchUpFormatCode/overtimeFormat';

/**
 * The value contracts of `tods-competition-factory/score-entry-state`.
 *
 * Score entry holds a SCORE STATE: what an operator has typed and chosen for one matchUp, before anything is submitted.
 * It holds no tournament, no matchUp record and no engine. A host supplies the format, any saved score or ending, and
 * the status restrictions its own `SCORE` action reported; the state engine answers what the result would be.
 */

/** Which side: the side an ending happened to, a cell's side, or a winner. */
export type SideNumber = 1 | 2;

/**
 * One set in the shape the factory reads (`outcome.score.sets`, `generateScoreString`, `validateSetScore`).
 * A tiebreak-only set holds its points in the tiebreak fields and 0-0 games.
 */
export type ScoreEntrySet = {
  setNumber?: number;
  side1Score?: number;
  side2Score?: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  side1PointScore?: string | number;
  side2PointScore?: string | number;
  winningSide?: number;
};

/**
 * A set format as `matchUpFormatCode.parse` emits it (`setFormat`, `finalSetFormat`, an overtime segment).
 *
 * `NoAD` is spelled as the parser spells it. A mirror that called it `noAd` once made every read of the flag answer
 * `undefined`, so no-advantage scoring was silently ignored.
 */
export type SetFormat = {
  setTo?: number;
  tiebreakAt?: number;
  /** No-advantage on the SET: with no tiebreak, the set ends at `setTo` without a two-game margin. */
  NoAD?: boolean;
  tiebreakFormat?: { tiebreakTo?: number; NoAD?: boolean };
  tiebreakSet?: { tiebreakTo?: number; NoAD?: boolean };
  timed?: boolean;
  minutes?: number;
  noTiebreak?: boolean;
  /** A game margin on a set with no tiebreak (`WB1`); omitted when 2. */
  winBy?: number;
  [key: string]: unknown;
};

/** A matchUp format, parsed, in the shape every score-entry rule reads. */
export type MatchUpConfig = {
  bestOf: number;
  exactly?: number;
  /** An aggregate format's `-F:` decider is set N + 1, which the factory places only when it sees this flag. */
  aggregate?: boolean;
  setFormat?: SetFormat;
  finalSetFormat?: SetFormat;
  /** `-O:`: periods past regulation while the aggregate is level. */
  overtimeFormat?: OvertimeFormat;
};
