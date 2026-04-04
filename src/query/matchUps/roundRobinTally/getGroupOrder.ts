import { getParticipantResults } from './getParticipantResults';
import { getGroups, getResultsArray } from './getGroups';
import { instanceCount } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';

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

The algorithm relies on the values avaialble in the calculated `participantResults` and works as follows:
• separate participants into groups by a given attribute
• a group with a single participant is 'resolved'
• groups of two participants are resolved by head-to-head (if not disabled/if participants faced each other)
• groups of three or more search for an attribute that will separate them into smaller groups
• participantResults scoped to the members of a group and recalculated when `{ idsFilter: true }`
• when { maxParticipants: 2 } is defined the rule is skipped if there are more than maxParticipants tied
*/

const headToHeadTallyDirectives = [
  { attribute: 'matchUpsPct', idsFilter: false },
  { attribute: 'allDefaults', reversed: true, idsFilter: false },
  { attribute: 'defaults', reversed: true, idsFilter: false },
  { attribute: 'walkovers', reversed: true, idsFilter: false },
  { attribute: 'retirements', reversed: true, idsFilter: false },
  { attribute: 'setsPct', idsFilter: false },
  { attribute: 'gamesPct', idsFilter: false },
  { attribute: 'pointsPct', idsFilter: false },
  { attribute: 'matchUpsPct', idsFilter: true },
  { attribute: 'setsPct', idsFilter: true },
  { attribute: 'gamesPct', idsFilter: true },
  { attribute: 'pointsPct', idsFilter: true },
];

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
    subOrderMap,
    tallyPolicy, // array of attributes to use for tie-breaking
  } = params;

  const report: any[] = [];

  // if not all opponents have completed their matchUps, no orders are assigned
  if (requireCompletion && !isComplete(params)) {
    return {};
  }

  const attribute = [
    'tieMatchUpsWon',
    'tieSinglesWon',
    'tieDoublesWon',
    'matchUpsWon',
    'pointsWon',
    'gamesWon',
    'setsWon',
    'gamesPct',
    'setsPct',
    'pointsPct',
    'matchUpsPct',
  ].includes(tallyPolicy?.groupOrderKey)
    ? tallyPolicy.groupOrderKey
    : 'matchUpsWon';

  const orderedTallyGroups = getGroups({
    participantResults,
    attribute,
  });

  report.push({ attribute, groups: orderedTallyGroups });

  // tally groups are participants grouped by the attribute
  const sortedTallyGroups = Object.keys(orderedTallyGroups)
    .map((key) => Number.parseFloat(key))
    .sort((a, b) => b - a)
    .map((key) => orderedTallyGroups[key]);

  const sortedOrder = sortedTallyGroups.map((participantIds) => {
    const result = groupSubSort({ participantIds, ...params });
    report.push(...(result.report ?? []));
    return result.order;
  });

  // subGroup is an array of indices of the sortedTallyGroups
  // subGroup is used to determine the order of groups of participants when there are no resolutions
  // e.g. [[resolved, unresolved, unresolved, unresolved], [resolved, unresolved, unresolved, unresolved]]
  // in the above example the order would be [1, 2, 2, 2, 5, 6, 6, 6]
  const groupOrder = sortedOrder.flatMap((order, oi) =>
    order.map((o) => (o.resolved ? o : { ...o, subGroup: [oi].concat(...(o.subGroup ?? [])) })),
  );

  let lastSubGroup;
  let subGroupCount = 0;
  let groupPosition = 1;
  let priorPositionResolution;
  groupOrder.forEach((finishingPosition, index) => {
    if (
      // after the first position, which is always 1,
      index &&
      // increment group position if position is resolved
      (finishingPosition.resolved ||
        // increment group position if position is unresolved and prior position was resolved
        (priorPositionResolution && !finishingPosition.resolved))
    ) {
      groupPosition += 1;
    }
    // update prior position resolution
    priorPositionResolution = finishingPosition.resolved;

    const subGroup = Number.parseInt(finishingPosition.subGroup?.join('') || 0);

    if (finishingPosition.resolved) {
      // if a position is resolved, position is index + 1
      finishingPosition.position = index + 1;
      // if a position is resolved, update groupPosition
      groupPosition = finishingPosition.position;
    } else {
      if (lastSubGroup && subGroup > lastSubGroup) {
        groupPosition += subGroupCount;
        subGroupCount = 0;
      }
      // if a position is unresovled, position is groupPosition
      finishingPosition.position = groupPosition;
      subGroupCount += 1;
    }

    lastSubGroup = subGroup;
  });

  const positions = groupOrder.map(({ position }) => position);
  const positionsCount = instanceCount(positions);

  groupOrder.forEach((finishingPosition) => {
    const { participantId, position } = finishingPosition ?? {};
    const participantResult = participantResults[participantId];
    finishingPosition.GEMscore = getRatioHash(participantResult);

    const positionInstances = positionsCount[position];

    if (finishingPosition?.position !== undefined) {
      // subOrder is only assigned if there are ties
      if (positionInstances > 1) {
        finishingPosition.ties = positionInstances;
        if (subOrderMap) {
          finishingPosition.subOrder = subOrderMap[participantId];
        }
      }

      finishingPosition.rankOrder = position;
      finishingPosition.groupOrder = position + (finishingPosition.subOrder || 1) - 1;
    }
  });

  return { groupOrder, report: report.flat(Infinity).filter(Boolean) };

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
    (r) => participantsCount - 1 === r.results.matchUpsWon + r.results.matchUpsLost + r.results.matchUpsCancelled,
  );
  return participantsCount === participantsFinished.length;
}

function processAttribute({
  disableHeadToHead,
  participantIds,
  matchUpFormat,
  groupTotals,
  tallyPolicy,
  attribute,
  idsFilter,
  matchUps,
  reversed, // reverses default which is greatest to least
}) {
  const { participantResults } = getParticipantResults({
    participantIds: idsFilter && participantIds,
    groupingTotal: groupTotals && attribute,
    matchUpFormat,
    tallyPolicy,
    matchUps,
  });

  const groups = getGroups({
    participantResults,
    participantIds,
    attribute,
  });

  const report: any[] = [{ attribute, reversed, groups, idsFilter, groupTotals }];
  let order;

  if (Object.keys(groups).length > 1 && participantIds.length) {
    // separation by attribute was successful
    const sortedTallyGroups = Object.keys(groups)
      .map((key) => Number.parseFloat(key))
      .sort((a, b) => (reversed ? a - b : b - a))
      .map((key) => groups[key]);

    const sortedOrder = sortedTallyGroups.map((participantIds) => {
      const result = groupSubSort({
        participantResults,
        disableHeadToHead,
        participantIds,
        matchUpFormat,
        tallyPolicy,
        matchUps,
      });
      report.push(...(result.report ?? []));
      return result.order;
    });

    order = sortedOrder.flatMap((order, oi) =>
      order.map((o) => (o.resolved ? o : { ...o, subGroup: [oi].concat(...(o.subGroup ?? [])) })),
    );
  }

  return { order, report };
}

function groupSubSort({ participantResults, disableHeadToHead, participantIds, matchUpFormat, tallyPolicy, matchUps }) {
  const excludedDirectives: any[] = [];
  const report: any[] = [];
  let result;

  if (participantIds?.length === 1) {
    const participantId = participantIds[0];
    return {
      order: [{ resolved: true, participantId }],
    };
  }
  if (
    participantIds?.length === 2 &&
    (!tallyPolicy?.headToHead || (!tallyPolicy.headToHead.disabled && !disableHeadToHead))
  ) {
    const result = getHeadToHeadWinner({ participantIds, participantResults });
    if (result) {
      const headToHeadWinner = result[0].participantId;
      report.push({ attribute: 'head2Head', participantIds, headToHeadWinner });
      return { order: result, headToHeadWinner, report };
    }
  }

  const directives = tallyPolicy?.tallyDirectives || headToHeadTallyDirectives;

  const filteredDirectives = directives.filter((directive) => {
    // if maxParticipants is defined, filter out the rule if # of participants is greater than maxParticipants
    const keepDirective = !(isNumeric(directive.maxParticipants) && participantIds?.length > directive.maxParticipants);

    if (!keepDirective) excludedDirectives.push(directive);
    return keepDirective;
  });

  if (excludedDirectives.length) report.push({ excludedDirectives, participantIds });

  filteredDirectives.every(({ attribute, reversed, idsFilter, groupTotals, disableHeadToHead }) => {
    result = processAttribute({
      disableHeadToHead,
      participantIds,
      matchUpFormat,
      groupTotals,
      tallyPolicy,
      attribute,
      idsFilter,
      matchUps,
      reversed,
    });
    report.push(result.report);

    // return false if a rule has successfully broken the tie
    return !result.order;
  });

  if (result.order) return { order: result.order, report };

  return {
    order: participantIds?.map((participantId) => ({ participantId })),
    report,
  };
}

// NOTE: This currently considers one victory rather than a head2head win/loss record (considering rounds of play where participants may encounter each other more than once)
function getHeadToHeadWinner({ participantIds, participantResults }) {
  if (!participantIds) return;

  if (participantResults[participantIds[0]].victories.includes(participantIds[1])) {
    return participantIds.map((participantId) => ({
      resolved: true,
      participantId,
    }));
  } else if (participantResults[participantIds[1]].victories.includes(participantIds[0])) {
    return participantIds.reverse().map((participantId) => ({ resolved: true, participantId }));
  }
}
