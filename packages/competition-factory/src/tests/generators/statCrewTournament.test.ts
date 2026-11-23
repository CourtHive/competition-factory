import { generateStatCrew } from '@Generators/tournamentRecords/generateStatCrew';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * In the tournament path every team matchUp is its own <tngame>, so a team's score, its singles/doubles totals and
 * its players' records must come from THAT matchUp alone. Before the fix a team that won no tieMatchUps reported the
 * sum of its other matchUps (9 instead of 0), and its totals counted every matchUp it had played.
 */
function teamsOf(game) {
  return game.childArray.filter((child) => child.team).map(({ team }) => team);
}

function totalsOf(team) {
  const [{ singles }, { doubles }] = team.totals;
  return { won: singles.won + doubles.won, lost: singles.lost + doubles.lost };
}

function playerTotalsOf(team) {
  return team.childArray.reduce(
    (sum, { player }) => ({
      singles: sum.singles + player.singles.won,
      doubles: sum.doubles + player.doubles.won,
    }),
    { singles: 0, doubles: 0 },
  );
}

describe('generateStatCrew tournament path', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    completeAllMatchUps: true,
    randomWinningSide: false,
  });
  const result: any = generateStatCrew({ tournamentRecord });

  it('reports one game per team matchUp', () => {
    expect(result.success).toEqual(true);
    expect(result.json).toHaveLength(3);
  });

  it('scores each team by the tieMatchUps it won in that game, 0 included', () => {
    for (const game of result.json) {
      const tieMatchUpsCount = game.singles_matches.length + game.doubles_matches.length;
      const scores = teamsOf(game).map((team) => team.score);
      // side 1 wins every tieMatchUp, so every game is a whitewash
      expect(scores.toSorted((a, b) => a - b)).toEqual([0, tieMatchUpsCount]);
    }
  });

  it('totals count only the tieMatchUps of that game', () => {
    for (const game of result.json) {
      const tieMatchUpsCount = game.singles_matches.length + game.doubles_matches.length;
      for (const team of teamsOf(game)) {
        const { won, lost } = totalsOf(team);
        expect(won + lost).toEqual(tieMatchUpsCount);
        expect(won).toEqual(team.score);
      }
    }
  });

  it("players' records come from that game", () => {
    for (const game of result.json) {
      for (const team of teamsOf(game)) {
        const [{ singles }, { doubles }] = team.totals;
        // each singles win is one player's; each doubles win is two players'
        expect(playerTotalsOf(team)).toEqual({ singles: singles.won, doubles: doubles.won * 2 });
      }
    }
  });
});
