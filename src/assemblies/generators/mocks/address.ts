import statesData from '../../../fixtures/data/territories.json';
import citiesData from '../../../fixtures/data/cities.json';
import { randomInt } from '@Tools/math';

import { generateRange, randomMember, shuffleArray } from '@Tools/arrays';

export function address() {
  return {
    city: cityMocks().cities[0],
    state: stateMocks().states[0],
    postalCode: postalCodeMocks().postalCodes[0],
  };
}

export function cityMocks({
  count = 1,
  participantsCount = 32,
  random,
}: { count?: number; participantsCount?: number; random?: () => number } = {}) {
  const shuffledCities = shuffleArray(citiesData, random);
  const candidateCities = shuffledCities.slice(0, count);

  // the following ensures that all of the generated items are used at least once
  const cities = generateRange(0, participantsCount).map((i) =>
    i < Math.min(count, shuffledCities.length) ? candidateCities[i] : randomMember(candidateCities, random),
  );
  return { cities };
}

export function stateMocks({
  count = 1,
  participantsCount = 32,
  random,
}: { count?: number; participantsCount?: number; random?: () => number } = {}) {
  const shuffledStates = shuffleArray(statesData, random);
  const candidateStates = shuffledStates.slice(0, count).flatMap((state) => Object.keys(state));

  // the following ensures that all of the generated items are used at least once
  const states = generateRange(0, participantsCount).map((i) =>
    i < Math.min(count, shuffledStates.length) ? candidateStates[i] : randomMember(candidateStates, random),
  );
  return { states };
}

export function postalCodeMocks({
  count = 1,
  participantsCount = 32,
  random,
}: { count?: number; participantsCount?: number; random?: () => number } = {}) {
  const candidatePostalCodes = generateRange(0, count).map(() =>
    generateRange(0, 5)
      .map(() => randomInt(0, 9, random))
      .join(''),
  );

  // the following ensures that all of the generated items are used at least once
  const postalCodes = generateRange(0, participantsCount).map((i) =>
    i < count ? candidatePostalCodes[i] : randomMember(candidatePostalCodes, random),
  );
  return { postalCodes };
}
