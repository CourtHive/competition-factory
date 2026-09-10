import { checkMatchUpIsComplete } from '@Query/matchUp/checkMatchUpIsComplete';
import { decorateResult } from '@Functions/global/decorateResult';
import { getParticipantResults } from './getParticipantResults';
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
  pressureRating?: string;
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

  // `checkMatchUpIsComplete` refuses a non-matchUp with a TRUTHY `{ error }`, and the filter on the
  // next line proves `matchUps` can hold a falsy entry. This maps a refusal back to `undefined` and
  // otherwise passes the answer through UNCHANGED — `true`, or the `winningSide` (1 | 2), or
  // `undefined`. All three matter: callers below rely on truthiness, and the `?? TEAM` fallback
  // relies on `undefined` specifically.
  const completeOrUndefined = (matchUp: any) => {
    if (!matchUp) return undefined;
    const result: any = checkMatchUpIsComplete({ matchUp });
    return result?.error ? undefined : result;
  };

  const relevantMatchUps = matchUps.filter((matchUp) => matchUp && matchUp.matchUpStatus !== BYE);

  const participantsCount =
    relevantMatchUps.length && unique(relevantMatchUps.flatMap(({ drawPositions }) => drawPositions)).length;

  const bracketComplete =
    relevantMatchUps.filter((matchUp) => completeOrUndefined(matchUp)).length === relevantMatchUps.length;
  // if bracket is incomplete don't use expected matchUps perPlayer for calculating
  if (!bracketComplete) perPlayer = 0;

  const completedTieMatchUps = matchUps.every(
    ({ matchUpType, tieMatchUps }) =>
      matchUpType === TEAM && tieMatchUps?.every((matchUp) => completeOrUndefined(matchUp)),
  );

  const tallyPolicy = policyDefinitions?.[POLICY_TYPE_ROUND_ROBIN_TALLY];

  const consideredMatchUps = matchUps.filter(
    (matchUp) => matchUp && (completeOrUndefined(matchUp) ?? matchUp.matchUpType === TEAM),
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
    if (getDevContext({ tally: true })) console.log(readable);
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
