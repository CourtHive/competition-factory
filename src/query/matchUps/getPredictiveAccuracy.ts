import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { validMatchUps } from '@Validators/validMatchUp';
import { isConvertableInteger } from '@Tools/math';

// constants and types
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ABANDONED, DEAD_RUBBER, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament, EventTypeUnion } from '@Types/tournamentTypes';
import { COMPETITIVE, DECISIVE, ROUTINE } from '@Constants/statsConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type getPredictiveAccuracyArgs = {
  exclusionRule?: { valueAccessor: string; range: [number, number] };
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  matchUps?: HydratedMatchUp[];
  singlesForDoubles?: boolean;
  valueAccessor?: string;
  excludeMargin?: number;
  zoneDoubling?: boolean;
  matchUpType: EventTypeUnion;
  zoneMargin?: number;
  ascending?: boolean;
  scaleName: string;
  eventId?: string;
  zonePct?: number;
  drawId?: string;
  event?: Event;
};

export function getPredictiveAccuracy(params: getPredictiveAccuracyArgs) {
  let { matchUps } = params;
  const {
    singlesForDoubles,
    tournamentRecord,
    drawDefinition,
    excludeMargin,
    exclusionRule,
    zoneDoubling,
    matchUpType,
    scaleName,
    eventId,
    zonePct,
    drawId,
    event,
  } = params;

  if (!tournamentRecord && !matchUps) return { error: MISSING_TOURNAMENT_RECORD };

  if (matchUpType && ![SINGLES, DOUBLES].includes(matchUpType)) return { error: INVALID_VALUES, info: { matchUpType } };

  if (matchUps && !validMatchUps(matchUps)) return { error: INVALID_VALUES, context: { matchUps } };

  const scaleProfile = ratingsParameters[scaleName];
  const ascending = scaleProfile?.ascending ?? params.ascending ?? false;
  const valueAccessor = scaleProfile?.accessor ?? params.valueAccessor;

  const ratingsRangeDifference = Array.isArray(scaleProfile?.range)
    ? Math.abs(scaleProfile.range[0] - scaleProfile.range[1])
    : 0;

  const zoneMargin =
    isConvertableInteger(zonePct) && ratingsRangeDifference
      ? (zonePct ?? 0 / 100) * ratingsRangeDifference
      : (params.zoneMargin ?? ratingsRangeDifference);

  const contextProfile = { withScaleValues: true, withCompetitiveness: true };
  const contextFilters = {
    matchUpTypes: matchUpType ? [matchUpType] : [SINGLES, DOUBLES],
  };
  const participants = tournamentRecord?.participants;

  if (matchUps?.[0]?.hasContext) {
    if (drawId) {
      matchUps = matchUps.filter((matchUp) => matchUp.drawId === drawId);
    } else if (eventId) {
      matchUps = matchUps.filter((matchUp) => matchUp.eventId === eventId);
    }
  } else {
    matchUps ??=
      (drawId && !drawDefinition && []) ||
      (!drawId && eventId && !event && []) ||
      (drawId &&
        allDrawMatchUps({
          inContext: true,
          drawDefinition,
          contextFilters,
          contextProfile,
          participants,
        })?.matchUps) ||
      (!drawId &&
        eventId &&
        allEventMatchUps({
          inContext: true,
          contextFilters,
          contextProfile,
          participants,
          event,
        })?.matchUps) ||
      allTournamentMatchUps({
        tournamentRecord,
        contextFilters,
        contextProfile,
      })?.matchUps ||
      [];
  }

  if (matchUpType) {
    matchUps = matchUps.filter((matchUp) => matchUp.matchUpType === matchUpType);
  }

  const relevantMatchUps = matchUps.filter(
    ({ winningSide, score, sides, matchUpStatus }) =>
      ![RETIRED, DEFAULTED, WALKOVER, DEAD_RUBBER, ABANDONED].includes(matchUpStatus ?? '') &&
      checkScoreHasValue({ score }) &&
      sides?.length === 2 &&
      winningSide,
  );

  const accuracy = getGroupingAccuracy({
    matchUps: relevantMatchUps,
    excludeMargin,
    exclusionRule,
    valueAccessor,
    ascending,
    scaleName,
  });

  const marginCalc = !zoneDoubling || isMatchUpEventType(SINGLES)(matchUpType) ? zoneMargin : (zoneMargin || 0) * 2;

  const zoneData = zoneMargin
    ? relevantMatchUps
        .map(({ competitiveProfile, matchUpType, score, sides }) => {
          const sideValues = getSideValues({
            singlesForDoubles,
            valueAccessor,
            matchUpType,
            scaleName,
            sides,
          });
          const valuesGap = Math.abs(sideValues[0].value - sideValues[1].value);

          return {
            competitiveness: competitiveProfile?.competitiveness,
            valuesGap,
            score,
          };
        })
        .filter(({ valuesGap }) => {
          return valuesGap <= marginCalc;
        })
    : [];

  const zoneBands: any = getGroupingBands({ zoneData });
  const totalZoneMatchUps = zoneBands && Object.values(zoneBands).flat().length;

  const zoneDistribution =
    totalZoneMatchUps &&
    Object.assign(
      {},
      ...Object.keys(zoneBands).map((key) => ({
        [key]: Math.round((10000 * zoneBands[key].length) / totalZoneMatchUps) / 100,
      })),
    );

  const nonZone = relevantMatchUps.length - (zoneData?.length || 0);

  return {
    ...SUCCESS,
    relevantMatchUps,
    zoneDistribution,
    zoneData,
    accuracy,
    nonZone,
  };
}

function getGroupingBands({ zoneData }) {
  const bands = { [COMPETITIVE]: [], [ROUTINE]: [], [DECISIVE]: [] };
  for (const data of zoneData) {
    const { competitiveness, score, valuesGap } = data;
    if (bands[competitiveness]) {
      bands[competitiveness].push({ score, valuesGap });
    }
  }

  return bands;
}

type GetSideValuesArgs = {
  singlesForDoubles?: boolean;
  valueAccessor: string;
  matchUpType?: EventTypeUnion;
  exclusionRule?: any;
  scaleName: string;
  sides: any;
};
function getSideValues({
  singlesForDoubles,
  exclusionRule,
  valueAccessor,
  matchUpType,
  scaleName,
  sides,
}: GetSideValuesArgs) {
  const sortedRange = exclusionRule?.range.slice().sort((a, b) => a - b);

  const checkExcludeParticipant = (scaleValue) => {
    const exclusionValue = scaleValue?.[exclusionRule?.valueAccessor];
    const exclude = exclusionRule && exclusionValue >= sortedRange[0] && exclusionValue <= sortedRange[1];
    return { exclude, exclusionValue };
  };

  return sides
    .sort((a, b) => a.sideNumber - b.sideNumber)
    .map(({ participant }) => {
      const exclusionValues: number[] = [];
      const individualParticipants = participant?.individualParticipants;
      if (individualParticipants?.length) {
        const scaleValues: any[] = [];
        let value: any = 0;

        for (const participant of individualParticipants) {
          const { scaleValue, value: pValue } = getSideValue({
            singlesForDoubles,
            valueAccessor,
            participant,
            matchUpType,
            scaleName,
          });
          const { exclude, exclusionValue } = checkExcludeParticipant(scaleValue);
          if (exclude) exclusionValues.push(exclusionValue);
          scaleValues.push(scaleValue);

          if (pValue && !Number.isNaN(Number(value))) {
            value += pValue;
          } else {
            value = undefined;
          }
        }

        return {
          participantName: participant.participantName,
          exclusionValues,
          scaleValues,
          value,
        };
      } else if (participant) {
        const { scaleValue, value } = getSideValue({
          singlesForDoubles,
          valueAccessor,
          matchUpType,
          participant,
          scaleName,
        });
        const { exclude, exclusionValue } = checkExcludeParticipant(scaleValue);
        if (exclude) exclusionValues.push(exclusionValue);

        return {
          participantName: participant.participantName,
          exclusionValues,
          scaleValue,
          value,
        };
      } else {
        return {};
      }
    });
}

function getSideValue({ singlesForDoubles, valueAccessor, matchUpType, participant, scaleName }) {
  const type = singlesForDoubles ? SINGLES : matchUpType;
  const ranking = participant?.rankings?.[type]?.find((ranking) => ranking.scaleName === scaleName);
  const rating = participant?.ratings?.[type]?.find((rating) => rating.scaleName === scaleName);
  const scaleValue = (rating || ranking)?.scaleValue;
  const value = valueAccessor ? scaleValue?.[valueAccessor] : scaleValue;
  return { scaleValue, value };
}

// given a grouping of matchUps, how accurate were the scaleValues in predicting winner
function getGroupingAccuracy({ excludeMargin, exclusionRule, valueAccessor, ascending, scaleName, matchUps }) {
  const accuracy: any = { affirmative: [], negative: [], excluded: [] };

  for (const matchUp of matchUps) {
    processMatchUp({
      matchUp,
      accuracy,
      excludeMargin,
      exclusionRule,
      valueAccessor,
      ascending,
      scaleName,
    });
  }

  const denominator = accuracy.affirmative.length + accuracy.negative.length;
  const percent = denominator && (accuracy.affirmative.length / denominator) * 100;

  accuracy.percent = percent ? Math.round(100 * percent) / 100 : 0;

  return accuracy;
}

function processMatchUp({ matchUp, accuracy, excludeMargin, exclusionRule, valueAccessor, ascending, scaleName }) {
  const { matchUpType, sides, score, winningSide } = matchUp;
  if (!winningSide) return;

  if (exclusionRule && (!exclusionRule.valueAccessor || !exclusionRule.range)) {
    accuracy.error = {
      info: 'exclusionRule requires valueAccessor and range',
      error: MISSING_VALUE,
    };
    return;
  }

  const winningIndex = winningSide - 1;

  const sideValues = getSideValues({
    exclusionRule,
    valueAccessor,
    matchUpType,
    scaleName,
    sides,
  });

  if (handleExclusionRule({ exclusionRule, sideValues, accuracy, score, winningSide })) return;

  if (hasMissingValues(sideValues)) {
    accuracy.excluded.push({
      scoreString: score?.scoreStringSide1,
      missingValues: true,
      winningSide,
      sideValues,
    });
    return;
  }

  const valuesGap = sideValues[winningIndex].value - sideValues[1 - winningIndex].value;

  if (shouldExcludeGap({ excludeMargin, valuesGap })) {
    accuracy.excluded.push({
      scoreString: score?.scoreStringSide1,
      excludeMargin,
      winningSide,
      excludeGap: true,
      sideValues,
      valuesGap,
    });
    return;
  }

  // signedGap > 0 ⇒ rating-favored player won (affirmative).
  // For ascending: false the higher value is stronger (UTR, ELO, NTRP, …) so favored-wins ⇔ valuesGap > 0.
  // For ascending: true the lower value is stronger (WTN, BWF rank, …) so favored-wins ⇔ valuesGap < 0.
  const signedGap = ascending ? -valuesGap : valuesGap;
  const winningScoreString = winningSide === 1 ? score?.scoreStringSide1 : score?.scoreStringSide2;

  if (signedGap > 0) {
    accuracy.affirmative.push({
      winningScoreString,
      winningSide,
      sideValues,
      valuesGap,
      score,
    });
  } else {
    accuracy.negative.push({
      winningScoreString,
      winningSide,
      sideValues,
      valuesGap,
      score,
    });
  }
}

function handleExclusionRule({ exclusionRule, sideValues, accuracy, score, winningSide }) {
  if (exclusionRule) {
    const exclusionValues = sideValues.flatMap(({ exclusionValues }) => exclusionValues);
    if (exclusionValues.length) {
      accuracy.excluded.push({
        scoreString: score?.scoreStringSide1,
        exclusionValues,
        winningSide,
        sideValues,
      });
      return true;
    }
  }
  return false;
}

function hasMissingValues(sideValues) {
  return sideValues.filter((value) => ![undefined, '', null].includes(value.value)).length < 2;
}

function shouldExcludeGap({ excludeMargin, valuesGap }) {
  const floatMargin = Number.parseFloat(excludeMargin || 0);
  return floatMargin && Math.abs(valuesGap) < floatMargin;
}
