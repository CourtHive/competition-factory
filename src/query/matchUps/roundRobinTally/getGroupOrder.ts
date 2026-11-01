import { orderParticipants } from '@Query/standings/orderParticipants';
import { getParticipantResults } from './getParticipantResults';
import { fromV1 } from '@Query/standings/fromV1';
import { getResultsArray } from './getGroups';

/*
Round Robin group tally logic by default implements the following guidelines:

The participant who wins the most matches is the winner.
If two players are tied, then the winner of their head-to-head match is the winner.

If three or more players are tied, tie are broken as follows:
• The head-to-head win-loss record in matches involving just the tied players;
• The participant with the highest percentage of sets won of all sets completed;
• The head-to-head win-loss record in matches involving the players who remain tied;
• The participant with the highest percentage of games won of all games completed;
• The head-to-head win-loss record in matches involving the players who remain tied;
• The participant with the highest percentage of sets won of sets completed among players in the group under consideration;
• The head-to-head win-loss record in matches involving the players who remain tied;
• The participant with the highest percentage of games won of games completed among the players under consideration; and
• The head-to-head win-loss record in matches involving the players who remain tied.

After initial separation of participants by `matchUpsWon`,
the implementation is configurable by supplying an array of `tallyDirectives` in the `tallyPolicy`.

The ordering itself is the standings engine's (`@Query/standings/orderParticipants`), reading the tally policy through
`fromV1`; this module keeps what is v1-specific to a round-robin group: the completion rule and the GEMscore.
*/

// defines offsets for generating large integer for comparison
const GEMScoreValueMap = {
  matchUpsPct: 20,
  tieMatchUpsPct: 16,
  pointsPct: 4,
  gamesPct: 8,
  setsPct: 12,
};

export function getGroupOrder(params) {
  const {
    requireCompletion = true, // no order is provided unless all opponents have completed their matchUps
    participantResults, // { participantId: { matchUpsWon, matchUpsLost, matchUpsCancelled, ... } }
    matchUpFormat,
    subOrderMap,
    tallyPolicy, // array of attributes to use for tie-breaking
    matchUps,
  } = params;

  // if not all opponents have completed their matchUps, no orders are assigned
  if (requireCompletion && !isComplete(params)) {
    return {};
  }

  const { groupOrder, report } = orderParticipants({
    recalculate: ({ participantIds, groupingTotal }) =>
      getParticipantResults({ participantIds, groupingTotal, matchUpFormat, tallyPolicy, matchUps }),
    policy: fromV1(tallyPolicy),
    participantResults,
    subOrderMap,
  });

  for (const finishingPosition of groupOrder) {
    finishingPosition.GEMscore = getRatioHash(participantResults[finishingPosition.participantId]);
  }

  return { groupOrder, report };

  // NOTE: TallyPolicy.GEMscore could be an object instead of an array of attributes
  // which would allow for custom valueMaps... or valueMap could use index as multiplier
  function getRatioHash(result) {
    const attributes = Array.isArray(tallyPolicy?.GEMscore)
      ? Object.keys(GEMScoreValueMap).filter((attribute) => tallyPolicy.GEMscore.includes(attribute))
      : Object.keys(GEMScoreValueMap);

    const attributeValues = attributes.map(
      (attribute) => (result[attribute] || 0) * Math.pow(10, GEMScoreValueMap[attribute].toFixed(3)),
    );

    return attributeValues.reduce((a, b) => a + b, 0);
  }
}

function isComplete({ participantResults, participantsCount }) {
  const resultsArray = getResultsArray({ participantResults });
  const participantsFinished = resultsArray.filter(
    (r) =>
      participantsCount - 1 ===
      r.results.matchUpsWon + r.results.matchUpsLost + (r.results.matchUpsDrawn ?? 0) + r.results.matchUpsCancelled,
  );
  return participantsCount === participantsFinished.length;
}
