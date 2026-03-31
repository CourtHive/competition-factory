import { generateRange, shuffleArray } from '@Tools/arrays';
import namesData from '../../../fixtures/data/teams.json';

export function nameMocks({ nameRoot = 'TEAM', count = 1, random }: { nameRoot?: string; count?: number; random?: () => number } = {}) {
  const shuffledTeamNames = shuffleArray(namesData, random);
  const names = shuffledTeamNames.slice(0, count);
  if (names.length < count) {
    generateRange(0, count - names.length).forEach((i) => names.push(`${nameRoot} ${i + 1}`));
  }
  return { names };
}
