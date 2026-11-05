import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addDynamicRatings } from '@Mutate/participants/scaleItems/addDynamicRatings';
import { getParticipantScaleItem } from '@Query/participant/getParticipantScaleItem';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { resolveScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { recorded } from '@Mutate/simulation/scenarioRecorder';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { calculateNewRatings } from './calculateNewRatings';
import { getRatingConvertedToELO } from './eloConversions';
import { kOf, winnerActualOf } from './ratingsPolicyRules';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { findPolicy } from '@Acquire/findPolicy';

// constants, fixtures and types
import { ARRAY, ERROR, OF_TYPE, TOURNAMENT_RECORD, VALIDATE } from '@Constants/attributeConstants';
import { MISSING_MATCHUP_IDS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_RATINGS_DEFAULT } from '@Fixtures/policies/POLICY_RATINGS_DEFAULT';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';
import type { ExpectationRule } from './ratingUpdate';
import { DYNAMIC, RATING } from '@Constants/scaleConstants';
import { EventTypeUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ELO } from '@Constants/ratingConstants';
import { ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';

// the ratings write, logged when a scenario is recorded (see scenarioRecorder)
const addDynamicRatingsRecorded = recorded('addDynamicRatings', addDynamicRatings);

export function generateDynamicRatings(params): ResultType & {
  modifiedScaleValues?: { [key: string]: number };
  processedMatchUpIds?: string[];
  sourceRatingType?: string;
  outputScaleName?: string;
  ratingType?: string;
} {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { matchUpIds: true, [OF_TYPE]: ARRAY, [ERROR]: MISSING_MATCHUP_IDS },
    { ratingType: false, [VALIDATE]: (value) => ratingsParameters[value] },
  ]);

  if (paramsCheck.error) return paramsCheck;

  const {
    updateParticipantRatings, // modify tournamentRecord.participants with new scaleItems
    removePriorValues = true, // remove prior scaleItems for the same scaleName
    tournamentRecord,
    ratingType = ELO, // default to ELO when not provided
    convertToELO, // when true, convert initial ratings to ELO and stay in ELO space
    refreshDynamic, // ignore previously calculated values
    ratingsPolicy, // a RatingsPolicy, ahead of one attached to the event or tournament and the default
    matchesPlayed, // { [participantId]: career matches played before this run }, for a MATCHES_PLAYED K
    drawDefinition,
    matchUpIds, // matchUpIds to process for ratings when params.matchUps not provided
    asDynamic, // when true, return dynamic scaleName; otherwise return ratingType
  } = params;

  const sourceRatingParameter = ratingsParameters[ratingType];
  const isEloNative = convertToELO && ratingType !== ELO;
  const computeRatingType = isEloNative ? ELO : ratingType;
  const computeParameter = ratingsParameters[computeRatingType];
  const sourceAccessor = sourceRatingParameter.accessor;
  const accessor = computeParameter.accessor; // undefined for ELO (plain numbers)

  const modifiedScaleValues = {};

  const matchUps =
    (params.matchUps ||
      (refreshDynamic && // when { refreshDynamic: true } use allDrawMatchUps
        allDrawMatchUps({
          drawDefinition,
          tournamentRecord,
          inContext: true,
          matchUpFilters: { matchUpStatuses: completedMatchUpStatuses },
        }).matchUps) ||
      allTournamentMatchUps({
        matchUpFilters: { matchUpIds, matchUpStatuses: completedMatchUpStatuses },
        tournamentRecord,
        inContext: true,
      }).matchUps) ??
    [];

  const dynamicScaleName = `${computeRatingType}.${DYNAMIC}`;
  const outputScaleName = asDynamic ? dynamicScaleName : computeRatingType;

  matchUps.sort(matchUpSort);

  const policyOf = (matchUp: HydratedMatchUp): RatingsPolicy => {
    if (ratingsPolicy) return ratingsPolicy;
    const event = tournamentRecord.events?.find(({ eventId }) => eventId === matchUp.eventId);
    const { policy } = findPolicy({ tournamentRecord, event, policyType: POLICY_TYPE_RATINGS });
    return policy ?? POLICY_RATINGS_DEFAULT[POLICY_TYPE_RATINGS];
  };
  const rated = matchUps
    .map((matchUp) => ({ matchUp, policy: policyOf(matchUp) }))
    .filter(({ matchUp, policy }) => !(matchUp.matchUpStatus === WALKOVER && policy.walkovers === 'EXCLUDE'));

  // a MATCHES_PLAYED K reads each player's career count, which only the caller holds: refuse before any write
  const careerCounts: Record<string, number> = { ...matchesPlayed };
  const uncounted = rated
    .filter(({ policy }) => policy.k.rule === 'MATCHES_PLAYED')
    .flatMap(({ matchUp }) => (matchUp.sides ?? []).map((side) => side.participant?.participantId))
    .filter((participantId) => participantId && careerCounts[participantId] === undefined);
  if (uncounted.length) {
    return { error: MISSING_VALUE, info: `matchesPlayed: no career count for ${[...new Set(uncounted)].join(', ')}` };
  }

  for (const { matchUp, policy } of rated) {
    const { endDate, matchUpFormat, score, sides, winningSide } = matchUp;

    const matchUpType = matchUp.matchUpType as EventTypeUnion;

    const scaleAttributes = {
      eventType: matchUpType,
      scaleName: ratingType, // always read source rating for initial values
      scaleType: RATING,
    };

    const dynamicScaleAttributes = {
      scaleName: dynamicScaleName, // ELO.DYNAMIC when convertToELO, else {ratingType}.DYNAMIC
      eventType: matchUpType,
      scaleType: RATING,
    };

    // When convertToELO, also check for source-scale dynamic values (backward compat)
    const sourceDynamicScaleAttributes = isEloNative
      ? { scaleName: `${ratingType}.${DYNAMIC}`, eventType: matchUpType, scaleType: RATING }
      : undefined;

    const sideParticipantIds: Record<number, string[]> = Object.assign(
      {},
      ...(sides ?? []).map((side: HydratedSide) => {
        const { sideNumber, participant } = side;
        return (
          sideNumber && {
            [sideNumber]: [participant?.participantId, ...(participant?.individualParticipantIds ?? [])]
              .filter(Boolean)
              .flat(),
          }
        );
      }),
    );

    const scaleItemMap = Object.assign(
      {},
      ...Object.values(sideParticipantIds)
        .flat()
        .map((participantId) =>
          resolveParticipantScaleItem({
            participantId,
            modifiedScaleValues,
            refreshDynamic,
            dynamicScaleAttributes,
            sourceDynamicScaleAttributes,
            scaleAttributes,
            tournamentRecord,
            sourceAccessor,
            outputScaleName,
            ratingType,
            isEloNative,
            accessor,
            matchUpType,
            endDate,
          }),
        ),
    );

    const parsedFormat: any = matchUpFormat ? parse(matchUpFormat) : undefined;
    const loserSetsWon = (score?.sets ?? []).filter((set) => winningSide && set.winningSide === 3 - winningSide).length;
    const sideK = (sideNumber: number) => {
      const participantId = sides?.find((side) => side.sideNumber === sideNumber)?.participant?.participantId;
      return kOf(policy.k, participantId ? careerCounts[participantId] : undefined);
    };

    updateRatingsForMatchUp({
      winnerActual: winningSide ? winnerActualOf({ rule: policy.actual, parsedFormat, loserSetsWon }) : undefined,
      winnerK: winningSide ? sideK(winningSide) : undefined,
      loserK: winningSide ? sideK(3 - winningSide) : undefined,
      expectation: policy.expectation,
      sideParticipantIds,
      computeRatingType,
      outputScaleName,
      scaleItemMap,
      winningSide,
      accessor,
    });

    for (const side of sides ?? []) {
      const participantId = side.participant?.participantId;
      if (participantId && careerCounts[participantId] !== undefined) careerCounts[participantId] += 1;
    }

    Object.assign(modifiedScaleValues, scaleItemMap);

    if (updateParticipantRatings) {
      addDynamicRatingsRecorded({ tournamentRecord, modifiedScaleValues, removePriorValues });
    }
  }

  const processedMatchUpIds = rated.map(({ matchUp }) => matchUp.matchUpId);

  return {
    ...SUCCESS,
    modifiedScaleValues,
    outputScaleName,
    processedMatchUpIds,
    ...(isEloNative && { sourceRatingType: ratingType }),
  };
}

function resolveParticipantScaleItem({
  participantId,
  modifiedScaleValues,
  refreshDynamic,
  dynamicScaleAttributes,
  sourceDynamicScaleAttributes,
  scaleAttributes,
  tournamentRecord,
  sourceAccessor,
  outputScaleName,
  ratingType,
  isEloNative,
  accessor,
  matchUpType,
  endDate,
}) {
  const existingModifiedScaleValue = modifiedScaleValues[participantId];
  const useDynamic = !refreshDynamic || existingModifiedScaleValue;

  let dynamicScaleItem = useDynamic
    ? getParticipantScaleItem({
        scaleAttributes: dynamicScaleAttributes,
        tournamentRecord,
        participantId,
      }).scaleItem
    : undefined;

  if (!dynamicScaleItem && sourceDynamicScaleAttributes && useDynamic) {
    dynamicScaleItem = resolveSourceDynamicItem({
      sourceDynamicScaleAttributes,
      tournamentRecord,
      participantId,
      sourceAccessor,
      outputScaleName,
      ratingType,
    });
  }

  const scaleItem = getParticipantScaleItem({
    tournamentRecord,
    scaleAttributes,
    participantId,
  }).scaleItem;

  let resolvedScaleItem = dynamicScaleItem ?? scaleItem;
  if (!dynamicScaleItem && scaleItem && isEloNative) {
    // `sourceRating != null` admitted the empty string that real records carry
    // for an unrated player, and `('' - 1) * 3000 / 15` is -200 — an ELO 200
    // points below the declared floor, written back as the participant's rating.
    const sourceRating = resolveScaleValueNumber(scaleItem.scaleValue, {
      accessor: sourceAccessor,
      scaleName: ratingType,
    });
    if (sourceRating !== undefined) {
      resolvedScaleItem = {
        ...scaleItem,
        scaleName: outputScaleName,
        scaleValue: getRatingConvertedToELO({ sourceRatingType: ratingType, sourceRating }),
      };
    }
  }

  const defaultScaleValue = accessor ? { [accessor]: undefined } : undefined;

  return (
    participantId && {
      [participantId]: resolvedScaleItem ?? {
        scaleName: outputScaleName,
        eventType: matchUpType,
        scaleDate: endDate,
        scaleType: RATING,
        scaleValue: defaultScaleValue,
      },
    }
  );
}

function resolveSourceDynamicItem({
  sourceDynamicScaleAttributes,
  tournamentRecord,
  participantId,
  sourceAccessor,
  outputScaleName,
  ratingType,
}) {
  const sourceItem = getParticipantScaleItem({
    scaleAttributes: sourceDynamicScaleAttributes,
    tournamentRecord,
    participantId,
  }).scaleItem;

  if (!sourceItem) return undefined;

  const sourceRating = resolveScaleValueNumber(sourceItem.scaleValue, {
    accessor: sourceAccessor,
    scaleName: ratingType,
  });
  if (sourceRating !== undefined) {
    return {
      ...sourceItem,
      scaleName: outputScaleName,
      scaleValue: getRatingConvertedToELO({ sourceRatingType: ratingType, sourceRating }),
    };
  }

  return undefined;
}

type UpdateRatingsForMatchUpArgs = {
  sideParticipantIds: Record<number, string[]>;
  scaleItemMap: Record<string, any>;
  expectation: ExpectationRule;
  winnerActual?: number;
  computeRatingType: string;
  outputScaleName: string;
  winningSide?: number;
  /** the scale value's accessor, absent for ELO's plain numbers */
  accessor: string;
  winnerK?: number;
  loserK?: number;
};

function updateRatingsForMatchUp({
  sideParticipantIds,
  computeRatingType,
  outputScaleName,
  winnerActual,
  scaleItemMap,
  winningSide,
  expectation,
  winnerK,
  loserK,
  accessor,
}: UpdateRatingsForMatchUpArgs) {
  const winningSideParticipantIds = winningSide ? sideParticipantIds[winningSide] : [];
  const losingSideParticipantIds = winningSide ? sideParticipantIds[3 - winningSide] : [];

  for (const winnerParticipantId of winningSideParticipantIds) {
    const winnerScaleValue = scaleItemMap[winnerParticipantId]?.scaleValue;
    const winnerRating = typeof winnerScaleValue === 'object' ? winnerScaleValue[accessor] : winnerScaleValue;

    for (const loserParticipantId of losingSideParticipantIds) {
      const loserScaleValue = scaleItemMap[loserParticipantId]?.scaleValue;
      const loserRating = typeof loserScaleValue === 'object' ? loserScaleValue[accessor] : loserScaleValue;

      const { newWinnerRating, newLoserRating } = calculateNewRatings({
        ratingType: computeRatingType,
        winnerActual,
        winnerRating,
        loserRating,
        expectation,
        winnerK,
        loserK,
      });

      const newWinnerScaleValue = accessor ? { ...winnerScaleValue, [accessor]: newWinnerRating } : newWinnerRating;
      const newLoserScaleValue = accessor ? { ...loserScaleValue, [accessor]: newLoserRating } : newLoserRating;
      scaleItemMap[winnerParticipantId].scaleValue = newWinnerScaleValue;
      scaleItemMap[loserParticipantId].scaleValue = newLoserScaleValue;
      scaleItemMap[winnerParticipantId].scaleName = outputScaleName;
      scaleItemMap[loserParticipantId].scaleName = outputScaleName;
    }
  }
}
