import { ensureInt } from '@Tools/ensureInt';

type SetComplementArgs = {
  lowValue?: string | number;
  tiebreakAt?: number;
  isSide1?: boolean;
  NoAD?: boolean;
  setTo: number;
  winBy?: number;
};

export const getSetComplement = (params: SetComplementArgs): number[] | false => {
  const { isSide1, lowValue, setTo, tiebreakAt, NoAD, winBy } = params;
  if (lowValue === undefined) return false;
  let valueAsNumber = ensureInt(lowValue);

  // Not necessary?
  if (valueAsNumber?.toString().length > 2) {
    valueAsNumber = Number.parseInt(valueAsNumber.toString().slice(0, 2));
  }

  if (tiebreakAt && tiebreakAt < setTo && valueAsNumber > tiebreakAt) {
    valueAsNumber = tiebreakAt;
  }

  let calculatedValue;
  // WB1 on a no-tiebreak set: first side to setTo wins; complement is always setTo
  // (e.g. TYPTI WB1 → 0–5, 4–5).
  if (!tiebreakAt && winBy === 1) {
    calculatedValue = setTo;
  } else if (NoAD && !tiebreakAt) {
    if (valueAsNumber > setTo) {
      calculatedValue = setTo;
    } else {
      calculatedValue = valueAsNumber < setTo ? setTo : setTo - 1;
    }
  } else {
    calculatedValue =
      (valueAsNumber + 1 < setTo && setTo) ||
      (tiebreakAt && tiebreakAt < setTo && valueAsNumber === tiebreakAt && setTo) ||
      (!tiebreakAt && valueAsNumber + 2) ||
      setTo + 1;
  }

  const side1Result = isSide1 ? valueAsNumber : calculatedValue;
  const side2Result = isSide1 ? calculatedValue : valueAsNumber;

  return [side1Result, side2Result];
};

type TiebreakComplementArgs = {
  lowValue?: number | string;
  tiebreakNoAd?: boolean;
  tiebreakTo: number;
  isSide1?: boolean;
};

export const getTiebreakComplement = (params: TiebreakComplementArgs): number[] | false => {
  const { isSide1, lowValue, tiebreakTo, tiebreakNoAd } = params;
  if (lowValue === undefined) return false;
  let valueAsNumber = typeof lowValue === 'string' ? Number.parseInt(lowValue) : lowValue;

  // Not necessary?
  // do not accept low values greater than two digits;
  if (valueAsNumber?.toString().length > 2) {
    valueAsNumber = Number.parseInt(valueAsNumber.toString().slice(0, 2));
  }

  // If NOAD low lowValue cannot be greater than tiebreakTo - 1
  if (tiebreakNoAd && valueAsNumber > tiebreakTo - 1) {
    valueAsNumber = tiebreakTo - 1;
  }

  const highValue = getHighTiebreakValue({
    lowValue: valueAsNumber,
    NoAD: tiebreakNoAd,
    tiebreakTo,
  });
  const side1Result = isSide1 ? valueAsNumber : highValue;
  const side2Result = isSide1 ? highValue : valueAsNumber;
  return [side1Result, side2Result];
};

type HighTiebreakValueArgs = {
  tiebreakTo: number;
  lowValue: number;
  NoAD?: boolean;
};

function getHighTiebreakValue(params: HighTiebreakValueArgs): number {
  const { lowValue, NoAD, tiebreakTo } = params;
  const winBy = NoAD ? 1 : 2;
  if (lowValue + 1 >= tiebreakTo) {
    return lowValue + winBy;
  }
  return tiebreakTo;
}

type MaxSetScoreArgs = {
  /** The opposing side's games, where known. A max can tighten once the opponent's score is in. */
  opponentScore?: number;
  /** Games at which a tiebreak is played, when the format has one. */
  tiebreakAt?: number;
  /** A tiebreak-only set (a match tiebreak) plays to this. */
  tiebreakTo?: number;
  /** No-advantage: the set is decided at `setTo` without a two-game margin. */
  NoAD?: boolean;
  /** Games required to win the set. Absent for a tiebreak-only or timed set. */
  setTo?: number;
  /** A timed set has no score ceiling at all. */
  timed?: boolean;
  /** Game margin required, where there is no tiebreak. 2 (advantage) unless the format says otherwise. */
  winBy?: number;
};

/**
 * The largest games score a side can legally reach under a set format, or `undefined` where no ceiling
 * exists.
 *
 * Written for score-ENTRY interfaces, which need to refuse a keystroke that cannot become a legal score
 * — a `44` in a set to six. `getSetComplement` answers the neighbouring question, what the other side
 * must have; this answers how large either side may get.
 *
 * ── `undefined` is a real answer, and the reason this belongs in the factory ──
 *
 * Three formats have NO maximum, and a consumer that assumes one will reject legitimate scores:
 *
 *   - a TIMED set — games accumulate until the clock stops, so 15-12 is ordinary;
 *   - an ADVANTAGE set (no tiebreak, win by two) — 1968 Wimbledon reached 24-22;
 *   - a TIEBREAK-ONLY set — a match tiebreak to ten can end 12-10 or 15-13.
 *
 * `courthive-components` hand-rolled this and returned a number in all three cases. Measured
 * 2026-09-27: for `SET1-S:TB10` it returned **7**, because it read `setTo` — which a tiebreak-only
 * format does not carry, its target being on `tiebreakSet.tiebreakTo` — and so capped a match tiebreak
 * to ten at seven games. That is live in the shipping scoring modal, which is what brought this here.
 *
 * ── Where a ceiling DOES exist ──
 *
 * With a tiebreak at `setTo`, the set can be tied there and decided by one more game: `setTo + 1`, so
 * seven for a set to six. With a tiebreak BELOW `setTo` (S:6/TB7@5) the tiebreak settles it before
 * either side passes `setTo`, so the ceiling is `setTo`. With no tiebreak and a one-game margin, first
 * past the post: `setTo`.
 *
 * `opponentScore` tightens it where the format allows a tiebreak: a side facing 3 cannot reach 7,
 * because 7 is only reachable through a tiebreak at `setTo`-all. This is what lets an interface refuse
 * an impossible pair as it is typed rather than validating it afterwards.
 */
export const getMaxSetScore = (params: MaxSetScoreArgs): number | undefined => {
  const { NoAD, opponentScore, setTo, tiebreakAt, tiebreakTo, timed, winBy } = params;

  // No ceiling: the clock decides, not the games.
  if (timed) return undefined;

  // A tiebreak-only set is played to `tiebreakTo` but must be WON BY TWO unless no-ad, so it can run
  // past its target indefinitely — 12-10, 15-13. No ceiling.
  if (tiebreakTo !== undefined && setTo === undefined) return undefined;

  if (setTo === undefined) return undefined;

  // ── No tiebreak: whether a ceiling exists at all depends on the margin ──
  //
  // Measured against `getSetComplement` on the same formats, because the two must agree:
  //
  //   - `S:6` (advantage) — a 5 completes to a **7**, so the set runs on. 1968 Wimbledon reached
  //     24-22. No ceiling.
  //   - `S:6NOAD` — a 5 completes to a **6**: no-advantage scoring settles it at `setTo` with a
  //     one-game margin, so `setTo` IS the ceiling.
  //   - a declared `WB1` — the same, by the format saying so outright.
  const margin = winBy ?? 2;
  if (!tiebreakAt) return NoAD || margin === 1 ? setTo : undefined;

  // A tiebreak BELOW setTo settles the set before either side passes setTo.
  if (tiebreakAt < setTo) return setTo;

  // A tiebreak AT setTo: the set can be tied there and taken by one more game — `setTo + 1`, whatever
  // else the format says.
  //
  // `NoAD` does NOT collapse this, and an earlier version of this function had it doing so: measured
  // 2026-09-27, `SET3-S:6NOAD/TB7` returned 6, which would refuse every legitimate 7-6 under a format
  // in wide use. On a set format `NoAD` is no-advantage GAME scoring — a game at deuce decided by one
  // point — and says nothing about how the SET ends. `getSetComplement`, asked the neighbouring
  // question about the same format, answers that a 6 completes to a 7; the two must not disagree.
  const ceiling = setTo + 1;

  // `setTo + 1` is reachable only THROUGH the tiebreak, which needs the opponent on `setTo` too. A side
  // facing 3 cannot reach 7.
  if (opponentScore !== undefined && opponentScore < setTo) return setTo;

  return ceiling;
};
