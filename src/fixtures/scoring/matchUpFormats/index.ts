export const FORMAT_STANDARD = 'SET3-S:6/TB7'; // Best of 3 Tiebreak Sets to 6
export const FORMAT_STANDARD_NOAD = 'SET3-S:6NOAD'; // Best of 3 NOAD Sets to 6 with deciding game at 5-5
export const FORMAT_ATP_DOUBLES = 'SET3-S:6NOAD/TB7-F:TB10'; // Best of 3 Sets to 6, no Ad, Final Set Tiebreak to 10
export const FORMAT_SHORT_SETS = 'SET3-S:4/TB7'; // Best of 3 Sets to 4
export const FORMAT_FAST4 = 'SET3-S:4/TB5@3'; // Best of 3 Sets to 4, Tiebreak at 3
export const FORMAT_GRAND_SLAM = 'SET5-S:6/TB7'; // Best of 5 Tiebreak Sets to 6
export const FORMAT_ONE_SET = 'SET1-S:6/TB7'; // One Tiebreak Set to 6
export const FORMAT_MATCH_TIEBREAK = 'SET1-S:TB10'; // One Set Match Tiebreak to 10
export const FORMAT_SET3_TB7 = 'SET3-S:6/TB7-F:TB7'; // Best of 3 Sets, Final Set Tiebreak to 7
export const TIMED20 = 'SET1-S:T20'; // Timed 20 minute set
export const FORMAT_PRO_SET = 'SET1-S:8/TB7'; // One Set to 8 with Advantage with tiebreak at 8-8
export const FORMAT_COLLEGE_PRO_SET = 'SET1-S:8/TB7@7'; // One Set to 8 with tiebreak at 7-7

// ── Pickleball ───────────────────────────────────────────────────────────────
// A pickleball game is a TIEBREAK SET: a race to a target, win by 2, with no games beneath it.
// The `@RALLY` modifier is scoring-significant — every rally scores regardless of who served —
// so the scoring engine skips server derivation for it. Without the modifier the format is
// traditional side-out scoring, where only the serving side can score. `NOAD` on a tiebreak set
// means sudden death at the target (win by 1) rather than win by 2.
export const FORMAT_PICKLEBALL = 'SET3-S:TB11'; // Best of 3 games to 11, win by 2, side-out
export const FORMAT_PICKLEBALL_RALLY = 'SET3-S:TB11@RALLY'; // Best of 3 games to 11, win by 2, rally
export const FORMAT_PICKLEBALL_15 = 'SET3-S:TB15'; // Best of 3 games to 15, win by 2, side-out
export const FORMAT_PICKLEBALL_15_RALLY = 'SET3-S:TB15@RALLY'; // Best of 3 games to 15, win by 2, rally
export const FORMAT_PICKLEBALL_21 = 'SET3-S:TB21'; // Best of 3 games to 21, win by 2, side-out
export const FORMAT_PICKLEBALL_21_RALLY = 'SET3-S:TB21@RALLY'; // Best of 3 games to 21, win by 2, rally
export const FORMAT_PICKLEBALL_SUDDEN_DEATH = 'SET3-S:TB11NOAD@RALLY'; // Best of 3 rally games to 11, win by 1
export const FORMAT_PICKLEBALL_SINGLE_GAME = 'SET1-S:TB11'; // One game to 11, win by 2, side-out
export const FORMAT_PICKLEBALL_BEST_OF_5 = 'SET5-S:TB11@RALLY'; // Best of 5 rally games to 11, win by 2

export const matchUpFormats = {
  FORMAT_STANDARD,
  FORMAT_STANDARD_NOAD,
  FORMAT_ATP_DOUBLES,
  FORMAT_SHORT_SETS,
  FORMAT_FAST4,
  FORMAT_GRAND_SLAM,
  FORMAT_ONE_SET,
  FORMAT_MATCH_TIEBREAK,
  FORMAT_SET3_TB7,
  FORMAT_PRO_SET,
  FORMAT_COLLEGE_PRO_SET,
  TIMED20,

  FORMAT_PICKLEBALL,
  FORMAT_PICKLEBALL_RALLY,
  FORMAT_PICKLEBALL_15,
  FORMAT_PICKLEBALL_15_RALLY,
  FORMAT_PICKLEBALL_21,
  FORMAT_PICKLEBALL_21_RALLY,
  FORMAT_PICKLEBALL_SUDDEN_DEATH,
  FORMAT_PICKLEBALL_SINGLE_GAME,
  FORMAT_PICKLEBALL_BEST_OF_5,
};
