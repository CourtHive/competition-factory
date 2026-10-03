import * as matchUpFormatCode from '@Assemblies/governors/matchUpFormatGovernor';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { describe, expect, it } from 'vitest';

// Helper: round-trip test (parse → stringify → compare) + validate
function expectRoundTrip(format: string, expectedObj?: object) {
  const parsed = matchUpFormatCode.parse(format);
  expect(parsed).toBeDefined();
  const stringified = matchUpFormatCode.stringify(parsed);
  expect(stringified).toEqual(format);
  expect(isValidMatchUpFormat({ matchUpFormat: format })).toEqual(true);
  if (expectedObj) expect(parsed).toEqual(expectedObj);
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// RACQUET SPORTS
// ─────────────────────────────────────────────────────────────

describe('Pickleball formats', () => {
  it('USA Pickleball standard: best of 3 games to 11', () => {
    expectRoundTrip('SET3-S:TB11', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('rally scoring to 11', () => {
    expectRoundTrip('SET3-S:TB11@RALLY', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11, modifier: 'RALLY' } },
    });
  });

  it('traditional pickleball to 15', () => {
    expectRoundTrip('SET3-S:TB15', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });

  it('no-deuce pickleball to 15', () => {
    expectRoundTrip('SET3-S:TB15NOAD', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 15, NoAD: true } },
    });
  });

  it('traditional pickleball to 21', () => {
    expectRoundTrip('SET3-S:TB21', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21 } },
    });
  });

  it('rally scoring to 21', () => {
    expectRoundTrip('SET3-S:TB21@RALLY', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21, modifier: 'RALLY' } },
    });
  });

  it('no-deuce rally scoring to 21', () => {
    expectRoundTrip('SET3-S:TB21NOAD@RALLY', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21, modifier: 'RALLY', NoAD: true } },
    });
  });

  it('MLP format: 4 games to 21, 5th to 15, rally scoring', () => {
    expectRoundTrip('SET5-S:TB21@RALLY-F:TB15@RALLY', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 21, modifier: 'RALLY' } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 15, modifier: 'RALLY' } },
    });
  });

  it('single game tiebreaker to 11', () => {
    expectRoundTrip('SET1-S:TB11', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('single game rally scoring to 11', () => {
    expectRoundTrip('SET1-S:TB11@RALLY', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 11, modifier: 'RALLY' } },
    });
  });

  it('no-deuce rally to 21 with tiebreaker to 15', () => {
    expectRoundTrip('SET3-S:TB21NOAD@RALLY-F:TB15NOAD@RALLY', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21, modifier: 'RALLY', NoAD: true } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 15, modifier: 'RALLY', NoAD: true } },
    });
  });
});

describe('Padel formats', () => {
  it('standard padel (same as tennis)', () => {
    expectRoundTrip('SET3-S:6/TB7', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    });
  });

  it('golden point padel (no advantage)', () => {
    expectRoundTrip('SET3-S:6NOAD/TB7', {
      bestOf: 3,
      setFormat: { setTo: 6, NoAD: true, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    });
  });

  it('short set padel', () => {
    expectRoundTrip('SET3-S:4/TB7', {
      bestOf: 3,
      setFormat: { setTo: 4, tiebreakAt: 4, tiebreakFormat: { tiebreakTo: 7 } },
    });
  });

  it('padel with match tiebreak final set', () => {
    expectRoundTrip('SET3-S:6/TB7-F:TB10', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    });
  });

  it('single set padel', () => {
    expectRoundTrip('SET1-S:6/TB7', {
      bestOf: 1,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    });
  });

  it('golden point padel with short sets and match tiebreak', () => {
    expectRoundTrip('SET3-S:4NOAD/TB5@3-F:TB10', {
      bestOf: 3,
      setFormat: { setTo: 4, NoAD: true, tiebreakAt: 3, tiebreakFormat: { tiebreakTo: 5 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    });
  });
});

describe('Padel Star Point formats (2026)', () => {
  it('standard padel with Star Point', () => {
    expectRoundTrip('SET3-S:6/TB7-G:TN3D', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      gameFormat: { type: 'TRADITIONAL', deuceAfter: 3 },
    });
  });

  it('padel with golden point (equivalent to NOAD)', () => {
    expectRoundTrip('SET3-S:6/TB7-G:TN1D', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      gameFormat: { type: 'TRADITIONAL', deuceAfter: 1 },
    });
  });

  it('timed padel with Star Point', () => {
    expectRoundTrip('SET3-S:T10-G:TN3D', {
      bestOf: 3,
      setFormat: { timed: true, minutes: 10 },
      gameFormat: { type: 'TRADITIONAL', deuceAfter: 3 },
    });
  });

  it('padel with match tiebreak final set and Star Point', () => {
    expectRoundTrip('SET3-S:6/TB7-G:TN3D-F:TB10', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      gameFormat: { type: 'TRADITIONAL', deuceAfter: 3 },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    });
  });
});

describe('Squash formats', () => {
  it('modern PAR-11: best of 5 to 11', () => {
    expectRoundTrip('SET5-S:TB11', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('women/junior squash: best of 3 to 11', () => {
    expectRoundTrip('SET3-S:TB11', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('old English scoring: best of 5 to 9', () => {
    expectRoundTrip('SET5-S:TB9', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 9 } },
    });
  });

  it('traditional hand-in scoring to 15', () => {
    expectRoundTrip('SET5-S:TB15', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });
});

describe('Badminton formats', () => {
  it('standard BWF: best of 3 games to 21', () => {
    expectRoundTrip('SET3-S:TB21', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21 } },
    });
  });

  it('single game badminton', () => {
    expectRoundTrip('SET1-S:TB21', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 21 } },
    });
  });

  it('shortened format to 11 (BWF experimental)', () => {
    expectRoundTrip('SET3-S:TB11', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('best of 5 games to 11 (BWF experimental)', () => {
    expectRoundTrip('SET5-S:TB11', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });
});

describe('Table Tennis formats', () => {
  it('standard: best of 5 games to 11', () => {
    expectRoundTrip('SET5-S:TB11', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('best of 3 games to 11 (shortened)', () => {
    expectRoundTrip('SET3-S:TB11', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('Olympic/World final: best of 7 games to 11 (FRM root)', () => {
    // bestOf 7 exceeds SET root limit (< 6), so use FRM root
    expectRoundTrip('FRM7-S:TB11', {
      matchRoot: 'FRM',
      bestOf: 7,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('old rules: best of 5 to 21', () => {
    expectRoundTrip('SET5-S:TB21', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 21 } },
    });
  });
});

describe('Racquetball formats', () => {
  it('standard: best of 3 to 15, tiebreaker to 11', () => {
    expectRoundTrip('SET3-S:TB15-F:TB11', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('pro racquetball: best of 5 to 15, tiebreaker to 11', () => {
    expectRoundTrip('SET5-S:TB15-F:TB11', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
  });

  it('single game to 15', () => {
    expectRoundTrip('SET1-S:TB15', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// TENNIS VARIANTS
// ─────────────────────────────────────────────────────────────

describe('TYPTI formats (Timed Yielding Points in Tennis Intervals)', () => {
  it('standard TYPTI: 5 sets to 5, 3 consecutive points/game', () => {
    expectRoundTrip('SET5-S:5-G:3C', {
      bestOf: 5,
      setFormat: { setTo: 5, noTiebreak: true },
      gameFormat: { type: 'CONSECUTIVE', count: 3 },
    });
  });

  it('shortened TYPTI: 3 sets to 4, 2 consecutive points/game', () => {
    expectRoundTrip('SET3-S:4-G:2C', {
      bestOf: 3,
      setFormat: { setTo: 4, noTiebreak: true },
      gameFormat: { type: 'CONSECUTIVE', count: 2 },
    });
  });

  it('extended TYPTI: 5 sets to 5, 4 consecutive points/game', () => {
    expectRoundTrip('SET5-S:5-G:4C', {
      bestOf: 5,
      setFormat: { setTo: 5, noTiebreak: true },
      gameFormat: { type: 'CONSECUTIVE', count: 4 },
    });
  });

  it('TYPTI with tiebreak: 3 sets to 4/TB5, 3 consecutive', () => {
    expectRoundTrip('SET3-S:4/TB5-G:3C', {
      bestOf: 3,
      setFormat: { setTo: 4, tiebreakAt: 4, tiebreakFormat: { tiebreakTo: 5 } },
      gameFormat: { type: 'CONSECUTIVE', count: 3 },
    });
  });

  it('single set TYPTI: 1 set to 5, 3 consecutive', () => {
    expectRoundTrip('SET1-S:5-G:3C', {
      bestOf: 1,
      setFormat: { setTo: 5, noTiebreak: true },
      gameFormat: { type: 'CONSECUTIVE', count: 3 },
    });
  });
});

describe('INTENNSE format', () => {
  it('standard: exactly 7 timed sets, aggregate, points-based', () => {
    expectRoundTrip('SET7XA-S:T10P', {
      exactly: 7,
      aggregate: true,
      setFormat: { timed: true, minutes: 10, based: 'P' },
    });
  });

  it('shortened: exactly 5 timed sets, aggregate, points-based', () => {
    expectRoundTrip('SET5XA-S:T10P', {
      exactly: 5,
      aggregate: true,
      setFormat: { timed: true, minutes: 10, based: 'P' },
    });
  });

  it('with traditional game format', () => {
    expectRoundTrip('SET3-S:T10-G:TN', {
      bestOf: 3,
      setFormat: { timed: true, minutes: 10 },
      gameFormat: { type: 'TRADITIONAL' },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// VOLLEYBALL
// ─────────────────────────────────────────────────────────────

describe('Volleyball formats', () => {
  it('indoor volleyball: best of 5 to 25, final to 15', () => {
    expectRoundTrip('SET5-S:TB25-F:TB15', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 25 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });

  it('beach volleyball: best of 3 to 21, final to 15', () => {
    expectRoundTrip('SET3-S:TB21-F:TB15', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 21 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });

  it('indoor volleyball: single set to 25', () => {
    expectRoundTrip('SET1-S:TB25', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 25 } },
    });
  });

  it('sitting volleyball: best of 5 to 25, final to 15 (same structure)', () => {
    expectRoundTrip('SET5-S:TB25-F:TB15', {
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 25 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// FENCING
// ─────────────────────────────────────────────────────────────

describe('Fencing formats', () => {
  it('pool bout: single game to 5 touches', () => {
    expectRoundTrip('SET1-S:TB5', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 5 } },
    });
  });

  it('direct elimination bout: single game to 15 touches', () => {
    expectRoundTrip('SET1-S:TB15', {
      bestOf: 1,
      setFormat: { tiebreakSet: { tiebreakTo: 15 } },
    });
  });

  it('team relay: best of 3 bouts to 5', () => {
    expectRoundTrip('SET3-S:TB5', {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 5 } },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// MULTI-SPORT (NON-SET ROOTS)
// ─────────────────────────────────────────────────────────────

describe('Soccer formats (HAL root)', () => {
  it('standard: 2 halves of 45 minutes, aggregate', () => {
    expectRoundTrip('HAL2A-S:T45', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 45 },
    });
  });

  it('youth: 2 halves of 30 minutes', () => {
    expectRoundTrip('HAL2A-S:T30', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 30 },
    });
  });

  it('youth (small-sided): 2 halves of 20 minutes', () => {
    expectRoundTrip('HAL2A-S:T20', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 20 },
    });
  });

  it('extra time: 2 halves of 15 minutes', () => {
    expectRoundTrip('HAL2A-S:T15', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 15 },
    });
  });
});

describe('Basketball formats (QTR root)', () => {
  it('NBA: 4 quarters of 12 minutes, aggregate', () => {
    expectRoundTrip('QTR4A-S:T12', {
      matchRoot: 'QTR',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 12 },
    });
  });

  it('FIBA: 4 quarters of 10 minutes, aggregate', () => {
    expectRoundTrip('QTR4A-S:T10', {
      matchRoot: 'QTR',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 10 },
    });
  });

  it('college (NCAA): 2 halves of 20 minutes', () => {
    expectRoundTrip('HAL2A-S:T20', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 20 },
    });
  });

  it('3x3 basketball: single 10-minute period', () => {
    expectRoundTrip('QTR1A-S:T10', {
      matchRoot: 'QTR',
      bestOf: 1,
      aggregate: true,
      setFormat: { timed: true, minutes: 10 },
    });
  });
});

describe('Ice Hockey formats (PER root)', () => {
  it('standard: 3 periods of 20 minutes, aggregate', () => {
    expectRoundTrip('PER3A-S:T20', {
      matchRoot: 'PER',
      bestOf: 3,
      aggregate: true,
      setFormat: { timed: true, minutes: 20 },
    });
  });

  it('overtime: single 5-minute period', () => {
    expectRoundTrip('PER1A-S:T5', {
      matchRoot: 'PER',
      bestOf: 1,
      aggregate: true,
      setFormat: { timed: true, minutes: 5 },
    });
  });
});

describe('Combat sports formats (RND root)', () => {
  it('boxing championship: 12 rounds of 3 minutes', () => {
    expectRoundTrip('RND12A-S:T3', {
      matchRoot: 'RND',
      bestOf: 12,
      aggregate: true,
      setFormat: { timed: true, minutes: 3 },
    });
  });

  it('boxing undercard: 4 rounds of 3 minutes', () => {
    expectRoundTrip('RND4A-S:T3', {
      matchRoot: 'RND',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 3 },
    });
  });

  it('boxing semi-pro: 6 rounds of 3 minutes', () => {
    expectRoundTrip('RND6A-S:T3', {
      matchRoot: 'RND',
      bestOf: 6,
      aggregate: true,
      setFormat: { timed: true, minutes: 3 },
    });
  });

  it('MMA standard: 3 rounds of 5 minutes', () => {
    expectRoundTrip('RND3A-S:T5', {
      matchRoot: 'RND',
      bestOf: 3,
      aggregate: true,
      setFormat: { timed: true, minutes: 5 },
    });
  });

  it('MMA championship: 5 rounds of 5 minutes', () => {
    expectRoundTrip('RND5A-S:T5', {
      matchRoot: 'RND',
      bestOf: 5,
      aggregate: true,
      setFormat: { timed: true, minutes: 5 },
    });
  });
});

describe('Handball formats (HAL root)', () => {
  it('standard: 2 halves of 30 minutes, aggregate', () => {
    expectRoundTrip('HAL2A-S:T30', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 30 },
    });
  });

  it('youth: 2 halves of 25 minutes', () => {
    expectRoundTrip('HAL2A-S:T25', {
      matchRoot: 'HAL',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 25 },
    });
  });
});

describe('Water Polo formats (QTR root)', () => {
  it('standard: 4 quarters of 8 minutes, aggregate', () => {
    expectRoundTrip('QTR4A-S:T8', {
      matchRoot: 'QTR',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 8 },
    });
  });
});

describe('Lacrosse formats (QTR root)', () => {
  it('field lacrosse: 4 quarters of 15 minutes, aggregate', () => {
    expectRoundTrip('QTR4A-S:T15', {
      matchRoot: 'QTR',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 15 },
    });
  });

  it('box lacrosse: 4 quarters of 15 minutes', () => {
    expectRoundTrip('QTR4A-S:T15', {
      matchRoot: 'QTR',
      bestOf: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 15 },
    });
  });
});

describe('Wrestling formats (PER root)', () => {
  it('freestyle/Greco-Roman: 2 periods of 3 minutes, aggregate', () => {
    expectRoundTrip('PER2A-S:T3', {
      matchRoot: 'PER',
      bestOf: 2,
      aggregate: true,
      setFormat: { timed: true, minutes: 3 },
    });
  });

  it('college wrestling: 3 periods (1st: 3 min, but simplified)', () => {
    expectRoundTrip('PER3A-S:T3', {
      matchRoot: 'PER',
      bestOf: 3,
      aggregate: true,
      setFormat: { timed: true, minutes: 3 },
    });
  });
});

describe('Esports formats (MAP root)', () => {
  it('CS2: best of 3 maps, 13 rounds per map', () => {
    expectRoundTrip('MAP3-S:TB13', {
      matchRoot: 'MAP',
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 13 } },
    });
  });

  it('CS2 Major final: best of 5 maps', () => {
    expectRoundTrip('MAP5-S:TB13', {
      matchRoot: 'MAP',
      bestOf: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 13 } },
    });
  });

  it('Valorant: best of 3 maps, 13 rounds per map', () => {
    expectRoundTrip('MAP3-S:TB13', {
      matchRoot: 'MAP',
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 13 } },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// WIFFLE BALL / BASEBALL (INN ROOT, OUTS-BASED)
// ─────────────────────────────────────────────────────────────

describe('Wiffle Ball / INN root formats', () => {
  it('BLW standard: 4 innings, 3 outs, aggregate (no time cap)', () => {
    expectRoundTrip('INN4XA-S:O3', {
      matchRoot: 'INN',
      exactly: 4,
      aggregate: true,
      setFormat: { outs: 3 },
    });
  });

  it('BLW full format: 4 innings, 3 outs, aggregate, 50-min match cap', () => {
    expectRoundTrip('INN4XA-S:O3-M:T50', {
      matchRoot: 'INN',
      exactly: 4,
      aggregate: true,
      setFormat: { outs: 3 },
      matchUpConstraint: { timed: true, minutes: 50 },
    });
  });

  it('World Wiffle Ball: 6 innings, 3 outs, aggregate', () => {
    expectRoundTrip('INN6XA-S:O3', {
      matchRoot: 'INN',
      exactly: 6,
      aggregate: true,
      setFormat: { outs: 3 },
    });
  });

  it('timed innings approximation (backward compat)', () => {
    expectRoundTrip('INN4XA-S:T12', {
      matchRoot: 'INN',
      exactly: 4,
      aggregate: true,
      setFormat: { timed: true, minutes: 12 },
    });
  });

  it('match constraint with tennis format (proves -M: is root-agnostic)', () => {
    expectRoundTrip('SET3-S:6/TB7-M:T120', {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      matchUpConstraint: { timed: true, minutes: 120 },
    });
  });

  it('rejects invalid outs-based formats', () => {
    expect(matchUpFormatCode.parse('INN4XA-S:O0')).toBeUndefined(); // O0 invalid (must start with 1-9)
    expect(matchUpFormatCode.parse('INN4XA-S:Oabc')).toBeUndefined(); // non-numeric
  });

  it('rejects invalid match constraint formats', () => {
    expect(matchUpFormatCode.parse('SET3-S:6/TB7-M:X50')).toBeUndefined(); // must start with T
    expect(matchUpFormatCode.parse('SET3-S:6/TB7-M:T0')).toBeUndefined(); // T0 invalid (getNumber returns 0 → falsy)
  });
});

// ─────────────────────────────────────────────────────────────
// EDGE CASES AND VALIDATION
// ─────────────────────────────────────────────────────────────

describe('Non-SET root high segment counts', () => {
  it('allows bestOf > 5 for non-SET roots', () => {
    // SET root would reject bestOf 7, but FRM/RND/etc. allow it
    expectRoundTrip('FRM7-S:TB11'); // table tennis Olympic
    expectRoundTrip('RND12A-S:T3'); // boxing 12 rounds
    expectRoundTrip('RND10A-S:T3'); // boxing 10 rounds
  });

  // CA, 2026-10-02: "I don't see why best of 7 or 9 would be rejected" — the SET root capped best-of below six
  it('SET root accepts any best-of count: best of seven, nine and six parse and round-trip', () => {
    expect(matchUpFormatCode.parse('SET7-S:TB11')).toEqual({
      bestOf: 7,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    });
    for (const code of ['SET7-S:TB11', 'SET9-S:6/TB7', 'SET7-S:6/TB7-F:TB10', 'SET6-S:6/TB7']) {
      expect(matchUpFormatCode.isValidMatchUpFormat({ matchUpFormat: code }), code).toBe(true);
      expect(matchUpFormatCode.stringify(matchUpFormatCode.parse(code)), code).toEqual(code);
    }
  });

  it('SET root allows large exactly counts for timed formats', () => {
    expectRoundTrip('SET7XA-S:T10P', {
      exactly: 7,
      aggregate: true,
      setFormat: { timed: true, minutes: 10, based: 'P' },
    });

    expectRoundTrip('SET10X-S:T5', {
      exactly: 10,
      setFormat: { timed: true, minutes: 5 },
    });
  });
});

describe('Invalid cross-sport formats', () => {
  it('rejects unknown roots', () => {
    expect(matchUpFormatCode.parse('GAME3-S:TB11')).toBeUndefined();
    expect(matchUpFormatCode.parse('INVALID3-S:T10')).toBeUndefined();
    expect(matchUpFormatCode.parse('XYZ2A-S:T45')).toBeUndefined();
  });

  it('rejects invalid -G: values', () => {
    expect(matchUpFormatCode.parse('SET3-S:5-G:INVALID')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:5-G:AGGR')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:5-G:0C')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:5-G:')).toBeUndefined();
  });

  it('rejects duplicate sections', () => {
    expect(matchUpFormatCode.parse('SET3-S:5-S:6')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:5-G:3C-G:4C')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:6/TB7-F:TB10-F:TB15')).toBeUndefined();
  });

  it('rejects missing S: section', () => {
    expect(matchUpFormatCode.parse('SET3-G:3C')).toBeUndefined();
    expect(matchUpFormatCode.parse('HAL2A-G:TN')).toBeUndefined();
  });

  it('rejects unknown section keys', () => {
    expect(matchUpFormatCode.parse('SET3-S:6/TB7-X:6/TB10')).toBeUndefined();
    expect(matchUpFormatCode.parse('SET3-S:6/TB7-P:5')).toBeUndefined();
  });

  it('rejects sections without colon', () => {
    expect(matchUpFormatCode.parse('SET3-S6/TB7')).toBeUndefined();
  });
});

describe('Cross-sport comprehensive round-trip', () => {
  const allFormats = [
    // Pickleball
    'SET3-S:TB11',
    'SET3-S:TB11@RALLY',
    'SET3-S:TB15',
    'SET3-S:TB15NOAD',
    'SET3-S:TB21',
    'SET3-S:TB21@RALLY',
    'SET3-S:TB21NOAD@RALLY',
    'SET5-S:TB21@RALLY-F:TB15@RALLY',
    'SET1-S:TB11@RALLY',
    // Padel
    'SET3-S:6/TB7',
    'SET3-S:6NOAD/TB7',
    'SET3-S:4/TB7',
    'SET3-S:6/TB7-F:TB10',
    // Padel Star Point
    'SET3-S:6/TB7-G:TN3D',
    'SET3-S:6/TB7-G:TN1D',
    'SET3-S:6/TB7-G:TN',
    'SET3-S:4-G:3C3D',
    // Squash
    'SET5-S:TB11',
    'SET5-S:TB9',
    // Badminton
    'SET3-S:TB21',
    // Table Tennis
    'SET5-S:TB11',
    'FRM7-S:TB11',
    // Racquetball
    'SET3-S:TB15-F:TB11',
    'SET5-S:TB15-F:TB11',
    // TYPTI
    'SET5-S:5-G:3C',
    'SET3-S:4-G:2C',
    'SET3-S:4/TB5-G:3C',
    // INTENNSE
    'SET7XA-S:T10P',
    'SET3-S:T10-G:TN',
    // Volleyball
    'SET5-S:TB25-F:TB15',
    'SET3-S:TB21-F:TB15',
    // Fencing
    'SET1-S:TB5',
    'SET1-S:TB15',
    // Soccer
    'HAL2A-S:T45',
    'HAL2A-S:T30',
    // Basketball
    'QTR4A-S:T12',
    'QTR4A-S:T10',
    // Ice Hockey
    'PER3A-S:T20',
    // Combat Sports
    'RND12A-S:T3',
    'RND3A-S:T5',
    'RND5A-S:T5',
    // Handball
    'HAL2A-S:T30',
    // Water Polo
    'QTR4A-S:T8',
    // Lacrosse
    'QTR4A-S:T15',
    // Wrestling
    'PER2A-S:T3',
    // Esports
    'MAP3-S:TB13',
    'MAP5-S:TB13',
    // Wiffle Ball
    'INN4XA-S:O3',
    'INN4XA-S:O3-M:T50',
    'INN6XA-S:O3',
    // Match constraint with tennis format
    'SET3-S:6/TB7-M:T120',
  ];

  it('all cross-sport formats round-trip and validate', () => {
    allFormats.forEach((format) => {
      const parsed = matchUpFormatCode.parse(format);
      expect(parsed, `parse failed for: ${format}`).toBeDefined();

      const stringified = matchUpFormatCode.stringify(parsed);
      expect(stringified, `stringify mismatch for: ${format}`).toEqual(format);

      const valid = isValidMatchUpFormat({ matchUpFormat: format });
      expect(valid, `isValidMatchUpFormat failed for: ${format}`).toEqual(true);

      // Double round-trip stability
      const reparsed = matchUpFormatCode.parse(stringified!);
      const restringified = matchUpFormatCode.stringify(reparsed);
      expect(restringified, `double round-trip failed for: ${format}`).toEqual(format);
    });
  });
});
