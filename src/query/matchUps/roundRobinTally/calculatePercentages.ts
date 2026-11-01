import { parseTallyFormat } from './parseTallyFormat';

export function calculatePercentages({
  participantResults,
  groupingTotal,
  matchUpFormat,
  tallyPolicy,
  totalGames,
  perPlayer,
  totalSets,
}) {
  const parsedGroupMatchUpFormat = (matchUpFormat && parseTallyFormat(matchUpFormat)) ?? {};
  const bestOfGames = parsedGroupMatchUpFormat.bestOf;
  const bracketSetsToWin = (bestOfGames && Math.ceil(bestOfGames / 2)) || 1;
  const bracketGamesForSet = parsedGroupMatchUpFormat.setFormat?.setTo;
  // EXACT compares unrounded: IEEE division is correctly rounded, so equal fractions give equal values (spec § 5.10)
  const exact = tallyPolicy?.precision === 'EXACT';
  const precision = Math.pow(10, (!exact && tallyPolicy?.precision) || 3);
  const round = (value: number) => (exact ? value : Math.round(value * precision) / precision);
  // one zero-denominator rule per family (spec § 5.10): a share of nothing is 0
  const percentage = (part: number, whole: number) => (whole ? round(part / whole) : 0);

  Object.keys(participantResults).forEach((participantId) => {
    const setsWon = participantResults[participantId].setsWon;
    const setsLost = participantResults[participantId].setsLost;
    const setsTotal =
      tallyPolicy?.groupTotalSetsPlayed || groupingTotal === 'setsPct'
        ? totalSets
        : perPlayer * (bracketSetsToWin || 0) || setsWon + setsLost;
    const setsPct = percentage(setsWon, setsTotal);

    const tieMatchUpsWon = participantResults[participantId].tieMatchUpsWon;
    const tieMatchUpsLost = participantResults[participantId].tieMatchUpsLost;
    const tieMatchUpsTotal = tieMatchUpsWon + tieMatchUpsLost;
    const tieMatchUpsPct = percentage(tieMatchUpsWon, tieMatchUpsTotal);

    const matchUpsWon = participantResults[participantId].matchUpsWon;
    const matchUpsLost = participantResults[participantId].matchUpsLost;
    const matchUpsDrawn = participantResults[participantId].matchUpsDrawn ?? 0;
    const matchUpsTotal = matchUpsWon + matchUpsLost + matchUpsDrawn;
    const matchUpsCredit = matchUpsWon + matchUpsDrawn * (tallyPolicy?.drawCredit ?? 0.5);
    const matchUpsPct = percentage(matchUpsCredit, matchUpsTotal);

    const gamesWon = participantResults[participantId].gamesWon || 0;
    const gamesLost = participantResults[participantId].gamesLost || 0;
    const minimumExpectedGames = (perPlayer || 0) * (bracketSetsToWin || 0) * (bracketGamesForSet || 0);
    const gamesTotal =
      tallyPolicy?.groupTotalGamesPlayed || groupingTotal === 'gamesPct'
        ? totalGames
        : Math.max(minimumExpectedGames, gamesWon + gamesLost);
    const gamesPct = percentage(gamesWon, gamesTotal);

    const { pointsWon, pointsLost } = participantResults[participantId];
    const pointsPct = percentage(pointsWon, pointsWon + pointsLost);

    participantResults[participantId].setsWon = setsWon;
    participantResults[participantId].setsLost = setsLost;
    participantResults[participantId].setsPct = setsPct;
    participantResults[participantId].tieMatchUpsWon = tieMatchUpsWon;
    participantResults[participantId].tieMatchUpsPct = tieMatchUpsPct;
    participantResults[participantId].matchUpsPct = matchUpsPct;
    if (tallyPolicy?.outcomePoints) {
      const { win, draw, loss } = tallyPolicy.outcomePoints;
      participantResults[participantId].standingsPoints =
        matchUpsWon * win + matchUpsDrawn * draw + matchUpsLost * loss;
    }
    participantResults[participantId].gamesWon = gamesWon;
    participantResults[participantId].gamesLost = gamesLost;
    participantResults[participantId].gamesPct = gamesPct;
    participantResults[participantId].pointsPct = pointsPct;
    // differences (S3c), the goal-difference measures. Ratios are computed only when ordering (orderParticipants): a ratio
    // with nothing lost is unbounded, and a stored tally must stay finite to serialise
    participantResults[participantId].setsDiff = setsWon - setsLost;
    participantResults[participantId].gamesDiff = gamesWon - gamesLost;
    participantResults[participantId].pointsDiff = pointsWon - pointsLost;
    participantResults[participantId].result =
      `${participantResults[participantId].matchUpsWon}/${participantResults[participantId].matchUpsLost}`;
  });
}
