/**
 * Generate Match Charting Project point rows for a given score.
 *
 * Every row carries the state BEFORE its point, as MCP charts do: `Set1`/`Set2` are sets won,
 * `Gm1`/`Gm2` games in the current set, `Pts` the points in the current game from the server's
 * perspective. Games are won to love by their winner, a tiebreak's loser takes their points first,
 * and the serve rotates as in tennis (alternating games; 1-2-2 in a tiebreak), so the engine's
 * replay reaches the same score the columns describe.
 */

import type { MCPPoint } from '@Validators/scoring/mcpParser';

// The header of MCP's published charting-*-points files
export const MCP_POINTS_HEADER = 'match_id,Pt,Set1,Set2,Gm1,Gm2,Pts,Gm#,TbSet,Svr,1st,2nd,Notes,PtWinner';

export interface ChartSet {
  games: [number, number];
  tiebreak?: [number, number];
}

const SERVER_WINS = ['0-0', '15-0', '30-0', '40-0'];
const RECEIVER_WINS = ['0-0', '0-15', '0-30', '0-40'];

/**
 * '6-4 3-6 7-6(3)' => [{ games: [6, 4] }, { games: [3, 6] }, { games: [7, 6], tiebreak: [7, 3] }]
 * The tiebreak is always winner-first: the loser's points are in the parentheses.
 */
export function parseSetScores(score: string): ChartSet[] {
  return score
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((setString) => {
      const match = /^(\d+)-(\d+)(?:\((\d+)\))?$/.exec(setString);
      if (!match) throw new Error(`Unparseable set score: ${setString}`);
      const games: [number, number] = [Number(match[1]), Number(match[2])];
      if (match[3] === undefined) return { games };
      const loserPoints = Number(match[3]);
      const winnerPoints = Math.max(7, loserPoints + 2);
      const tiebreak: [number, number] =
        games[0] > games[1] ? [winnerPoints, loserPoints] : [loserPoints, winnerPoints];
      return { games, tiebreak };
    });
}

class ChartBuilder {
  readonly points: MCPPoint[] = [];
  readonly sets: [number, number] = [0, 0];
  readonly games: [number, number] = [0, 0];
  gameNumber = 1;

  constructor(private readonly matchId: string) {}

  private gameServer(): 0 | 1 {
    return ((this.gameNumber - 1) % 2) as 0 | 1;
  }

  private push(server: 0 | 1, winner: 0 | 1, pts: string) {
    this.points.push({
      match_id: this.matchId,
      Pt: String(this.points.length + 1),
      Set1: String(this.sets[0]),
      Set2: String(this.sets[1]),
      Gm1: String(this.games[0]),
      Gm2: String(this.games[1]),
      Pts: pts,
      'Gm#': String(this.gameNumber),
      TbSet: 'True',
      Svr: String(server + 1),
      Ret: String(2 - server),
      '1st': winner === server ? '4*' : '4b2w@',
      '2nd': '',
      Notes: '',
      PtWinner: String(winner + 1),
      isAce: '',
      isDouble: '',
      isUnforced: '',
      isForced: '',
      isRallyWinner: '',
      rallyCount: '',
    });
  }

  game(winner: 0 | 1) {
    const server = this.gameServer();
    const progression = winner === server ? SERVER_WINS : RECEIVER_WINS;
    for (const pts of progression) this.push(server, winner, pts);
    this.games[winner]++;
    this.gameNumber++;
  }

  tiebreak(winner: 0 | 1, points: [number, number]) {
    const first = this.gameServer();
    const loser = (1 - winner) as 0 | 1;
    const sequence = [
      ...Array.from({ length: points[loser] }, () => loser),
      ...Array.from({ length: points[winner] }, () => winner),
    ];
    const tally: [number, number] = [0, 0];
    sequence.forEach((pointWinner, index) => {
      const server = index === 0 || Math.floor((index + 1) / 2) % 2 === 0 ? first : ((1 - first) as 0 | 1);
      const pts = server === 0 ? `${tally[0]}-${tally[1]}` : `${tally[1]}-${tally[0]}`;
      this.push(server, pointWinner, pts);
      tally[pointWinner]++;
    });
    this.games[winner]++;
    this.gameNumber++;
  }

  set({ games, tiebreak }: ChartSet) {
    const winner: 0 | 1 = games[0] > games[1] ? 0 : 1;
    const loser = (1 - winner) as 0 | 1;
    const loserGames = games[loser];
    const winnerGames = tiebreak ? games[winner] - 1 : games[winner];
    // The loser's games come first in each pair so the set never ends early
    for (let i = 0; i < loserGames; i++) {
      this.game(loser);
      this.game(winner);
    }
    for (let i = loserGames; i < winnerGames; i++) this.game(winner);
    if (tiebreak) this.tiebreak(winner, tiebreak);
    this.sets[winner]++;
    this.games[0] = 0;
    this.games[1] = 0;
  }
}

/**
 * Rows for a match that ends with the given score, e.g. generateChart(id, '6-4 3-6 7-6(3)').
 */
export function generateChart(matchId: string, score: string): MCPPoint[] {
  const builder = new ChartBuilder(matchId);
  for (const set of parseSetScores(score)) builder.set(set);
  return builder.points;
}

/**
 * Serialise rows under MCP's published header.
 */
export function chartToCSV(points: MCPPoint[]): string {
  const columns = MCP_POINTS_HEADER.split(',');
  const lines = points.map((point) => columns.map((column) => point[column]).join(','));
  return [MCP_POINTS_HEADER, ...lines].join('\n');
}
