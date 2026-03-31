import { chunkArray, generateRange, overlap, randomPop, shuffleArray } from '@Tools/arrays';
import { getDrawPosition } from '@Functions/global/extractors';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { ensureInt } from '@Tools/ensureInt';

// Constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';

/**
 *
 * Provides an algorithmic approach to assigning drawPositions based on participant nomination of an arbitrary number of preferred positions.
 *
 * Resolves drawPositions for each structure participant based on arrays of preferred drawPositions
 * Can be used iteratively by including different collections of participantIds in each invocation
 *
 * Simple use case would be to pre-position all seeded participants, then pass all remaining participants
 * with their preferences into `resolveDrawPositions`
 *
 * Variations could include grouping participants into quarters based on rankings/ratings
 * and resolving drawPositions for each group in a sequence which gives preference to higher ranked/rated participants
 *
 * @param {object} participantFactors - { [participantId]: { preferences: [1, 2, 3] }} - the length of the preference array is arbitrary
 * @param {object[]} positionAssignments - object from target structure containing any already assigned positions
 * @returns {object} drawPositionResolutions = { [drawPosition]: participantId }
 *
 * ACKNOWLEDGEMENT: Inspired by commentary from Shannon Wrege relating to the ITA Kickoff Weekend draft
 */

export function resolveDrawPositions({
  positionAssignments,
  participantFactors,
  random,
}: {
  positionAssignments: any;
  participantFactors: any;
  random?: () => number;
}) {
  if (!participantFactors || !positionAssignments) return { error: MISSING_VALUE };
  // make a copy so that the original can be referenced
  let participantPreferences = makeDeepCopy(participantFactors, false, true);

  // create an array of all drawPositions in the target structure
  const drawPositions = positionAssignments.map(({ drawPosition }) => drawPosition);
  const unassignedDrawPositions = positionAssignments
    .filter((assignment) => !assignment.participantId && !assignment.bye && !assignment.qualifier)
    .map(getDrawPosition);

  let drawPositionResolutions;
  let remainingPreferences = true;
  // first attempt to resolve prioritized preferred drawPositions, e.g. first, second, third preference
  while (remainingPreferences) {
    ({ drawPositionResolutions, remainingPreferences, participantPreferences } = resolvePreferences({
      participantPreferences,
      drawPositionResolutions,
      random,
    }));
  }

  const resolvedDrawPositions = new Set(Object.keys(drawPositionResolutions).map((dp) => ensureInt(dp)));
  let remainingDrawPositions = unassignedDrawPositions.filter(
    (drawPosition) => !resolvedDrawPositions.has(drawPosition),
  );
  let unresolvedParticipantIds = Object.keys(participantPreferences);

  // now see if any of the remaining drawPositions are paired with original preferences
  // then see if any of the remaining drawPositions are in groups of 4, 8, 16 & etc.
  // so that the original preferences influence placement as much as possible

  const getBaseLog = (x, y) => Math.log(y) / Math.log(x);
  const chunkSizes = generateRange(1, getBaseLog(2, drawPositions?.length || 0) + 1).map((i) => Math.pow(2, i));

  const chunkResolution = {};
  for (const chunkSize of chunkSizes) {
    const targetChunks = chunkArray(drawPositions, chunkSize).filter((chunk) => overlap(chunk, remainingDrawPositions));
    const chunkMap = {};
    unresolvedParticipantIds.forEach((participantId) => {
      targetChunks.forEach((chunk) => {
        const chunkSignature = chunk.join('|');
        const hasOverlap = overlap(chunk, participantFactors[participantId].preferences);
        if (hasOverlap) {
          if (!chunkMap[chunkSignature]) chunkMap[chunkSignature] = [];
          chunkMap[chunkSignature].push(participantId);
        }
      });
    });
    const chunkSignatures = shuffleArray(Object.keys(chunkMap), random);
    chunkSignatures.forEach((chunkSignature) => {
      const candidates = chunkMap[chunkSignature].filter((participantId) =>
        unresolvedParticipantIds.includes(participantId),
      );
      while (candidates.length) {
        const participantId = randomPop(candidates, random);
        const drawPositions = chunkSignature
          .split('|')
          .map((dp) => ensureInt(dp))
          .filter((drawPosition) => remainingDrawPositions.includes(ensureInt(drawPosition)));
        if (drawPositions.length) {
          const drawPosition = randomPop(drawPositions, random);
          remainingDrawPositions = remainingDrawPositions.filter((dp) => dp !== drawPosition);
          unresolvedParticipantIds = unresolvedParticipantIds.filter((id) => id !== participantId);
          drawPositionResolutions[drawPosition] = participantId;
          const chunkSize = chunkSignature.split('|').length;
          if (!chunkResolution[chunkSize]) chunkResolution[chunkSize] = 0;
          chunkResolution[chunkSize] += 1;
        }
      }
    });
    if (!remainingDrawPositions.length) break;
  }

  const report: any = {
    chunkResolution,
  };

  // finally, if not all participantIds are resolved, assign at random
  if (unresolvedParticipantIds.length) {
    unresolvedParticipantIds.forEach((participantId) => {
      const drawPosition = randomPop(remainingDrawPositions, random);
      if (drawPosition) drawPositionResolutions[drawPosition] = participantId;
    });
    report.randomAssignment = unresolvedParticipantIds.length;
  }

  return { drawPositionResolutions, report };
}

function resolvePreferences({ participantPreferences, drawPositionResolutions = {}, random }) {
  // for all participantPreferences create a map of drawPositions to arrays of participantIds which have the drawPosition as first preference
  const drawPositionsMap = Object.keys(participantPreferences).reduce((dpm, participantId) => {
    const pp = participantPreferences[participantId];
    const firstPreference = pp.preferences[0];
    // there may be no preferences left!
    if (firstPreference) {
      if (!dpm[firstPreference]) dpm[firstPreference] = [];
      dpm[firstPreference].push(participantId);
    }
    return dpm;
  }, {});

  // select the drawPositions for which there is the least overlap in preferences
  // e.g. in the first pass expect there to be drawPositions for which there is no contention
  const minimumContentionCount = Math.min(
    ...Object.values(drawPositionsMap)
      .filter((f: any) => f.length)
      .map((v: any) => v.length),
  );
  const minimumContentionPositions = Object.keys(drawPositionsMap).filter(
    (drawPosition) =>
      drawPositionsMap[drawPosition].length &&
      minimumContentionCount &&
      drawPositionsMap[drawPosition].length === minimumContentionCount,
  );

  // award selected drawPositions to one of the contenders at random
  minimumContentionPositions.forEach((position) => {
    const candidates = drawPositionsMap[position];
    const selectedParticipantId = randomPop(candidates, random);
    drawPositionResolutions[position] = selectedParticipantId;
    // remove resolved participantIds from preferences
    delete participantPreferences[selectedParticipantId];
  });

  // now filter resolved positions from every participant's preferences
  // this has the effect of promoting preferences if first preferences are no longer available
  let remainingPreferences;
  Object.values(participantPreferences).forEach((pd: any) => {
    pd.preferences = pd.preferences.filter((dp) => {
      const notResolved = !minimumContentionPositions.includes(dp.toString());
      if (notResolved) remainingPreferences = true;
      return notResolved;
    });
  });

  return {
    drawPositionResolutions,
    remainingPreferences,
    participantPreferences,
  };
}
