import { parse } from '@Helpers/matchUpFormatCode/parse';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { Score } from '@Types/tournamentTypes';
import { Tally } from '@Types/factoryTypes';

type CountSetsArgs = {
  matchUpFormat?: string;
  matchUpStatus?: string;
  winningSide?: number;
  tallyPolicy?: any;
  score?: Score;
};

export function countSets({
  winningSide: matchUpWinningSide,
  matchUpFormat = FORMAT_STANDARD,
  matchUpStatus,
  tallyPolicy,
  score,
}: CountSetsArgs) {
  const setsTally: Tally = [0, 0];
  const sets = score?.sets;
  const matchUpWinnerIndex = typeof matchUpWinningSide === 'number' && matchUpWinningSide - 1;
  const parsedMatchUpFormat = parse(matchUpFormat);
  const setsToWin = getSetsToWin(parsedMatchUpFormat?.bestOf ?? 1);

  if (
    typeof matchUpWinnerIndex === 'number' &&
    ((matchUpStatus === DEFAULTED && tallyPolicy?.setsCreditForDefaults) ||
      (matchUpStatus === WALKOVER && tallyPolicy?.setsCreditForWalkovers))
  ) {
    // in the case of WALKOVER or DEFAULT, matchUp winner gets full sets to win value
    setsTally[matchUpWinnerIndex] = setsToWin;
  } else {
    for (const set of sets ?? []) {
      const { winningSide: setWinningSide } = set;
      if (setWinningSide) setsTally[setWinningSide - 1] += 1;
    }
  }
  if (typeof matchUpWinnerIndex === 'number' && matchUpStatus === RETIRED) {
    // if the loser has setsToWin then last set was incomplete and needs to be subtracted from loser
    if (+setsTally[1 - matchUpWinnerIndex] === setsToWin) setsTally[1 - matchUpWinnerIndex] -= 1;
    if (tallyPolicy?.setsCreditForRetirements) setsTally[matchUpWinnerIndex] = setsToWin;
  }
  return setsTally;
}

interface CountGames {
  matchUpFormat?: string;
  matchUpStatus?: string;
  winningSide?: number;
  tallyPolicy?: any;
  score: Score;
}

export function countGames({
  matchUpFormat = FORMAT_STANDARD,
  winningSide: matchUpWinningSide,
  matchUpStatus,
  tallyPolicy,
  score,
}: CountGames) {
  // IMPORTANT: recognize finalSetFormat
  const { sets } = score ?? {};
  if (!sets) return [0, 0];

  const matchUpWinnerIndex = typeof matchUpWinningSide === 'number' && matchUpWinningSide - 1;
  const parsedMatchUpFormat = parse(matchUpFormat);
  const bestOf = parsedMatchUpFormat?.bestOf ?? 1;
  const setsToWin = getSetsToWin(bestOf);
  const tiebreakAt = parsedMatchUpFormat?.setFormat?.tiebreakAt || 0;

  const gamesTally: number[][] = [[], []];

  if (
    typeof matchUpWinnerIndex === 'number' &&
    ((matchUpStatus === DEFAULTED && tallyPolicy?.gamesCreditForDefaults) ||
      (matchUpStatus === WALKOVER && tallyPolicy?.gamesCreditForWalkovers))
  ) {
    const gamesForSet = parsedMatchUpFormat?.setFormat?.setTo || 0;
    const minimumGameWins = setsToWin * gamesForSet;
    gamesTally[matchUpWinnerIndex].push(minimumGameWins);
  } else {
    sets.forEach((set, i) => {
      const setNumber = set.setNumber || i + 1;
      const whichFormat = setNumber > setsToWin && parsedMatchUpFormat?.finalSetFormat ? 'finalSetFormat' : 'setFormat';
      const based = parsedMatchUpFormat?.[whichFormat]?.based;
      const isTiebreakSet = parsedMatchUpFormat?.[whichFormat].tiebreakSet;

      const { side1Score, side2Score } = set;

      if (isGamesBased(based) && !isTiebreakSet) {
        gamesTally[0].push(ensureInt(side1Score || 0));
        gamesTally[1].push(ensureInt(side2Score || 0));
      }

      // count a tiebreak set also as a game won
      if (isTiebreakSet && set.winningSide && tallyPolicy?.gamesCreditForTiebreakSets !== false) {
        gamesTally[set.winningSide - 1].push(1);
      }
    });
  }

  if (matchUpStatus === RETIRED && typeof matchUpWinnerIndex === 'number') {
    // setFormat must consider whether retirment occurred in a finalSet which has a different format
    const whichFormat = sets.length > setsToWin && parsedMatchUpFormat?.finalSetFormat ? 'finalSetFormat' : 'setFormat';
    const format = parsedMatchUpFormat?.[whichFormat];

    if (isGamesBased(format.based)) {
      const gamesForSet = format?.setTo || 0;

      const getComplement = (value) => {
        if (!parsedMatchUpFormat || value === '') return;
        if (+value === tiebreakAt - 1 || +value === tiebreakAt) return ensureInt(tiebreakAt || 0) + 1;
        if (+value < tiebreakAt) return gamesForSet;
        return tiebreakAt;
      };

      const setsTally = countSets({
        winningSide: matchUpWinningSide,
        score: { sets },
        matchUpStatus,
        matchUpFormat,
        tallyPolicy,
      });

      const loserLeadSet = gamesTally
        .map((g) => g[matchUpWinnerIndex] <= g[1 - matchUpWinnerIndex])
        .reduce((a, b) => a + (b ? 1 : 0), 0);
      // if sets where loser lead > awarded sets, adjust last game to winner
      if (loserLeadSet > setsTally[1 - matchUpWinnerIndex]) {
        const talliedGames = gamesTally[matchUpWinnerIndex].length;
        const complement = getComplement(gamesTally[1 - matchUpWinnerIndex][talliedGames - 1]);
        if (complement) gamesTally[matchUpWinnerIndex][talliedGames - 1] = complement;
      }

      // if the gamesTally[x].length is less than the number of sets to win award gamesForSet to winner
      // gamesTally[x].length is an array of games won for each set, so length is number of sets
      if (setsToWin > gamesTally[matchUpWinnerIndex].length && tallyPolicy?.gamesCreditForRetirements) {
        gamesTally[matchUpWinnerIndex].push(gamesForSet);
      }
    }
  }

  return [gamesTally[0].reduce((a, b) => a + b, 0), gamesTally[1].reduce((a, b) => a + b, 0)];
}

export function countPoints({ matchUpFormat, score }: { matchUpFormat?: string; score: Score }): {
  pointsTally: Tally;
  tiebreaksTally: Tally;
} {
  const parsedMatchUpFormat = matchUpFormat ? parse(matchUpFormat) : undefined;
  const bestOf = parsedMatchUpFormat?.bestOf ?? 1;
  const setsToWin = getSetsToWin(bestOf);
  const tiebreaksTally: Tally = [0, 0];
  const pointsTally: Tally = [0, 0];

  score?.sets?.forEach((set, i) => {
    const setNumber = set.setNumber || i + 1;
    const whichFormat = setNumber > setsToWin && parsedMatchUpFormat?.finalSetFormat ? 'finalSetFormat' : 'setFormat';
    const based = parsedMatchUpFormat?.[whichFormat]?.based;

    if (isPointsBased(based)) {
      const { side1Score, side2Score } = set;
      if (side1Score) pointsTally[0] += ensureInt(side1Score || 0);
      if (side2Score) pointsTally[1] += ensureInt(side2Score || 0);
    } else {
      if (set.side1TiebreakScore) pointsTally[0] += ensureInt(set.side1TiebreakScore || 0);
      if (set.side2TiebreakScore) pointsTally[1] += ensureInt(set.side2TiebreakScore || 0);

      if ((set.side1TiebreakScore || set.side2TiebreakScore) && set.winningSide)
        tiebreaksTally[set.winningSide - 1] += 1;
    }
  });

  return { pointsTally, tiebreaksTally };
}

function getSetsToWin(bestOfGames) {
  return (bestOfGames && Math.ceil(bestOfGames / 2)) || 1;
}

function isPointsBased(based) {
  return based === 'P';
}

function isGamesBased(based) {
  return !isPointsBased(based);
}
