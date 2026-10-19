import { segmentConforms, playSteps, steps } from '../../testHarness/scoringConformance/segments';
import { conforms, games } from '../../testHarness/scoringConformance/conformance';
import { describe, expect, it } from 'vitest';

/*
 * Conformance: tie-break sets whose final segment is of another kind (timed, outs), and a match spec
 * carrying a modifier the parser does not know.
 * Every expected outcome below is written from the rule or definition it cites, not recorded from the
 * engine. Sources:
 *
 * - ITF Rules of Tennis 2026, Rules 5, 6 and 7 for the ordinary sets.
 * - documentation/docs/codes/matchup-format.mdx: `-F:` "Final segment format (when different)";
 *   `T{minutes}` "Timed set (games-based)"; `T{minutes}P` "Timed set (points-based)"; `O{outs}`
 *   "Outs-based segment".
 * - documentation/docs/scoring-engine/format-support.md, "Input Levels": "A segment of outs has no
 *   point or game model here, so it is scored with set totals (addSet) … A final set of outs (-F:O3)
 *   refuses points only once it is the set in play."
 * - src/helpers/matchUpFormatCode/parse.ts, ParsedFormat: `matchMods` — "raw unknown modifiers for
 *   forward compat": kept, not scored.
 *
 * Stream tokens: runs of 1/2 are points; `|` ends the segment in play; `S:a-b` adds a set total.
 */

const SET_TO_LOVE = { 1: games('111111'), 2: games('222222') };
const ONE_SET_ALL = `${SET_TO_LOVE[1]} ${SET_TO_LOVE[2]}`;

describe('bestOf | standard(tiebreak) | final:timed(G) — SET3-S:6/TB7-F:T20', () => {
  const format = 'SET3-S:6/TB7-F:T20';

  it('Rule 7: two tie-break sets win before any final segment', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: the final is a timed games segment — seven love games do not close it', () => {
    segmentConforms(format, `${ONE_SET_ALL} g1111111`, {
      sets: [
        [6, 0],
        [0, 6],
        [7, 0],
      ],
      complete: false,
    });
  });

  it('engine-defined: when the final segment’s time is up the side with more games wins the match', () => {
    segmentConforms(format, `${ONE_SET_ALL} g12122 |`, {
      sets: [
        [6, 0],
        [0, 6],
        [2, 3],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('bestOf | standard(tiebreak) | final:timed(P) — SET3-S:6/TB7-F:T20P', () => {
  const format = 'SET3-S:6/TB7-F:T20P';

  it('engine-defined: the final segment counts points, not games: seven points are 7-0, still open', () => {
    segmentConforms(format, `${ONE_SET_ALL} 1111111`, {
      sets: [
        [6, 0],
        [0, 6],
        [7, 0],
      ],
      complete: false,
    });
  });

  it('engine-defined: at time the side ahead on points wins the match', () => {
    segmentConforms(format, `${ONE_SET_ALL} 11212 |`, {
      sets: [
        [6, 0],
        [0, 6],
        [3, 2],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('bestOf | standard(tiebreak) | final:outs — SET3-S:6/TB7-F:O3', () => {
  const format = 'SET3-S:6/TB7-F:O3';

  it('Rule 7: two tie-break sets, scored by points, win before the outs segment', () => {
    conforms(format, `${SET_TO_LOVE[2]} ${SET_TO_LOVE[2]}`, {
      sets: [
        [0, 6],
        [0, 6],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('engine-defined: at one set all the outs segment takes a set total; more runs win the match', () => {
    segmentConforms(format, `${ONE_SET_ALL} S:5-3`, {
      sets: [
        [6, 0],
        [0, 6],
        [5, 3],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: "a final set of outs refuses points only once it is the set in play"', () => {
    const engine = playSteps(format, steps(ONE_SET_ALL));
    expect(engine.getInputLevels()).toEqual({ point: false, game: false, set: true });
    expect(() => engine.addPoint({ winner: 0 })).toThrow();
    const fresh = playSteps(format, steps(SET_TO_LOVE[1]));
    expect(fresh.getInputLevels()).toEqual({ point: true, game: true, set: true });
  });
});

describe('bestOf | standard(tiebreak) | unknownModifiers — SET3Z-S:6/TB7', () => {
  const format = 'SET3Z-S:6/TB7';

  it('engine-defined: an unknown match modifier is kept, not scored: the match plays as SET3-S:6/TB7 (Rule 7)', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
    conforms(format, `${ONE_SET_ALL} ${SET_TO_LOVE[2]}`, {
      sets: [
        [6, 0],
        [0, 6],
        [0, 6],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('Rule 5(b): at six games all a tie-break decides the set', () => {
    conforms(format, `${games('121212121212')} 1111111`, { sets: [[7, 6, [7, 0]]], complete: false });
  });
});
