import { chunkArray, generateRange } from '@Tools/arrays';
import { numericSort } from '@Tools/sorting';

// constants
import { ADJACENT, CLUSTER, WATERFALL } from '@Constants/drawDefinitionConstants';

function getDivisions({ size }) {
  const divisions: number[] = [size];

  let division = size;
  while (division / 2 === Math.floor(division / 2)) {
    division = division / 2;
    divisions.push(division);
  }

  if (!divisions.includes(1)) divisions.push(1);

  divisions.sort(numericSort);
  divisions.reverse();
  return divisions;
}

type GenerateBlockPatternArgs = {
  positioning?: string;
  size: number;
};

export function getSubBlock({ blockPattern, index }) {
  let i = 0;
  for (const subBlock of blockPattern) {
    if (i === index) return subBlock;
    let j = 0;
    while (j < subBlock.length) {
      if (i === index) return subBlock;
      i += 1;
      j++;
    }
  }
}

export function generateBlockPattern({ positioning, size }: GenerateBlockPatternArgs): {
  divisionGroupings: number[][];
  divisions: number[];
} {
  const divisions = getDivisions({ size });
  const divisionGroupings: number[][] = [];
  const selected: number[] = [];

  const firstMember = (arr) => arr[0];
  const lastMember = (arr) => arr[arr.length - 1];
  const getMember = (arr, i) =>
    (positioning && [CLUSTER, ADJACENT, WATERFALL].includes(positioning) && i % 2
      ? lastMember(arr)
      : firstMember(arr)) || firstMember(arr);
  const noneSelected = (chunk, i) => {
    if (chunk.every((member) => !selected.includes(member))) {
      const member = getMember(chunk, i);
      selected.push(member);
      return member;
    }
  };
  const notSelected = (chunk) => {
    const notSelected = chunk.filter((member) => !selected.includes(member));
    if (notSelected.length) {
      selected.push(...notSelected);
      return notSelected;
    }
  };
  const select = (chunk, i) => {
    const member = getMember(chunk, i);
    if (!selected.includes(member)) {
      selected.push(member);
      return member;
    }
  };

  const range = generateRange(1, size + 1);

  for (const division of divisions) {
    if (division === 1) {
      const chunks = chunkArray(range, 2);
      // first check all pairs for pair that has no member included in selected
      const positions = chunks.map(noneSelected).filter(Boolean);
      if (positions.length) divisionGroupings.push(positions);
      // then return positions from each chunk which are not selected
      const lastPositions = chunks.flatMap(notSelected).filter(Boolean);
      if (lastPositions.length) divisionGroupings.push(lastPositions);
    } else {
      const chunks = chunkArray(range, division);
      const positions = chunks.map(select).filter(Boolean);
      if (positions.length) divisionGroupings.push(positions);
    }
  }

  return { divisions, divisionGroupings };
}
