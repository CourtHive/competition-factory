import { numericSort } from '@Tools/sorting';
import { unique } from '@Tools/arrays';

// constants
import { MISSING_DRAW_POSITIONS, MISSING_VALUE } from '@Constants/errorConditionConstants';

export function getRoundRobinGroupMatchUps({ drawPositions }) {
  if (!drawPositions?.length) return { error: MISSING_DRAW_POSITIONS };
  const positionMatchUps = (position) => {
    return drawPositions.filter((p) => p !== position).map((o) => [position, o]);
  };
  const groupMatchUps = [].concat(...(drawPositions ?? []).map(positionMatchUps));

  const uniqueMatchUpGroupings = unique(groupMatchUps.map(drawPositionsHash)).map((h) => h.split('|').map((p) => +p));

  return { groupMatchUps, uniqueMatchUpGroupings };
}

export function drawPositionsHash(drawPositions = []) {
  if (!Array.isArray(drawPositions) || !drawPositions.length) return '';
  return [...drawPositions].sort(numericSort).join('|');
}

export function groupRounds({ groupSize, drawPositionOffset }) {
  if (!groupSize) return [];
  const numArr = (count) => [...Array(count)].map((_, i) => i);
  const groupPositions: number[] = numArr(2 * Math.round(groupSize / 2) + 1).slice(1);
  const rounds: any[] = numArr(groupPositions.length - 1).map(() => []);

  let aRow = groupPositions.slice(0, groupPositions.length / 2);
  let bRow = groupPositions.slice(groupPositions.length / 2);

  groupPositions.slice(1).forEach((_, i) => {
    aRow.forEach((_, j) => {
      rounds[i].push([aRow[j], bRow[j]]);
    });
    const aHead = aRow.shift();
    const aDown = aRow.pop();
    const bUp = bRow.shift();
    aRow = [aHead, bUp, ...aRow].filter(Boolean) as number[];
    bRow = [...bRow, aDown].filter(Boolean) as number[];
  });

  const aHead = aRow.shift();
  const aDown = aRow.pop();
  const bUp = bRow.shift();
  aRow = [aHead, bUp, ...aRow].filter(Boolean) as number[];
  bRow = [...bRow, aDown].filter(Boolean) as number[];

  const sum = (x) => x[0].reduce((a, b) => a + b);
  return [...rounds]
    .reverse()
    .sort((a, b) => sum(a) - sum(b))
    .map((round) =>
      round
        .filter((groupPositions) => groupPositions.every((position) => position <= groupSize))
        .map((groupPositions) => {
          const drawPositions = groupPositions.map((groupPosition) => groupPosition + drawPositionOffset);
          return drawPositionsHash(drawPositions);
        }),
    );
}

export function determineRoundNumber({ rounds, hash }) {
  if (!rounds?.length) return { error: MISSING_VALUE };
  return rounds?.reduce((p, round, i) => (round.includes(hash) ? i + 1 : p), undefined);
}

export const roundRobinGroups = {
  getRoundRobinGroupMatchUps,
  determineRoundNumber,
  drawPositionsHash,
  groupRounds,
};
