import { isConvertableInteger } from '@Tools/math';

import { COMPLETED, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';

export function evaluateCollectionResult({
  collectionDefinition,
  groupValueNumbers,
  groupValueGroups,
  sideTieValues,
  tieMatchUps,
}) {
  const collectionMatchUps = tieMatchUps.filter(
    (matchUp) => matchUp.collectionId === collectionDefinition.collectionId,
  );

  const sideMatchUpValues: number[] = [0, 0];
  let sideCollectionValues: number[] = [0, 0];

  const allCollectionMatchUpsCompleted = collectionMatchUps.every((matchUp) =>
    completedMatchUpStatuses.includes(matchUp.matchUpStatus),
  );

  const {
    collectionValueProfiles,
    collectionGroupNumber,
    collectionValue,
    matchUpValue,
    winCriteria,
    scoreValue,
    setValue,
  } = collectionDefinition;

  const belongsToValueGroup = collectionGroupNumber && groupValueNumbers.includes(collectionGroupNumber);

  const sideWins = [0, 0];
  collectionMatchUps.forEach((matchUp) => {
    if (matchUp.winningSide) sideWins[matchUp.winningSide - 1] += 1;
  });

  accumulateMatchUpValues({
    collectionDefinition,
    collectionMatchUps,
    sideMatchUpValues,
    collectionValueProfiles,
    matchUpValue,
    scoreValue,
    setValue,
  });

  sideCollectionValues = applyCollectionValue({
    allCollectionMatchUpsCompleted,
    collectionDefinition,
    sideCollectionValues,
    belongsToValueGroup,
    sideMatchUpValues,
    groupValueGroups,
    collectionGroupNumber,
    collectionValue,
    matchUpValue,
    winCriteria,
    scoreValue,
    setValue,
    sideWins,
  });

  if (belongsToValueGroup) {
    groupValueGroups[collectionGroupNumber].sideWins[0] += sideWins[0] || 0;
    groupValueGroups[collectionGroupNumber].sideWins[1] += sideWins[1] || 0;
    groupValueGroups[collectionGroupNumber].allGroupMatchUpsCompleted =
      groupValueGroups[collectionGroupNumber].allGroupMatchUpsCompleted && allCollectionMatchUpsCompleted;
    groupValueGroups[collectionGroupNumber].matchUpsCount += collectionMatchUps.length;
  } else {
    sideCollectionValues.forEach((sideCollectionValue, i) => (sideTieValues[i] += sideCollectionValue || 0));
  }
}

function accumulateMatchUpValues({
  collectionDefinition,
  collectionMatchUps,
  sideMatchUpValues,
  collectionValueProfiles,
  matchUpValue,
  scoreValue,
  setValue,
}) {
  if (isConvertableInteger(matchUpValue)) {
    collectionMatchUps.forEach((matchUp) => {
      if (matchUp.winningSide) {
        sideMatchUpValues[matchUp.winningSide - 1] += matchUpValue;
      }
    });
  } else if (isConvertableInteger(setValue)) {
    collectionMatchUps.forEach((matchUp) => {
      matchUp.score?.sets?.forEach((set) => {
        if (set.winningSide) sideMatchUpValues[set.winningSide - 1] += setValue;
      });
    });
  } else if (isConvertableInteger(scoreValue)) {
    accumulateScoreValues({ collectionMatchUps, sideMatchUpValues });
  } else if (Array.isArray(collectionValueProfiles)) {
    accumulateProfileValues({ collectionMatchUps, collectionDefinition, sideMatchUpValues });
  }
}

function accumulateScoreValues({ collectionMatchUps, sideMatchUpValues }) {
  collectionMatchUps.forEach((matchUp) => {
    matchUp.score?.sets?.forEach((set) => {
      const { side1TiebreakScore = 0, side2TiebreakScore = 0, side1Score = 0, side2Score = 0 } = set;

      if (matchUp.matchUpStatus === COMPLETED || matchUp.winningSide || set.winningSide) {
        if (side1Score || side2Score) {
          sideMatchUpValues[0] += side1Score;
          sideMatchUpValues[1] += side2Score;
        } else if ((side1TiebreakScore || side2TiebreakScore) && set.winningSide) {
          sideMatchUpValues[set.winningSide - 1] += 1;
        }
      }
    });
  });
}

function accumulateProfileValues({ collectionMatchUps, collectionDefinition, sideMatchUpValues }) {
  collectionMatchUps.forEach((matchUp) => {
    if (matchUp.winningSide) {
      const collectionPosition = matchUp.collectionPosition;
      const positionValue = getCollectionPositionValue({
        collectionDefinition,
        collectionPosition,
      });

      if (isConvertableInteger(positionValue)) {
        sideMatchUpValues[matchUp.winningSide - 1] += positionValue;
      }
    }
  });
}

function applyCollectionValue({
  allCollectionMatchUpsCompleted,
  collectionDefinition,
  sideCollectionValues,
  belongsToValueGroup,
  sideMatchUpValues,
  groupValueGroups,
  collectionGroupNumber,
  collectionValue,
  matchUpValue,
  winCriteria,
  scoreValue,
  setValue,
  sideWins,
}) {
  if (isConvertableInteger(collectionValue)) {
    const collectionWinningSide = determineCollectionWinningSide({
      allCollectionMatchUpsCompleted,
      collectionDefinition,
      sideMatchUpValues,
      matchUpValue,
      winCriteria,
      scoreValue,
      setValue,
      sideWins,
    });

    if (collectionWinningSide) {
      if (belongsToValueGroup) {
        groupValueGroups[collectionGroupNumber].values[collectionWinningSide - 1] += collectionValue;
      } else {
        sideCollectionValues[collectionWinningSide - 1] += collectionValue;
      }
    }
  } else if (belongsToValueGroup) {
    groupValueGroups[collectionGroupNumber].values[0] += sideMatchUpValues[0] || 0;
    groupValueGroups[collectionGroupNumber].values[1] += sideMatchUpValues[1] || 0;
  } else {
    sideCollectionValues = sideMatchUpValues;
  }

  return sideCollectionValues;
}

function determineCollectionWinningSide({
  allCollectionMatchUpsCompleted,
  collectionDefinition,
  sideMatchUpValues,
  matchUpValue,
  winCriteria,
  scoreValue,
  setValue,
  sideWins,
}) {
  if (winCriteria?.aggregateValue) {
    if (allCollectionMatchUpsCompleted) {
      if (
        isConvertableInteger(matchUpValue || setValue || scoreValue) &&
        sideMatchUpValues[0] !== sideMatchUpValues[1]
      ) {
        return sideMatchUpValues[0] > sideMatchUpValues[1] ? 1 : 2;
      } else if (sideWins[0] !== sideWins[1]) {
        return sideWins[0] > sideWins[1] ? 1 : 2;
      }
    }
    return undefined;
  }

  if (winCriteria?.valueGoal) {
    return sideMatchUpValues.reduce((winningSide, side, i) => {
      return side >= winCriteria.valueGoal ? i + 1 : winningSide;
    }, 0);
  }

  const winGoal = Math.floor(collectionDefinition.matchUpCount / 2) + 1;
  return sideWins.reduce((winningSide, side, i) => {
    return side >= winGoal ? i + 1 : winningSide;
  }, 0);
}

function getCollectionPositionValue({ collectionDefinition, collectionPosition }) {
  const collectionValueProfiles = collectionDefinition.collectionValueProfiles ?? [];
  const profile = collectionValueProfiles?.find((profile) => profile.collectionPosition === collectionPosition);
  return profile?.matchUpValue;
}
