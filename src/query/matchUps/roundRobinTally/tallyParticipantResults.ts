import { matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { decorateResult } from '@Functions/global/decorateResult';
import { getParticipantResults } from './getParticipantResults';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { getDevContext } from '@Global/state/globalState';
import { validMatchUps } from '@Validators/validMatchUp';
import { getTallyReport } from './getTallyReport';
import { getGroupOrder } from './getGroupOrder';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/matchUpTypes';

type TallyParticipantResultsArgs = {
  policyDefinitions?: PolicyDefinitions;
  generateReport?: boolean;
  /**
   * A FLAG, not a value. Declared `string` until 7.0.0 while every caller passed a boolean and the
   * only use is `if (pressureRating)`. Corrected rather than widened: a type that says `string`
   * about a truthiness switch misleads every consumer reading the `.d.ts`.
   */
  pressureRating?: boolean;
  matchUpFormat?: string;
  perPlayer?: number;
  subOrderMap?: any;
  matchUps: any[];
};

type TallyResultType = {
  completedTieMatchUps?: boolean;
  bracketComplete?: boolean;
  participantResults?: any;
  readableReport?: string;
  report?: string[];
  order?: any[];
};

export function tallyParticipantResults({
  policyDefinitions,
  generateReport,
  pressureRating,
  matchUpFormat,
  matchUps = [],
  subOrderMap,
  perPlayer,
}: TallyParticipantResultsArgs): TallyResultType & ResultType {
  if (!matchUps?.length || !validMatchUps(matchUps)) return { error: MISSING_MATCHUPS };

  const structureIds = unique(matchUps.map(({ structureId }) => structureId));

  if (structureIds.length !== 1) {
    return decorateResult({
      result: { error: INVALID_VALUES, info: 'Maximum one structureId' },
      stack: 'tallyParticipantResults',
      context: { structureIds },
    });
  }

  const relevantMatchUps = matchUps.filter((matchUp) => matchUp && matchUp.matchUpStatus !== BYE);

  const participantsCount =
    relevantMatchUps.length && unique(relevantMatchUps.flatMap(({ drawPositions }) => drawPositions)).length;

  const bracketComplete =
    relevantMatchUps.filter((matchUp) => matchUpCompletion(matchUp)).length === relevantMatchUps.length;
  // if bracket is incomplete don't use expected matchUps perPlayer for calculating
  if (!bracketComplete) perPlayer = 0;

  const completedTieMatchUps = matchUps.every(
    ({ matchUpType, tieMatchUps }) =>
      matchUpType === TEAM && tieMatchUps?.every((matchUp) => matchUpCompletion(matchUp)),
  );

  const tallyPolicy = policyDefinitions?.[POLICY_TYPE_ROUND_ROBIN_TALLY];

  const consideredMatchUps = matchUps.filter(
    (matchUp) => matchUp && (matchUpCompletion(matchUp) ?? matchUp.matchUpType === TEAM),
  );
  const participantResultsOutcome: any = getParticipantResults({
    matchUps: consideredMatchUps,
    pressureRating,
    matchUpFormat,
    tallyPolicy,
    perPlayer,
  });
  // `consideredMatchUps` is always an array here, so this cannot fire today — it is propagated
  // rather than asserted so a future caller change surfaces as an error instead of an empty tally.
  if (participantResultsOutcome.error) return participantResultsOutcome;
  const { participantResults } = participantResultsOutcome;

  let report, order;

  const { groupOrder, report: groupOrderReport } = getGroupOrder({
    matchUps: consideredMatchUps,
    participantResults,
    participantsCount,
    matchUpFormat,
    subOrderMap,
    tallyPolicy,
  });

  if (pressureRating) addPressureOrder({ participantResults });

  // do not add groupOrder if bracket is not complete
  if (bracketComplete && groupOrder) {
    report = groupOrderReport;
    order = groupOrder;

    groupOrder.forEach((finishingPosition) => {
      const { participantId, groupOrder, rankOrder, subOrder, ties, GEMscore } = finishingPosition;
      const participantResult = participantResults[participantId];
      Object.assign(participantResult, {
        groupOrder,
        rankOrder,
        GEMscore,
        subOrder,
        ties,
      });
    });
  } else {
    const { groupOrder: provisionalOrder, report: provisionalOrderReport } = getGroupOrder({
      requireCompletion: false,
      participantResults,
      participantsCount,
      matchUpFormat,
      tallyPolicy,
      subOrderMap,
      matchUps,
    });

    report = provisionalOrderReport;
    order = provisionalOrder;

    if (provisionalOrder) {
      provisionalOrder.forEach((finishingPosition) => {
        const { participantId, groupOrder, subOrder, ties, GEMscore } = finishingPosition;
        const participantResult = participantResults[participantId];
        Object.assign(participantResult, {
          provisionalOrder: groupOrder,
          GEMscore,
          subOrder,
          ties,
        });
      });
    }
  }

  const result = {
    completedTieMatchUps,
    readableReport: '',
    participantResults,
    bracketComplete,
    order: [],
    report,
  };

  if (bracketComplete || completedTieMatchUps) {
    result.order = order;
  }

  if (generateReport || getDevContext({ tally: true })) {
    const readable = getTallyReport({ matchUps, report, order });
    pushGlobalLog({ method: 'tallyParticipantResults', tally: readable });
    result.readableReport = readable;
  }

  return result;
}

export function addPressureOrder({ participantResults }) {
  const sum = (values) => values.reduce((total, value) => total + parseFloat(value), 0);
  const avg = (values) => parseFloat((sum(values) / values.length).toFixed(2));
  const pressureOrder = Object.keys(participantResults)
    .map((participantId) => {
      const participantResult = participantResults[participantId];
      const { pressureScores } = participantResult;
      const averagePressure = pressureScores?.length ? avg(pressureScores) : 0;
      return { participantId, averagePressure };
    })
    .sort((a, b) => (b.averagePressure || 0) - (a.averagePressure || 0))
    .map((results, i) => ({ ...results, order: i + 1 }));

  for (const item of pressureOrder) {
    participantResults[item.participantId].pressureOrder = item.order;
  }
}
