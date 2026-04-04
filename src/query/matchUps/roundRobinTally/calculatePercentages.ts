import { parse } from '@Helpers/matchUpFormatCode/parse';

export function calculatePercentages({
  participantResults,
  groupingTotal,
  matchUpFormat,
  tallyPolicy,
  totalGames,
  perPlayer,
  totalSets,
}) {
  const parsedGroupMatchUpFormat = (matchUpFormat && parse(matchUpFormat)) ?? {};
  const bestOfGames = parsedGroupMatchUpFormat.bestOf;
  const bracketSetsToWin = (bestOfGames && Math.ceil(bestOfGames / 2)) || 1;
  const bracketGamesForSet = parsedGroupMatchUpFormat.setFormat?.setTo;
  const precision = Math.pow(10, tallyPolicy?.precision || 3);

  Object.keys(participantResults).forEach((participantId) => {
    const setsWon = participantResults[participantId].setsWon;
    const setsLost = participantResults[participantId].setsLost;
    const setsTotal =
      tallyPolicy?.groupTotalSetsPlayed || groupingTotal === 'setsPct'
        ? totalSets
        : perPlayer * (bracketSetsToWin || 0) || setsWon + setsLost;
    let setsPct = Math.round((setsWon / setsTotal) * precision) / precision;
    if (setsPct === Infinity || Number.isNaN(setsPct)) setsPct = setsTotal;

    const tieMatchUpsWon = participantResults[participantId].tieMatchUpsWon;
    const tieMatchUpsLost = participantResults[participantId].tieMatchUpsLost;
    const tieMatchUpsTotal = tieMatchUpsWon + tieMatchUpsLost;
    let tieMatchUpsPct = Math.round((tieMatchUpsWon / tieMatchUpsTotal) * precision) / precision;
    if (tieMatchUpsPct === Infinity || Number.isNaN(tieMatchUpsPct)) tieMatchUpsPct = tieMatchUpsWon;

    const matchUpsWon = participantResults[participantId].matchUpsWon;
    const matchUpsLost = participantResults[participantId].matchUpsLost;
    const matchUpsTotal = matchUpsWon + matchUpsLost;
    let matchUpsPct = Math.round((matchUpsWon / matchUpsTotal) * precision) / precision;
    if (matchUpsPct === Infinity || Number.isNaN(matchUpsPct)) matchUpsPct = matchUpsWon;

    const gamesWon = participantResults[participantId].gamesWon || 0;
    const gamesLost = participantResults[participantId].gamesLost || 0;
    const minimumExpectedGames = (perPlayer || 0) * (bracketSetsToWin || 0) * (bracketGamesForSet || 0);
    const gamesTotal =
      tallyPolicy?.groupTotalGamesPlayed || groupingTotal === 'gamesPct'
        ? totalGames
        : Math.max(minimumExpectedGames, gamesWon + gamesLost);
    let gamesPct = Math.round((gamesWon / gamesTotal) * precision) / precision;
    if (gamesPct === Infinity || Number.isNaN(gamesPct)) gamesPct = 0;

    const pointsTotal = participantResults[participantId].pointsWon + participantResults[participantId].pointsLost;
    let pointsPct = Math.round((participantResults[participantId].pointsWon / pointsTotal) * precision) / precision;
    if (pointsPct === Infinity || Number.isNaN(pointsPct)) pointsPct = 0;

    participantResults[participantId].setsWon = setsWon;
    participantResults[participantId].setsLost = setsLost;
    participantResults[participantId].setsPct = setsPct;
    participantResults[participantId].tieMatchUpsWon = tieMatchUpsWon;
    participantResults[participantId].tieMatchUpsPct = tieMatchUpsPct;
    participantResults[participantId].matchUpsPct = matchUpsPct;
    participantResults[participantId].gamesWon = gamesWon;
    participantResults[participantId].gamesLost = gamesLost;
    participantResults[participantId].gamesPct = gamesPct;
    participantResults[participantId].pointsPct = pointsPct;
    participantResults[participantId].result =
      `${participantResults[participantId].matchUpsWon}/${participantResults[participantId].matchUpsLost}`;
  });
}
