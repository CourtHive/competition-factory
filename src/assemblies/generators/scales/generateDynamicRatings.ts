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
import { ratedResultOf, RatedResult } from './ratedResult';
import { findStructure } from '@Acquire/findStructure';
import { kOf, resolveRatingsPolicy, tierK } from './ratingsPolicyRules';
import { findPolicy } from '@Acquire/findPolicy';

// constants, fixtures and types
import { INVALID_VALUES, MISSING_MATCHUP_IDS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ARRAY, ERROR, OF_TYPE, TOURNAMENT_RECORD, VALIDATE } from '@Constants/attributeConstants';
import { completedMatchUpStatuses, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_RATINGS_DEFAULT } from '@Fixtures/policies/POLICY_RATINGS_DEFAULT';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import type { competitionFormat } from '@Types/competitionFormat';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';
import { Event, EventTypeUnion } from '@Types/tournamentTypes';
import { DYNAMIC, RATING } from '@Constants/scaleConstants';
import { PAIR } from '@Constants/participantConstants';
import type { ExpectationRule } from './ratingUpdate';
import { SUCCESS } from '@Constants/resultConstants';
import { ELO } from '@Constants/ratingConstants';
import { ResultType } from '@Types/factoryTypes';

// the ratings write, logged when a scenario is recorded (see scenarioRecorder)
const addDynamicRatingsRecorded = recorded('addDynamicRatings', addDynamicRatings);

export function generateDynamicRatings(params): ResultType & {
  modifiedScaleValues?: { [key: string]: number };
  processedMatchUpIds?: string[];
  ratingsPolicyNames?: string[];
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

  // a passed policy, then one attached to the event or tournament, then the competitionFormat's, then the default
  const policyOf = (matchUp: HydratedMatchUp): RatingsPolicy | undefined => {
    if (ratingsPolicy) return ratingsPolicy;
    const event = tournamentRecord.events?.find(({ eventId }) => eventId === matchUp.eventId);
    const { policy } = findPolicy({ tournamentRecord, event, policyType: POLICY_TYPE_RATINGS });
    if (policy) return policy;
    const selected = competitionFormatOf(event, matchUp)?.ratingsPolicy;
    if (selected === undefined) return POLICY_RATINGS_DEFAULT[POLICY_TYPE_RATINGS];
    return resolveRatingsPolicy(selected);
  };
  const withPolicies = matchUps.map((matchUp) => ({ matchUp, policy: policyOf(matchUp) }));
  const unresolved = withPolicies.find(({ policy }) => !policy);
  if (unresolved) {
    return {
      error: INVALID_VALUES,
      info: `ratingsPolicy: no ratings policy for matchUp ${unresolved.matchUp.matchUpId}`,
    };
  }
  const rated = (withPolicies as { matchUp: HydratedMatchUp; policy: RatingsPolicy }[]).filter(
    ({ matchUp, policy }) => !(matchUp.matchUpStatus === WALKOVER && policy.walkovers === 'EXCLUDE'),
  );

  // a MATCHES_PLAYED K reads each player's career count, which only the caller holds: refuse before any write
  const careerCounts: Record<string, number> = { ...matchesPlayed };
  const uncounted = rated
    .filter(({ policy }) => policy.k.rule === 'MATCHES_PLAYED')
    .flatMap(({ matchUp }) => (matchUp.sides ?? []).flatMap(ratedParticipantIds))
    .filter((participantId) => careerCounts[participantId] === undefined);
  if (uncounted.length) {
    return { error: MISSING_VALUE, info: `matchesPlayed: no career count for ${[...new Set(uncounted)].join(', ')}` };
  }

  for (const { matchUp, policy } of rated) {
    const { endDate, sides } = matchUp;

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
      ...(sides ?? []).map((side: HydratedSide) => side.sideNumber && { [side.sideNumber]: ratedParticipantIds(side) }),
    );

    const scaleItemMap = Object.assign(
      {},
      ...Object.values(sideParticipantIds)
        .flat()
        .map(
          (participantId) =>
            // a run carries each rating forward: a later matchUp starts from the value an earlier one produced
            (modifiedScaleValues[participantId] && { [participantId]: modifiedScaleValues[participantId] }) ||
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

    const result = ratedResultOf(matchUp, policy);
    const event = tournamentRecord.events?.find(({ eventId }) => eventId === matchUp.eventId);
    const kOfTier = tierK(policy.kByTier, [event?.eventTier, tournamentRecord.tournamentTier]);
    const kFor = (participantId: string) => kOfTier ?? kOf(policy.k, careerCounts[participantId]);

    if (result) {
      updateRatingsForMatchUp({
        expectation: policy.expectation,
        sideParticipantIds,
        computeRatingType,
        outputScaleName,
        scaleItemMap,
        accessor,
        result,
        kFor,
      });
    }

    for (const participantId of Object.values(sideParticipantIds).flat()) {
      if (careerCounts[participantId] !== undefined) careerCounts[participantId] += 1;
    }

    Object.assign(modifiedScaleValues, scaleItemMap);

    if (updateParticipantRatings) {
      addDynamicRatingsRecorded({ tournamentRecord, modifiedScaleValues, removePriorValues });
    }
  }

  const processedMatchUpIds = rated.map(({ matchUp }) => matchUp.matchUpId);
  // the policies the run rated by, so a consumer can say which produced the values
  const ratingsPolicyNames = [...new Set(rated.map(({ policy }) => policy.policyName))];

  return {
    ...SUCCESS,
    modifiedScaleValues,
    outputScaleName,
    processedMatchUpIds,
    ratingsPolicyNames,
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

/**
 * Who a side's result rates: a pair's two players (published practice: the side is rated as their average and each
 * player moves against it), otherwise the side's participant (an individual, or a team as a unit).
 */
function ratedParticipantIds(side: HydratedSide): string[] {
  const participant = side?.participant;
  if (participant?.participantType === PAIR && participant.individualParticipantIds?.length) {
    return participant.individualParticipantIds;
  }
  return participant?.participantId ? [participant.participantId] : [];
}

type UpdateRatingsForMatchUpArgs = {
  kFor: (participantId: string) => number | undefined;
  sideParticipantIds: Record<number, string[]>;
  scaleItemMap: Record<string, any>;
  expectation: ExpectationRule;
  computeRatingType: string;
  outputScaleName: string;
  result: RatedResult;
  /** the scale value's accessor, absent for ELO's plain numbers */
  accessor: string;
};

function updateRatingsForMatchUp({
  sideParticipantIds,
  computeRatingType,
  outputScaleName,
  scaleItemMap,
  expectation,
  accessor,
  result,
  kFor,
}: UpdateRatingsForMatchUpArgs) {
  const { winningSide, winnerActual, loserActual, margin, protectLosses } = result;
  const winnerIds = sideParticipantIds[winningSide] ?? [];
  const loserIds = sideParticipantIds[3 - winningSide] ?? [];
  if (!winnerIds.length || !loserIds.length) return;

  const { defaultInitialization, decimalsCount = 0 } = ratingsParameters[computeRatingType] ?? {};
  const ratingOf = (participantId: string) => {
    const scaleValue = scaleItemMap[participantId]?.scaleValue;
    const value = typeof scaleValue === 'object' ? scaleValue?.[accessor] : scaleValue;
    return Number(value) || defaultInitialization;
  };
  const sideRating = (ids: string[]) => ids.reduce((sum, id) => sum + ratingOf(id), 0) / ids.length;
  const winnerRating = sideRating(winnerIds);
  const loserRating = sideRating(loserIds);

  // each player moves by their own K against the sides' ratings; one player alone takes the new rating as computed
  const rate = (ids: string[], won: boolean) => {
    for (const participantId of ids) {
      const k = kFor(participantId);
      const { newWinnerRating, newLoserRating } = calculateNewRatings({
        ratingType: computeRatingType,
        protectLosses,
        winnerActual,
        winnerRating,
        loserActual,
        loserRating,
        expectation,
        margin,
        winnerKFactor: k,
        loserKFactor: k,
      });
      const sideBefore = won ? winnerRating : loserRating;
      const newSideRating = (won ? newWinnerRating : newLoserRating) ?? sideBefore;
      const newRating =
        ids.length === 1
          ? newSideRating
          : Number.parseFloat((ratingOf(participantId) + (newSideRating - sideBefore)).toFixed(decimalsCount));
      const scaleValue = scaleItemMap[participantId].scaleValue;
      scaleItemMap[participantId].scaleValue = accessor ? { ...scaleValue, [accessor]: newRating } : newRating;
      scaleItemMap[participantId].scaleName = outputScaleName;
    }
  };
  rate(winnerIds, true);
  rate(loserIds, false);
}

/** The competitionFormat a matchUp is played under: its structure's, then its drawDefinition's, then its event's. */
function competitionFormatOf(event: Event | undefined, matchUp: HydratedMatchUp): competitionFormat | undefined {
  const drawDefinition = event?.drawDefinitions?.find(({ drawId }) => drawId === matchUp.drawId);
  const { structure } = drawDefinition ? findStructure({ drawDefinition, structureId: matchUp.structureId }) : {};
  return structure?.competitionFormat ?? drawDefinition?.competitionFormat ?? event?.competitionFormat;
}
