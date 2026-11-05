import { ratingsPolicies } from '@Fixtures/policies/ratingsPolicies';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';

// fixtures
import volleyballSeason from '../../fixtures/ratings/volleyballSeason.json';
import rugbySeason from '../../fixtures/ratings/rugbySeason.json';
import womenSeason from '../../fixtures/ratings/womenSeason.json';
import nflSeason from '../../fixtures/ratings/nflSeason.json';
import nbaSeason from '../../fixtures/ratings/nbaSeason.json';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';

/**
 * Anonymised public results, one competition stage per sport, replayed in order through the engine: each match added as
 * an ad-hoc pairing, its result recorded, and the ratings policy run on it with the ratings written back. The final
 * ratings must equal those of an independent implementation of each published method (fixture `expected`), and in the
 * point-exchange systems a winner must never lose points.
 */

type SeasonFixture = {
  description: string;
  policy: string;
  ratingType: string;
  matchUpFormat: string;
  start: number;
  starts?: Record<string, number>;
  teams: string[];
  matches: { sides: string[]; sets: number[][] }[];
  expected: Record<string, number>;
  kByTier?: Record<string, number>;
  tier?: { system: string; value: string };
};

const WINNER_NEVER_LOSES = new Set(['POLICY_RATINGS_WORLD_RUGBY', 'POLICY_RATINGS_FIVB']);

function replay(fixture: SeasonFixture) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: AD_HOC, drawSize: fixture.teams.length, roundsCount: 0, matchUpFormat: fixture.matchUpFormat },
    ],
  });
  if (fixture.tier) tournamentRecord.tournamentTier = fixture.tier;
  tournamentEngine.setState(tournamentRecord);

  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  const idOf = Object.fromEntries(fixture.teams.map((team, index) => [team, participantIds[index]]));
  const { ratingType } = fixture;
  const startOf = (team: string) => fixture.starts?.[team] ?? fixture.start;
  for (const team of fixture.teams) {
    tournamentEngine.setParticipantScaleItem({
      scaleItem: { scaleType: RATING, eventType: SINGLES_EVENT, scaleName: ratingType, scaleValue: startOf(team) },
      participantId: idOf[team],
    });
  }

  const ratingsPolicy = { ...ratingsPolicies[fixture.policy], ...(fixture.kByTier && { kByTier: fixture.kByTier }) };
  const current: Record<string, number> = Object.fromEntries(fixture.teams.map((team) => [team, startOf(team)]));
  const winnerChanges: number[] = [];

  for (const { sides, sets } of fixture.matches) {
    const participantIdPairings = [{ participantIds: [idOf[sides[0]], idOf[sides[1]]] as [string, string] }];
    const generated: any = tournamentEngine.generateAdHocMatchUps({ drawId, newRound: true, participantIdPairings });
    expect(tournamentEngine.addAdHocMatchUps({ drawId, matchUps: generated.matchUps }).success).toEqual(true);
    const matchUpId = generated.matchUps[0].matchUpId;
    const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
    // the generated matchUp may seat the pairing either way round
    const flipped = matchUp.sides[0].participantId !== idOf[sides[0]];
    const scored = sets.map(([a, b], index) => {
      const [side1Score, side2Score] = flipped ? [b, a] : [a, b];
      // a level set (a goalless segment) has no winner
      const setWinner = side1Score === side2Score ? undefined : (side1Score > side2Score && 1) || 2;
      return { setNumber: index + 1, side1Score, side2Score, winningSide: setWinner };
    });
    const totals = scored.reduce(([a, b], set) => [a + set.side1Score, b + set.side2Score], [0, 0]);
    const setsWon = scored.reduce(([a, b], set) => (set.winningSide === 1 ? [a + 1, b] : [a, b + 1]), [0, 0]);
    const counted = fixture.matchUpFormat.startsWith('SET5') ? setsWon : totals;
    let winningSide: number | undefined;
    if (counted[0] !== counted[1]) winningSide = counted[0] > counted[1] ? 1 : 2;
    const outcome = { matchUpStatus: COMPLETED, score: { sets: scored }, winningSide };
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);

    const result: any = scaleEngine.generateDynamicRatings({
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
      updateParticipantRatings: true,
      matchUpIds: [matchUpId],
      ratingsPolicy,
      ratingType,
    });
    expect(result.success).toEqual(true);
    tournamentEngine.setState(result.tournamentRecord ?? tournamentEngine.getTournament().tournamentRecord);

    const teamOf = (side: number) => ((side === 1) === !flipped ? sides[0] : sides[1]);
    for (const team of sides) {
      const value = result.modifiedScaleValues[idOf[team]].scaleValue;
      if (winningSide && team === teamOf(winningSide)) winnerChanges.push(value - current[team]);
      current[team] = value;
    }
  }
  return { current, winnerChanges };
}

describe.each([
  ['rugby union', rugbySeason],
  ['volleyball', volleyballSeason],
  ["women's football", womenSeason],
  ['American football', nflSeason],
  ['basketball', nbaSeason],
])('a %s season', (_, season) => {
  const fixture = season as SeasonFixture;

  it(`rates ${fixture.matches.length} results as the published method does`, () => {
    const { current, winnerChanges } = replay(fixture);
    // CONTROL: every team was rated and moved from its start
    expect(Object.keys(current).sort()).toEqual(Object.keys(fixture.expected).sort());
    expect(fixture.teams.some((team) => current[team] !== (fixture.starts?.[team] ?? fixture.start))).toEqual(true);
    for (const team of fixture.teams) expect(current[team]).toBeCloseTo(fixture.expected[team], 6);
    if (WINNER_NEVER_LOSES.has(fixture.policy)) expect(winnerChanges.every((change) => change > 0)).toEqual(true);
  });
});
