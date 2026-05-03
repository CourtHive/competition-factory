import { COMPETITIVE, DECISIVE, ROUTINE, WALKOVER } from '@Constants/statsConstants';

const add = (a, b) => (a || 0) + (b || 0);

export function getBand(spread: number | number[] | undefined, bandProfiles: { [key: string]: number }) {
  const spreadValue = Array.isArray(spread) ? spread[0] : spread;
  if (spreadValue === undefined || Number.isNaN(spreadValue)) return WALKOVER;
  return (
    (spreadValue <= bandProfiles[DECISIVE] && DECISIVE) ||
    (spreadValue <= bandProfiles[ROUTINE] && ROUTINE) ||
    COMPETITIVE
  );
}

export function getScoreComponents({ score }) {
  const sets = score?.sets ?? [];

  const games = sets.reduce(
    (p, c) => {
      p[0] += c.side1Score || 0;
      p[1] += c.side2Score || 0;
      return p;
    },
    [0, 0],
  );
  const stb = sets.reduce(
    (p, c) => {
      p[0] += c.side1TiebreakScore || 0;
      p[1] += c.side2TiebreakScore || 0;
      return p;
    },
    [0, 0],
  );

  // add an extra game to the winner of tiebreak
  if (stb.reduce(add)) {
    games[stb[0] > stb[1] ? 0 : 1] += 1;
  }

  return { sets, games, score };
}

function gamesPercent(scoreComponents): number | undefined {
  const games = scoreComponents?.games;
  if (!games?.length) return undefined;
  const maxGames = Math.max(...games);
  if (maxGames === 0) return undefined;
  const minGames = Math.min(...games);
  return Math.round((minGames / maxGames) * 100);
}

export function pctSpread(pcts): number[] {
  return pcts
    .map(gamesPercent)
    .filter((p): p is number => p !== undefined)
    .sort((a, b) => a - b)
    .map((p) => parseFloat(p.toFixed(2)));
}
