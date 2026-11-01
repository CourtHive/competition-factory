import { tallyParticipantResults as tallyParticipantResultsV1 } from './v1Reference/tallyParticipantResults';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { buildMatchUps, type CorpusResult } from './standingsFixtures';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_ROUND_ROBIN_TALLY_JTT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_JTT';
import { POLICY_ROUND_ROBIN_TALLY_TOC } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_TOC';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/**
 * The live standings engine against the frozen v1 copy (`./v1Reference`, see its README) over seeded random groups:
 * every output field must be identical. S1 restructures the engine without changing behaviour, and this is the proof
 * at scale; the corpus (`v1Corpus.ts`) is the proof by clause. A failure prints the seed, so a case replays exactly.
 */

const CASES = Number(process.env.STANDINGS_DIFFERENTIAL_CASES ?? 3000);

// mulberry32: small, fast, deterministic
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = ReturnType<typeof rng>;
const pick = <T>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)];
const chance = (random: Random, p: number) => random() < p;

const FORMATS = ['SET3-S:6/TB7', 'SET1-S:6/TB7', 'SET3-S:6/TB7-F:TB10', 'SET1-S:P32'] as const;
// few distinct set scores, so measures tie often and the sub-sort is exercised
const WON_SETS = ['6-0', '6-2', '6-4', '7-5'];
const LOST_SETS = ['4-6', '2-6'];
const PRIMARY_KEYS = [
  'tieMatchUpsWon',
  'tieSinglesWon',
  'tieDoublesWon',
  'matchUpsWon',
  'matchUpsDrawn',
  'standingsPoints',
  'pointsWon',
  'gamesWon',
  'setsWon',
  'gamesPct',
  'setsPct',
  'pointsPct',
  'matchUpsPct',
  'notAMeasure',
];
const DIRECTIVE_ATTRIBUTES = [
  'matchUpsPct',
  'matchUpsWon',
  'setsPct',
  'gamesPct',
  'pointsPct',
  'gamesWon',
  'gamesLost',
  'setsWon',
  'setsLost',
  'pointsWon',
  'tieMatchUpsWon',
  'allDefaults',
  'defaults',
  'walkovers',
  'retirements',
];
const PRESETS = [POLICY_ROUND_ROBIN_TALLY_DEFAULT, POLICY_ROUND_ROBIN_TALLY_JTT, POLICY_ROUND_ROBIN_TALLY_TOC];

const flip = (score: string) => score.replaceAll(/(\d+)-(\d+)/g, '$2-$1');

/** a score from the winner's view: straight sets or a three-setter, a match tiebreak where the format has one */
function winnerScore(random: Random, format: string) {
  if (format.startsWith('SET1')) return pick(random, WON_SETS);
  const straight = chance(random, 0.6);
  if (straight) return `${pick(random, WON_SETS)} ${pick(random, WON_SETS)}`;
  const decider = format.includes('F:TB10') ? '[10-7]' : pick(random, WON_SETS);
  return `${pick(random, WON_SETS)} ${pick(random, LOST_SETS)} ${decider}`;
}

function randomResult(random: Random, sides: [string, string], format: string): CorpusResult {
  const roll = random();
  const winningSide = chance(random, 0.5) ? 1 : 2;
  if (roll < 0.1) return { sides };
  if (roll < 0.17) return { sides, matchUpStatus: WALKOVER, winningSide };
  if (roll < 0.21) return { sides, matchUpStatus: DEFAULTED, winningSide };
  if (roll < 0.23) return { sides, matchUpStatus: DOUBLE_WALKOVER };
  if (format === 'SET1-S:P32') {
    if (chance(random, 0.25)) return { sides, sets: [[16, 16]] };
    const [won, lost] = pick(random, [
      [17, 15],
      [18, 14],
      [20, 12],
    ]);
    return { sides, sets: [winningSide === 1 ? [won, lost] : [lost, won]], winningSide };
  }
  if (roll < 0.28) {
    const partial = `${pick(random, WON_SETS)} 2-1`;
    return { sides, matchUpStatus: RETIRED, score: winningSide === 1 ? partial : flip(partial), winningSide };
  }
  const score = winnerScore(random, format);
  return { sides, score: winningSide === 1 ? score : flip(score), winningSide };
}

function randomDirective(random: Random) {
  return {
    attribute: pick(random, DIRECTIVE_ATTRIBUTES),
    ...(chance(random, 0.4) && { idsFilter: true }),
    ...(chance(random, 0.2) && { reversed: true }),
    ...(chance(random, 0.15) && { groupTotals: true }),
    ...(chance(random, 0.2) && { maxParticipants: pick(random, [2, 3]) }),
    ...(chance(random, 0.1) && { disableHeadToHead: true }),
  };
}

function randomPolicy(random: Random, format: string) {
  const roll = random();
  if (roll < 0.1) return undefined;
  if (roll < 0.4) return pick(random, PRESETS);
  const base = POLICY_ROUND_ROBIN_TALLY_DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY];
  const withPoints = format === 'SET1-S:P32' && chance(random, 0.5);
  return {
    [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
      ...base,
      groupOrderKey: pick(random, PRIMARY_KEYS),
      ...(chance(random, 0.7) && {
        tallyDirectives: Array.from({ length: 1 + Math.floor(random() * 5) }, () => randomDirective(random)),
      }),
      ...(chance(random, 0.2) && { headToHead: { disabled: true } }),
      ...(chance(random, 0.3) && { precision: pick(random, [1, 2, 4]) }),
      ...(withPoints && { outcomePoints: { win: 3, draw: 1, loss: 0 } }),
      ...(withPoints && chance(random, 0.5) && { drawCredit: pick(random, [0, 0.25, 1]) }),
      ...(chance(random, 0.15) && { excludeMatchUpStatuses: [RETIRED] }),
      ...(chance(random, 0.2) && { setsCreditForWalkovers: true, gamesCreditForWalkovers: true }),
      ...(chance(random, 0.1) && { setsCreditForRetirements: true, gamesCreditForRetirements: true }),
      ...(chance(random, 0.1) && { groupTotalGamesPlayed: true, groupTotalSetsPlayed: true }),
      ...(chance(random, 0.2) && { GEMscore: ['matchUpsPct', 'gamesPct'] }),
    },
  };
}

function randomCase(seed: number) {
  const random = rng(seed);
  const format = pick(random, FORMATS);
  const players = Array.from({ length: 3 + Math.floor(random() * 5) }, (_, i) => String.fromCodePoint(65 + i));
  const encounters = chance(random, 0.2) ? 2 : 1;
  const results: CorpusResult[] = [];
  for (let encounter = 0; encounter < encounters; encounter++) {
    for (let a = 0; a < players.length; a++) {
      for (let b = a + 1; b < players.length; b++) {
        results.push(randomResult(random, [players[a], players[b]], format));
      }
    }
  }
  const subOrderMap = chance(random, 0.2)
    ? Object.fromEntries(players.map((player, i) => [player, players.length - i]))
    : undefined;
  return {
    format,
    results,
    subOrderMap,
    perPlayer: chance(random, 0.1) ? players.length - 1 : undefined,
    policyDefinitions: randomPolicy(random, format),
    generateReport: chance(random, 0.1),
  };
}

describe('standings: live engine against the frozen v1', () => {
  it(`is identical over ${CASES} seeded random groups`, () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { format, results, ...params } = randomCase(seed);
      const matchUps = buildMatchUps({ results, format });
      const live = tallyParticipantResults({ ...params, matchUpFormat: format, matchUps: structuredClone(matchUps) });
      const reference = tallyParticipantResultsV1({
        ...params,
        matchUpFormat: format,
        matchUps: structuredClone(matchUps),
      });
      expect(live, `seed ${seed}`).toEqual(reference);
    }
  }, 300_000);
});
