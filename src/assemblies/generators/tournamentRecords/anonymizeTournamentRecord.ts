import { postalCodeMocks, stateMocks, cityMocks } from '../mocks/address';
import { extractDate, formatDate } from '@Tools/dateTime';
import { generatePersons } from '../mocks/generatePersons';
import { generateAddress } from '../mocks/generateAddress';
import { findExtension } from '@Acquire/findExtension';
import { nameMocks } from '../mocks/nameMocks';
import { UUID } from '@Tools/UUID';

// constants
import { FLIGHT_PROFILE, internalExtensions, PERSON_REQUESTS, SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { isGendered } from '@Validators/isGendered';
import { coercedGender } from '@Helpers/coercedGender';

export function anonymizeTournamentRecord({
  keepExtensions = [],
  anonymizeParticipantNames = true,
  tournamentRecord,
  tournamentName,
  personIds = [],
  tournamentId,
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const extensionsToKeep = Array.isArray(keepExtensions)
    ? internalExtensions.concat(...keepExtensions)
    : internalExtensions;

  const filterExtensions = (element) => {
    if (Array.isArray(keepExtensions)) {
      return element?.extensions?.filter((extension) => extensionsToKeep.includes(extension.name));
    } else {
      return element?.extensions;
    }
  };

  const idMap = {};

  anonymizeTournamentHeader({ tournamentRecord, filterExtensions, idMap, tournamentId, tournamentName });
  anonymizeParticipantIds({ tournamentRecord, filterExtensions, idMap });
  anonymizeVenues({ tournamentRecord, filterExtensions, idMap });
  anonymizeEvents({ tournamentRecord, filterExtensions, idMap });
  anonymizeIndividualPersons({
    anonymizeParticipantNames,
    tournamentRecord,
    filterExtensions,
    personIds,
    idMap,
  });
  anonymizeGroupedParticipants({ tournamentRecord });
  anonymizeExtensionIds({ tournamentRecord, idMap });

  return { ...SUCCESS };
}

function anonymizeTournamentHeader({ tournamentRecord, filterExtensions, idMap, tournamentId, tournamentName }) {
  tournamentRecord.extensions = filterExtensions(tournamentRecord);

  const newTournamentId = tournamentId || UUID();
  idMap[tournamentRecord.tournamentId] = newTournamentId;
  tournamentRecord.tournamentId = newTournamentId;

  tournamentRecord.createdAt = new Date().toISOString();
  tournamentRecord.tournamentName = tournamentName || `Anonymized: ${formatDate(new Date())}`;
  tournamentRecord.isMock = true;

  delete tournamentRecord.parentOrganisation;
}

function anonymizeParticipantIds({ tournamentRecord, filterExtensions, idMap }) {
  for (const participant of tournamentRecord.participants ?? []) {
    participant.extensions = filterExtensions(participant);
    participant.onlineResources = [];

    const newParticipantId = UUID();
    idMap[participant.participantId] = newParticipantId;
    participant.participantId = newParticipantId;
  }

  for (const participant of tournamentRecord.participants ?? []) {
    if (Array.isArray(participant.individualParticipantIds)) {
      participant.individualParticipantIds = participant.individualParticipantIds.map(
        (individualParticipantId) => idMap[individualParticipantId],
      );
    }
  }
}

function anonymizeVenues({ tournamentRecord, filterExtensions, idMap }) {
  let venueIndex = 0;
  for (const venue of tournamentRecord.venues ?? []) {
    venue.venueAbbreviation = `V${venueIndex}`;
    venue.extensions = filterExtensions(venue);
    venue.venueName = `Venue #${venueIndex}`;

    venue.onlineResources = [];
    venue.addresses = [];

    const newVenueId = UUID();
    idMap[venue.venueId] = newVenueId;

    venue.isMock = true;
    venueIndex += 1;

    let courtIndex = 0;
    for (const court of venue.courts ?? []) {
      court.courtName = `V${venueIndex}C${courtIndex}`;
      court.extensions = filterExtensions(court);
      court.onlineResources = [];
      court.isMock = true;
      courtIndex += 1;
    }
  }
}

function anonymizeDrawDefinition({ drawDefinition, filterExtensions, idMap }) {
  drawDefinition.extensions = filterExtensions(drawDefinition);
  const newDrawId = UUID();
  idMap[drawDefinition.drawId] = newDrawId;
  drawDefinition.drawId = newDrawId;
  drawDefinition.isMock = true;

  if (Array.isArray(drawDefinition.entries)) {
    for (const entry of drawDefinition.entries) {
      entry.participantId = idMap[entry.participantId];
    }
  }

  const updateStructure = (structure) => {
    structure.extensions = filterExtensions(structure);
    const newStructureId = UUID();
    idMap[structure.structureId] = newStructureId;
    structure.structureId = newStructureId;

    for (const assignment of structure.positionAssignments ?? []) {
      if (assignment.participantId) assignment.participantId = idMap[assignment.participantId];
    }

    for (const assignment of structure.seedAssignments ?? []) {
      if (assignment.participantId) assignment.participantId = idMap[assignment.participantId];
    }

    for (const matchUp of structure.matchUps ?? []) {
      matchUp.isMock = true;

      for (const side of matchUp.sides ?? []) {
        if (!side.lineUp) continue;
        side.lineUp = side.lineUp.map(({ participantId, collectionAssignments }) => ({
          participantId: idMap[participantId],
          collectionAssignments,
        }));
      }
    }
  };

  for (const structure of drawDefinition.structures ?? []) {
    updateStructure(structure);

    if (Array.isArray(structure.structures)) {
      for (const childStructure of structure.structures) {
        updateStructure(childStructure);
      }
    }
  }

  for (const link of drawDefinition.links ?? []) {
    link.source.structureId = idMap[link.source.structureId];
    link.target.structureId = idMap[link.target.structureId];
  }
}

function anonymizeEvents({ tournamentRecord, filterExtensions, idMap }) {
  let eventCount = 1;
  for (const event of tournamentRecord.events ?? []) {
    event.extensions = filterExtensions(event);
    event.onlineResources = [];
    event.isMock = true;

    const newEventId = UUID();
    idMap[event.eventId] = newEventId;
    event.eventId = newEventId;
    const categoryName =
      event.category?.categoryName || event.category?.ageCategoryCode || event.category?.ratingType || event.gender;
    event.eventName = `Event ${eventCount} ${categoryName}`;

    if (Array.isArray(event.entries)) {
      for (const entry of event.entries) {
        entry.participantId = idMap[entry.participantId];
      }
    }

    for (const drawDefinition of event.drawDefinitions ?? []) {
      anonymizeDrawDefinition({ drawDefinition, filterExtensions, idMap });
    }

    const { extension: flightProfile } = findExtension({
      name: FLIGHT_PROFILE,
      element: event,
    });

    if (Array.isArray(flightProfile?.value?.flights)) {
      flightProfile?.value.flights?.forEach((flight) => {
        flight.drawId = idMap[flight.drawId];
        if (Array.isArray(flight.drawEntries)) {
          for (const entry of flight.drawEntries) {
            entry.participantId = idMap[entry.participantId];
          }
        }
      });
    }

    eventCount += 1;
  }
}

function anonymizeIndividualPersons({
  anonymizeParticipantNames,
  tournamentRecord,
  filterExtensions,
  personIds,
  idMap,
}) {
  const consideredDate = tournamentRecord.startDate || formatDate(new Date());

  const individualParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === INDIVIDUAL,
  );

  const gendersCount = individualParticipants.reduce(
    (counts, participant) => {
      const gender = participant.person?.sex;
      const coerced = coercedGender(gender);
      if (coerced && isGendered(gender)) {
        counts[coerced] += 1;
      } else {
        counts[OTHER] += 1;
      }
      return counts;
    },
    { [MALE]: 0, [FEMALE]: 0, [OTHER]: 0 },
  );

  const genderedPersons = Object.assign(
    {},
    ...Object.keys(gendersCount).map((gender) => ({
      [gender]:
        generatePersons({
          category: { ageCategoryCode: 'O18' },
          count: gendersCount[gender],
          addressProps: { citiesCount: 10 },
          personExtensions: [],
          consideredDate,
          sex: gender,
        })?.persons ?? [],
    })),
  );

  const genderedIndices = { [MALE]: 0, [FEMALE]: 0, [OTHER]: 0 };

  const individualParticipantsCount = individualParticipants.length;
  const addressValues = buildAddressValues(individualParticipants, individualParticipantsCount);

  individualParticipants.forEach((individualParticipant, participantIndex) => {
    anonymizeIndividualPerson({
      anonymizeParticipantNames,
      individualParticipant,
      filterExtensions,
      participantIndex,
      genderedPersons,
      genderedIndices,
      addressValues,
      personIds,
      idMap,
    });
  });
}

function buildAddressValues(individualParticipants, individualParticipantsCount) {
  const addressComponents = individualParticipants.reduce(
    (components, participant) => {
      const address = participant.person?.addresses?.[0] ?? {};
      const { city, state, postalCode } = address;
      if (!components.cities.includes(city)) components.cities.push(city);
      if (!components.states.includes(state)) components.states.push(state);
      if (!components.postalCodes.includes(postalCode)) components.postalCodes.push(postalCode);
      return components;
    },
    { cities: [], postalCodes: [], states: [] },
  );

  const postalCodesCount = addressComponents.postalCodes.length;
  const citiesCount = addressComponents.cities.length;
  const statesCount = addressComponents.states.length;

  const { cities } = cityMocks({
    count: citiesCount || individualParticipantsCount,
    participantsCount: individualParticipantsCount,
  });
  const { states } = stateMocks({
    count: statesCount || individualParticipantsCount,
    participantsCount: individualParticipantsCount,
  });
  const { postalCodes } = postalCodeMocks({
    count: postalCodesCount || individualParticipantsCount,
    participantsCount: individualParticipantsCount,
  });

  return { cities, states, postalCodes };
}

function anonymizeIndividualPerson({
  anonymizeParticipantNames,
  individualParticipant,
  filterExtensions,
  participantIndex,
  genderedPersons,
  genderedIndices,
  addressValues,
  personIds,
  idMap,
}) {
  const person = individualParticipant?.person;
  const gender = person?.sex || OTHER;
  const birthYear = extractDate(person?.birthDate)?.split('-')[0];

  const genderedIndex = genderedIndices[gender];
  const generatedPerson = genderedPersons[gender][genderedIndex];
  genderedIndices[gender] += 1;

  if (birthYear) {
    const [, month, day] = generatedPerson?.birthDate?.split('-') ?? [];
    const birthDate = [birthYear, month, day].join('-');
    generatedPerson.birthDate = birthDate;
  }

  if (person?.addresses) {
    const address = generateAddress({
      ...addressValues,
      participantIndex,
      nationalityCode: generatedPerson.nationalityCode,
    });

    generatedPerson.addresses = [address];
  }

  generatedPerson.personId = personIds?.[participantIndex] || UUID();

  if (anonymizeParticipantNames) {
    generatedPerson.standardFamilyName = generatedPerson.lastName;
    generatedPerson.standardGivenName = generatedPerson.firstName;
    individualParticipant.participantName = `${generatedPerson.standardGivenName} ${generatedPerson.standardFamilyName}`;
  } else {
    generatedPerson.standardFamilyName = person?.standardFamilyName;
    generatedPerson.standardGivenName = person?.standardGivenName;
  }

  delete generatedPerson.firstName;
  delete generatedPerson.lastName;

  generatedPerson.extensions = filterExtensions(person);
  individualParticipant.person = generatedPerson;
  idMap[person?.personId] = generatedPerson.personId;
}

function anonymizeGroupedParticipants({ tournamentRecord }) {
  const individualParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === INDIVIDUAL,
  );

  const pairParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === PAIR,
  );

  pairParticipants.forEach((pairParticipant) => {
    const { individualParticipantIds } = pairParticipant;
    pairParticipant.participantName = generatePairParticipantName({
      individualParticipantIds,
      individualParticipants,
    });
  });

  const teamParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === TEAM,
  );
  const teamNames = nameMocks({ count: teamParticipants.length }).names;
  teamParticipants.forEach((teamParticipant, i) => {
    teamParticipant.participantName = teamNames[i];
  });

  const groupParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === GROUP,
  );
  const groupNames = nameMocks({
    count: groupParticipants.length,
    nameRoot: 'Group',
  }).names;
  groupParticipants.forEach((teamParticipant, i) => {
    teamParticipant.participantName = groupNames[i];
  });
}

function anonymizeExtensionIds({ tournamentRecord, idMap }) {
  const { extension: schedulingProfile } = findExtension({
    element: tournamentRecord,
    name: SCHEDULING_PROFILE,
  });

  if (Array.isArray(schedulingProfile?.value)) {
    schedulingProfile?.value.forEach((round) => {
      round.tournamentId = idMap[round.tournamentId];
      round.structureId = idMap[round.structureId];
      round.eventId = idMap[round.eventId];
      round.drawId = idMap[round.drawId];
    });
  }

  const { extension: personRequests } = findExtension({
    element: tournamentRecord,
    name: PERSON_REQUESTS,
  });

  if (Array.isArray(personRequests?.value)) {
    personRequests?.value.forEach((request) => {
      request.personId = idMap[request.personId];
    });
  }
}

function generatePairParticipantName({ individualParticipantIds, individualParticipants }) {
  let participantName = individualParticipants
    .filter(({ participantId }) => individualParticipantIds.includes(participantId))
    .map((p) => p.person?.standardFamilyName || p.participantOtherName || p.participantName || '')
    .filter(Boolean)
    .sort()
    .join('/');

  if (individualParticipantIds.length === 1) participantName += '/Unknown';
  return participantName;
}
