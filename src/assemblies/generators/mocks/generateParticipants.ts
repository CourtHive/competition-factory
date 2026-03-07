import { isNumeric, randomInt, skewedDistribution } from '@Tools/math';
import { cityMocks, stateMocks, postalCodeMocks } from './address';
import { generateRange, shuffleArray } from '@Tools/arrays';
import { definedAttributes } from '@Tools/definedAttributes';
import { genParticipantId } from './genParticipantId';
import { isValidDateString } from '@Tools/dateTime';
import { generateAddress } from './generateAddress';
import { generatePersons } from './generatePersons';
import { countries } from '@Fixtures/countryData';
import { isObject } from '@Tools/objects';
import { nameMocks } from './nameMocks';
import { UUID } from '@Tools/UUID';

// constants and fixtures
import defaultRatingsParameters from '@Fixtures/ratings/ratingsParameters';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { RANKING, RATING, SCALE } from '@Constants/scaleConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { DOUBLES_MATCHUP } from '@Constants/matchUpTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';

export function generateParticipants(params): {
  participants?: any[];
  error?: ErrorType;
} {
  let {
    scaledParticipantsCount, // number of participants to assign rankings/ratings
    rankingRange, // range of ranking positions to generate
  } = params;

  const {
    ratingsParameters = defaultRatingsParameters,
    valuesInstanceLimit,
    ratingsValues = [],
    consideredDate,
    categories,
    category,

    nationalityCodesCount,
    nationalityCodeType,
    nationalityCodes,

    participantsCount = 32,
    participantType,
    teamSize = 8,
    personIds,
    idPrefix,
    uuids,

    personExtensions,
    addressProps,
    gendersCount, // used by mocksEngine; internally calculated
    matchUpType,
    personData,
    sex,

    participantRole: paramRole,

    inContext,
    withISO2,
    withIOC,

    scaleAllParticipants, // optional boolean
  } = params;

  const participantRole = paramRole || COMPETITOR;

  const doubles = participantType === PAIR || matchUpType === DOUBLES_MATCHUP;
  const team = participantType === TEAM || matchUpType === TEAM;

  if (
    rankingRange &&
    (!Array.isArray(rankingRange) || !rankingRange.every((r) => isNumeric(r)) || rankingRange.length !== 2)
  ) {
    rankingRange = undefined;
  }

  scaledParticipantsCount = scaleAllParticipants ? participantsCount : scaledParticipantsCount;
  const defaultRankingRange = 1000;
  const rankingUpperBound =
    scaledParticipantsCount && scaledParticipantsCount > defaultRankingRange
      ? scaledParticipantsCount
      : defaultRankingRange;
  rankingRange = rankingRange || [1, rankingUpperBound];
  rankingRange[1] += 1; // so that behavior is as expected

  const individualParticipantsCount = participantsCount * ((doubles && 2) || (team && (teamSize ?? 8)) || 1);

  const result = generatePersons({
    count: individualParticipantsCount,
    personExtensions,
    consideredDate,
    gendersCount,
    personData,
    category,
    sex,
  });
  if (result.error) return result;

  const { nationalityCodes: personNationalityCodes, persons: mockedPersons } = result;

  // generated arrays of rankings and ratings to be attached as scaleItems
  const doublesRankings = {},
    singlesRankings = {},
    singlesRatings = {},
    doublesRatings = {};

  const assignResult = (result) => {
    Object.assign(doublesRankings, result.doublesRankings);
    Object.assign(singlesRankings, result.singlesRankings);
    Object.assign(doublesRatings, result.doublesRatings);
    Object.assign(singlesRatings, result.singlesRatings);
  };

  if (isObject(category)) {
    const result = genRatings({
      scaledParticipantsCount,
      ratingsParameters,
      participantType,
      ratingsValues,
      rankingRange,
      category,
    });
    assignResult(result);
  }
  if (Array.isArray(categories)) {
    categories.forEach((category) => {
      const result = genRatings({
        scaledParticipantsCount,
        ratingsParameters,
        participantType,
        ratingsValues,
        rankingRange,
        category,
      });
      assignResult(result);
    });
  }

  const countryCodes = countries.filter((country) =>
    nationalityCodeType === 'IOC' ? country.ioc || country.iso : country.iso,
  );

  function getMin(count) {
    const instances = Math.ceil(individualParticipantsCount / count);
    if (valuesInstanceLimit && instances > valuesInstanceLimit)
      return Math.ceil(individualParticipantsCount / valuesInstanceLimit);
    return count;
  }

  const { postalCodesProfile, postalCodesCount, statesProfile, citiesProfile, citiesCount, statesCount } =
    addressProps || {};

  const valuesFromProfile = (profile) =>
    Object.keys(profile).flatMap((key) => generateRange(0, statesProfile[key]).map(() => key));

  const cities =
    (citiesProfile && valuesFromProfile(citiesProfile)) ||
    addressProps?.cities ||
    cityMocks({
      count: citiesCount || individualParticipantsCount,
      participantsCount: individualParticipantsCount,
    }).cities;
  const states =
    (statesProfile && valuesFromProfile(statesProfile)) ||
    addressProps?.states ||
    stateMocks({
      count: statesCount || individualParticipantsCount,
      participantsCount: individualParticipantsCount,
    }).states;
  const postalCodes =
    (postalCodesProfile && valuesFromProfile(postalCodesProfile)) ||
    addressProps?.postalCodes ||
    postalCodeMocks({
      count: postalCodesCount || individualParticipantsCount,
      participantsCount: individualParticipantsCount,
    }).postalCodes;

  const addressValues = { cities, states, postalCodes };

  const isoMin = getMin(nationalityCodesCount);
  const isoList = isoMin
    ? shuffleArray(countryCodes).slice(0, nationalityCodesCount)
    : (nationalityCodes && countryCodes.filter((isoCountry) => nationalityCodes.includes(isoCountry.iso))) ||
      countryCodes;

  const countriesList = shuffleArray(
    generateRange(0, Math.ceil(individualParticipantsCount / (isoMin || 1)))
      .map(() => isoList)
      .flat(Infinity),
  );

  const teamNames = nameMocks({ count: participantsCount }).names;
  const participants = generateRange(0, participantsCount).flatMap((i) => {
    const sideParticipantsCount = (doubles && 2) || (team && (teamSize ?? 8)) || 1;
    const individualParticipants = generateRange(0, sideParticipantsCount).map((j) => {
      const participantIndex = i * sideParticipantsCount + j;
      return generateIndividualParticipant(participantIndex);
    });

    const individualParticipantIds = individualParticipants.map((participant) => participant.participantId);

    const pairName = individualParticipants.map((i) => i.person.standardFamilyName).join('/');

    const participantType = doubles ? PAIR : TEAM;
    const groupParticipant: any = {
      participantId: genParticipantId({
        participantType,
        index: i,
        idPrefix,
        uuids,
      }),
      participantName: doubles ? pairName : teamNames[i],
      participantRole,
      individualParticipantIds,
      participantType,
    };

    if (inContext) groupParticipant.individualParticipants = individualParticipants;

    return doubles || team ? [groupParticipant, ...individualParticipants] : individualParticipants;
  });

  return { participants, ...SUCCESS };

  function generateIndividualParticipant(participantIndex) {
    const person = mockedPersons[participantIndex];
    const {
      nationalityCode: personNationalityCode,
      participantExtensions,
      participantTimeItems,
      extensions,
      firstName,
      birthDate,
      lastName,
      personId,
      sex,
    } = person || {};
    const standardGivenName = firstName || 'GivenName';
    const standardFamilyName = lastName || 'FamilyName';
    const participantName = `${standardGivenName} ${standardFamilyName}`;
    const country = countriesList[participantIndex];
    const nationalityCode =
      (personNationalityCodes?.length && personNationalityCode) ||
      (country && (nationalityCodeType === 'IOC' ? country.ioc || country.iso : country.iso || country.ioc)) ||
      personNationalityCode;

    if (countriesList?.length && !nationalityCode && !personNationalityCode) {
      console.log('%c Invalid Nationality Code', { participantIndex, country });
    }
    const address = generateAddress({
      ...addressValues,
      participantIndex,
      nationalityCode,
    });

    const participant = definedAttributes({
      participantId: genParticipantId({
        participantType: INDIVIDUAL,
        index: participantIndex,
        idPrefix,
        uuids,
      }),
      extensions: participantExtensions,
      timeItems: participantTimeItems,
      participantRole,
      participantType: INDIVIDUAL,
      participantName,
      person: {
        personId: personId || (personIds?.length && personIds[participantIndex]) || UUID(),
        birthDate: isValidDateString(birthDate) ? birthDate : undefined,
        addresses: [address],
        standardFamilyName,
        standardGivenName,
        nationalityCode,
        extensions,
        sex,
      },
    });

    if (withIOC && nationalityCode) {
      const country = countries.find(({ iso }) => iso === nationalityCode);
      if (country?.ioc) participant.person.iocNationalityCode = country.ioc;
      if (country?.label) participant.person.countryName = country.label;
    }
    if (withISO2 && nationalityCode) {
      const country = countries.find(({ iso }) => iso === nationalityCode);
      if (country?.iso2) participant.person.iso2NationalityCode = country.iso2;
      if (country?.label) participant.person.countryName = country.label;
    }

    const processCategory = (category) => {
      const scaleName = category.categoryName || category.ratingType || category.ageCategoryCode;
      const singlesRanking = singlesRankings[scaleName]?.[participantIndex];
      const doublesRanking = doublesRankings[scaleName]?.[participantIndex];

      addScaleItem({
        scaleValue: singlesRanking,
        eventType: SINGLES_EVENT,
        scaleType: RANKING,
        participant,
        category,
      });
      addScaleItem({
        scaleValue: doublesRanking,
        eventType: DOUBLES_EVENT,
        scaleType: RANKING,
        participant,
        category,
      });

      const singlesRating = singlesRatings[scaleName]?.[participantIndex];
      const doublesRating = doublesRatings[scaleName]?.[participantIndex];

      addScaleItem({
        scaleValue: singlesRating,
        eventType: SINGLES_EVENT,
        scaleType: RATING,
        participant,
        category,
      });
      addScaleItem({
        scaleValue: doublesRating,
        eventType: DOUBLES_EVENT,
        scaleType: RATING,
        participant,
        category,
      });
    };

    if (Array.isArray(categories)) {
      categories.forEach((category) => processCategory(category));
    } else if (category) {
      processCategory(category);
    }

    return participant;
  }
}

function addScaleItem({ scaleValue: itemValue, participant, eventType, scaleType, category }) {
  const scaleName = category.categoryName || category.ratingType || category.ageCategoryCode;
  const itemType = [SCALE, scaleType, eventType, scaleName].join('.');
  const timeItem = { itemValue, itemType };
  if (scaleName && itemValue) {
    if (!participant.timeItems) participant.timeItems = [];
    participant.timeItems.push(timeItem);
  }
}

function genRatings(params) {
  const { category, scaledParticipantsCount, ratingsParameters, participantType, ratingsValues = [] } = params;
  const rankingRange = category.rankingRange || params.rankingRange || [1, 1000];
  const doublesRankings = {},
    singlesRankings = {},
    singlesRatings = {},
    doublesRatings = {};

  const { categoryName, ageCategoryCode, ratingType } = category;
  const scaleName = category.categoryName || category.ratingType || category.ageCategoryCode;

  if ((categoryName || ageCategoryCode) && !ratingType) {
    const [start, end] = rankingRange || [];
    singlesRankings[scaleName] = shuffleArray(generateRange(start, end)).slice(
      0,
      scaledParticipantsCount || randomInt(20, 30),
    );

    if ([PAIR, TEAM].includes(participantType)) {
      const [start, end] = rankingRange || [];
      doublesRankings[scaleName] = shuffleArray(generateRange(start, end)).slice(
        0,
        scaledParticipantsCount || randomInt(20, 30),
      );
    }
  }

  if (ratingType && ratingsParameters[ratingType]) {
    // ratingAttributes allows selected attributes of ratingParameters to be overridden
    const { ratingMax, ratingMin, ratingAttributes } = category;

    const ratingParameters = {
      ...ratingsParameters[ratingType],
      ...(ratingAttributes || {}),
    };

    const { attributes = {}, decimalsCount, accessors, range, step } = ratingParameters;

    const getAttributes = (attributes) => {
      const generatedAttributes = {};

      const attributeKeys = Object.keys(attributes || {});
      for (const attribute of attributeKeys) {
        const attributeValue = attributes[attribute];

        if (typeof attributeValue === 'object' && attributeValue.generator) {
          const { range } = attributeValue;
          const [min, max] = range.slice().sort();

          generatedAttributes[attribute] = randomInt(min, max);
        } else {
          generatedAttributes[attribute] = attributeValue;
        }
      }

      return generatedAttributes;
    };

    const inverted = range[0] > range[1];
    const skew = inverted ? 2 : 0.7;
    const [min, max] = range.slice().sort();
    const generateRatings = () => {
      const ratingsBucket = generateRange(0, 2000) // overgenerate because filter and restricted range will impact final count
        .map(() => skewedDistribution(min, max, skew, step, decimalsCount));
      return ratingsBucket
        .filter((rating) => (!ratingMax || rating <= ratingMax) && (!ratingMin || rating >= ratingMin))
        .slice(0, scaledParticipantsCount || randomInt(20, 30))
        .map((scaleValue) => {
          return !accessors
            ? scaleValue
            : Object.assign(
                {},
                ...accessors.map((accessor) => ({ [accessor]: scaleValue })),
                getAttributes(attributes),
              );
        });
    };

    const generatedRatings = generateRatings();
    singlesRatings[scaleName] = [...ratingsValues, ...generatedRatings];
    if ([PAIR, TEAM].includes(participantType)) {
      doublesRatings[scaleName] = [...ratingsValues, ...generatedRatings];
    }
  }

  return { singlesRankings, doublesRankings, singlesRatings, doublesRatings };
}
