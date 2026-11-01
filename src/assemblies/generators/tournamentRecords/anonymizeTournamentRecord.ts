import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { postalCodeMocks, stateMocks, cityMocks } from '@Generators/mocks/address';
import { generateAddress } from '@Generators/mocks/generateAddress';
import { generatePersons } from '@Generators/mocks/generatePersons';
import { extractDate, formatDate } from '@Tools/dateTime';
import { nameMocks } from '@Generators/mocks/nameMocks';
import { nowIso, now } from '@Tools/clock';
import { UUID } from '@Tools/UUID';

// constants and types
import { internalExtensions, LINKED_TOURNAMENTS, MUTATION_LOCKS } from '@Constants/extensionConstants';
import type { Extension, MatchUp, Tournament, Venue } from '@Types/tournamentTypes';
import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { AnonymizeTournamentRecordArgs } from '@Types/mocksTypes';
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { coercedGender } from '@Helpers/coercedGender';
import { SUCCESS } from '@Constants/resultConstants';
import { isGendered } from '@Validators/isGendered';

/** a record element read and rewritten generically */
type Loose = Record<string, any>;
type IdMap = Map<string, string>;
type FilterExtensions = (element?: { extensions?: Extension[] }) => Extension[] | undefined;
type Context = {
  filterExtensions: FilterExtensions;
  random?: () => number;
  newId: () => string;
  idMap: IdMap;
};

/**
 * Removed wherever they occur in the record, at any depth: free text, contact details, web addresses and
 * identifiers issued by other systems. Each either names, locates or contacts somebody, or links the copy back to
 * the original elsewhere.
 */
const CLEARED_EVERYWHERE = new Set(['notes', 'contacts', 'onlineResources']);
const isOtherIdsKey = (key: string) => key.endsWith('OtherIds');

/** Tournament attributes that name or identify the real tournament, its organiser or its sanction. */
const CLEARED_TOURNAMENT_ATTRIBUTES = [
  'linkedTournamentIds',
  'parentOrganisationId',
  'registrationProfile',
  'tournamentSeriesId',
  'cancellationReason',
  'promotionalName',
  'formalName',
  'sanctions',
  'sanction',
];
const CLEARED_VENUE_ATTRIBUTES = ['parentOrganisationId', 'facilityId', 'addresses'];
const CLEARED_COURT_ATTRIBUTES = ['latitude', 'longitude'];
const CLEARED_EVENT_ATTRIBUTES = ['tennisOfficialIds', 'registrationProfile', 'cancellationReason', 'sanction'];

/**
 * Internal extensions that are dropped even though internal extensions are otherwise kept: LINKED_TOURNAMENTS names
 * real tournaments outside the record, and MUTATION_LOCKS carries live lock tokens.
 */
const DROPPED_INTERNAL_EXTENSIONS = new Set([LINKED_TOURNAMENTS, MUTATION_LOCKS]);

/**
 * Replace the personal and identifying data in a tournament record with generated data, keeping its structure,
 * results and schedule.
 *
 * **The record is rewritten in place** and returned as `tournamentRecord`. Pass a copy (`structuredClone`) to keep
 * the original. Never run it through a stateful engine against a live record: it would anonymize the record that
 * engine holds.
 *
 * Every id the record DEFINES (tournament, participants, persons, events, draws, structures, matchUps, venues,
 * courts) is replaced by a new one, and every reference to it, at any depth, follows: entries, positions, links,
 * schedules and timeItems, scheduling and flight profiles, extensions, presence logs. See the mocks governor docs for
 * what is cleared and what is retained by design.
 */
export function anonymizeTournamentRecord(params?: AnonymizeTournamentRecordArgs) {
  const {
    anonymizeParticipantNames = true,
    keepExtensions = [],
    parentOrganisation,
    tournamentRecord,
    tournamentName,
    personIds = [],
    tournamentId,
    random,
  } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const extensionsToKeep = new Set(
    Array.isArray(keepExtensions) ? internalExtensions.concat(...keepExtensions) : internalExtensions,
  );
  const filterExtensions: FilterExtensions = (element) =>
    Array.isArray(keepExtensions)
      ? element?.extensions?.filter((extension) => extensionsToKeep.has(extension.name))
      : element?.extensions;

  const context: Context = {
    newId: () => UUID(undefined, random),
    idMap: new Map(),
    filterExtensions,
    random,
  };

  const record: Loose = tournamentRecord;
  const newPersonIds = mapDefinedIds({ record, context, tournamentId, personIds });

  anonymizeTournamentHeader({ record, context, parentOrganisation, tournamentName });
  anonymizeParticipants({ record, context, anonymizeParticipantNames });
  anonymizeVenues(record.venues, context, { venueIndex: 0 });
  anonymizeEvents({ record, context });
  forEachMatchUp(record, anonymizeMatchUp);
  anonymizeIndividualPersons({ record, context, anonymizeParticipantNames, newPersonIds });
  anonymizeGroupedParticipants({ record, random });
  remapReferences(record, context.idMap);

  return { ...SUCCESS, tournamentRecord: record as Tournament };
}

/**
 * Pass 1: a new id for every id the record defines, before anything is rewritten, so that every later step and the
 * final reference walk see one complete map. Returns each INDIVIDUAL participant's new personId, keyed by its
 * (original) participantId.
 */
function mapDefinedIds({ record, context, tournamentId, personIds }) {
  const { idMap, newId } = context;
  const add = (id: unknown, replacement?: string) => {
    if (typeof id !== 'string' || idMap.has(id)) return idMap.get(id as string);
    const mapped = replacement || newId();
    idMap.set(id, mapped);
    return mapped;
  };

  add(record.tournamentId, tournamentId);
  if (!record.tournamentId) record.tournamentId = tournamentId || newId();

  const newPersonIds = new Map<string, string>();
  let individualIndex = 0;
  for (const participant of record.participants ?? []) {
    add(participant.participantId);
    if (participant.participantType !== INDIVIDUAL) continue;
    const originalPersonId = participant.person?.personId ?? participant.personId;
    const newPersonId = add(originalPersonId, personIds?.[individualIndex]) || personIds?.[individualIndex] || newId();
    // a participant-level pointer that disagrees with its person still points at that person afterwards
    if (participant.personId && participant.personId !== originalPersonId) add(participant.personId, newPersonId);
    newPersonIds.set(participant.participantId, newPersonId);
    individualIndex += 1;
  }

  const addVenues = (venues: Venue[] = []) => {
    for (const venue of venues) {
      add(venue.venueId);
      for (const court of venue.courts ?? []) add(court.courtId);
      addVenues(venue.subVenues);
    }
  };
  addVenues(record.venues);

  const addStructure = (structure: Loose) => {
    add(structure.structureId);
    for (const child of structure.structures ?? []) addStructure(child);
  };
  for (const event of record.events ?? []) {
    add(event.eventId);
    for (const drawDefinition of event.drawDefinitions ?? []) {
      add(drawDefinition.drawId);
      for (const structure of drawDefinition.structures ?? []) addStructure(structure);
    }
  }
  forEachMatchUp(record, (matchUp) => add(matchUp.matchUpId));

  return newPersonIds;
}

/** Every stored matchUp: drawn (including nested structures and tieMatchUps), draw-level and tournament-level. */
function forEachMatchUp(record: Loose, fn: (matchUp: MatchUp) => void) {
  const visitMatchUps = (matchUps: MatchUp[] = []) => {
    for (const matchUp of matchUps) {
      fn(matchUp);
      visitMatchUps(matchUp.tieMatchUps);
    }
  };
  const visitStructure = (structure: Loose) => {
    visitMatchUps(structure.matchUps);
    for (const child of structure.structures ?? []) visitStructure(child);
  };
  for (const event of record.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      visitMatchUps(drawDefinition.matchUps);
      for (const structure of drawDefinition.structures ?? []) visitStructure(structure);
    }
  }
  visitMatchUps(record.matchUps);
}

function omit(element: Loose, attributes: string[]) {
  for (const attribute of attributes) Reflect.deleteProperty(element, attribute);
}

function filterRecordExtensions(element: { extensions?: Extension[] }, context: Context) {
  const extensions = context.filterExtensions(element)?.filter(({ name }) => !DROPPED_INTERNAL_EXTENSIONS.has(name));
  if (extensions) element.extensions = extensions;
  else delete element.extensions;
}

function anonymizeTournamentHeader({ record, context, parentOrganisation, tournamentName }) {
  filterRecordExtensions(record, context);
  omit(record, CLEARED_TOURNAMENT_ATTRIBUTES);

  record.tournamentId = context.idMap.get(record.tournamentId) ?? record.tournamentId;
  record.createdAt = nowIso();
  record.tournamentName = tournamentName || `Anonymized: ${formatDate(now())}`;
  record.isMock = true;

  // Caller passes a mock provider when multi-tournament anonymization pipelines
  // need provider grouping to survive (e.g. "all tournaments for provider X"
  // queries on the anonymized corpus). Keep a map of real → mock provider on
  // the caller side and pass the consistent mock per real provider. Absent any
  // mock, drop the field entirely — the real org would leak otherwise.
  if (parentOrganisation) {
    record.parentOrganisation = parentOrganisation;
  } else {
    delete record.parentOrganisation;
  }
}

/**
 * Anonymise a presence log — `matchUp.checkIns` or `participant.presence`.
 *
 * Two separate obligations, and missing either is a leak of a different kind:
 *
 * 1. **Remap the subject.** An attestation names a `participantId`, exactly as a positionAssignment
 *    or a lineUp entry does. The reference walk at the end remaps it with every other reference.
 * 2. **Drop the attester entirely.** `attributedTo` can carry a DECLARED name, telephone and email
 *    for somebody who is NOT in the record at all — a minor's parent at the desk. Nothing else in
 *    this file would touch them, because every other scrub walks `participants` and `person`, and
 *    this person is in neither. Dropped rather than replaced: a synthesised attester would be a fact
 *    nobody stated. `notes` goes with it, being free text written at a desk.
 */
function anonymizePresenceLog(entries?: PresenceAttestation[]): PresenceAttestation[] | undefined {
  if (!Array.isArray(entries)) return entries;
  return entries.map((entry) => {
    const { attributedTo: _attributedTo, notes: _notes, ...rest } = entry ?? {};
    return rest;
  });
}

function anonymizeParticipants({ record, context, anonymizeParticipantNames }) {
  for (const participant of record.participants ?? []) {
    filterRecordExtensions(participant, context);
    if (anonymizeParticipantNames) delete participant.participantOtherName;
    if (participant.presence) participant.presence = anonymizePresenceLog(participant.presence);
  }
}

function anonymizeVenues(venues: Venue[] | undefined, context: Context, counter: { venueIndex: number }) {
  for (const venue of venues ?? []) {
    const venueIndex = counter.venueIndex;
    counter.venueIndex += 1;

    filterRecordExtensions(venue, context);
    omit(venue, CLEARED_VENUE_ATTRIBUTES);
    venue.venueAbbreviation = `V${venueIndex}`;
    venue.venueName = `Venue #${venueIndex}`;
    venue.isMock = true;

    (venue.courts ?? []).forEach((court, courtIndex) => {
      filterRecordExtensions(court, context);
      omit(court, CLEARED_COURT_ATTRIBUTES);
      court.courtName = `V${venueIndex}C${courtIndex}`;
      court.isMock = true;
    });

    anonymizeVenues(venue.subVenues, context, counter);
  }
}

function anonymizeStructure(structure: Loose, context: Context) {
  filterRecordExtensions(structure, context);
  for (const child of structure.structures ?? []) anonymizeStructure(child, context);
}

function anonymizeEvents({ record, context }) {
  (record.events ?? []).forEach((event, eventIndex) => {
    filterRecordExtensions(event, context);
    omit(event, CLEARED_EVENT_ATTRIBUTES);
    event.isMock = true;

    const categoryName =
      event.category?.categoryName || event.category?.ageCategoryCode || event.category?.ratingType || event.gender;
    event.eventName = `Event ${eventIndex + 1} ${categoryName}`;

    for (const drawDefinition of event.drawDefinitions ?? []) {
      filterRecordExtensions(drawDefinition, context);
      drawDefinition.isMock = true;
      for (const structure of drawDefinition.structures ?? []) anonymizeStructure(structure, context);
    }
  });
}

function anonymizeMatchUp(matchUp: MatchUp) {
  matchUp.isMock = true;
  if (matchUp.checkIns) matchUp.checkIns = anonymizePresenceLog(matchUp.checkIns);
  for (const side of matchUp.sides ?? []) {
    if (!side.lineUp) continue;
    side.lineUp = side.lineUp.map(({ participantId, collectionAssignments }) => ({
      participantId,
      collectionAssignments,
    }));
  }
}

function anonymizeIndividualPersons({ record, context, anonymizeParticipantNames, newPersonIds }) {
  const consideredDate = record.startDate || formatDate(now());
  const { random } = context;

  const individualParticipants = (record.participants ?? []).filter(
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
          random,
        })?.persons ?? [],
    })),
  );

  const genderedIndices = { [MALE]: 0, [FEMALE]: 0, [OTHER]: 0 };
  const addressValues = buildAddressValues(individualParticipants, random);

  individualParticipants.forEach((individualParticipant, participantIndex) => {
    anonymizeIndividualPerson({
      newPersonId: newPersonIds.get(individualParticipant.participantId) ?? context.newId(),
      anonymizeParticipantNames,
      individualParticipant,
      participantIndex,
      genderedPersons,
      genderedIndices,
      addressValues,
      context,
    });
  });
}

function buildAddressValues(individualParticipants, random?: () => number) {
  const participantsCount = individualParticipants.length;
  const cities = new Set();
  const states = new Set();
  const postalCodes = new Set();
  for (const participant of individualParticipants) {
    const { city, state, postalCode } = participant.person?.addresses?.[0] ?? {};
    cities.add(city);
    states.add(state);
    postalCodes.add(postalCode);
  }

  return {
    cities: cityMocks({ count: cities.size || participantsCount, participantsCount, random }).cities,
    states: stateMocks({ count: states.size || participantsCount, participantsCount, random }).states,
    postalCodes: postalCodeMocks({ count: postalCodes.size || participantsCount, participantsCount, random })
      .postalCodes,
  };
}

function anonymizeIndividualPerson({
  anonymizeParticipantNames,
  individualParticipant,
  participantIndex,
  genderedPersons,
  genderedIndices,
  addressValues,
  newPersonId,
  context,
}) {
  const person = individualParticipant?.person;
  const gender = person?.sex || OTHER;
  const birthYear = extractDate(person?.birthDate)?.split('-')[0];

  const genderedIndex = genderedIndices[gender];
  const generatedPerson = genderedPersons[gender][genderedIndex];
  genderedIndices[gender] += 1;

  if (birthYear) {
    const [, month, day] = generatedPerson?.birthDate?.split('-') ?? [];
    generatedPerson.birthDate = [birthYear, month, day].join('-');
  }

  if (person?.addresses) {
    generatedPerson.addresses = [
      generateAddress({ ...addressValues, participantIndex, nationalityCode: generatedPerson.nationalityCode }),
    ];
  }

  generatedPerson.personId = newPersonId;

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

  generatedPerson.extensions = context.filterExtensions(person);
  individualParticipant.person = generatedPerson;
  if (individualParticipant.personId) individualParticipant.personId = newPersonId;
}

function anonymizeGroupedParticipants({ record, random }) {
  const participants = record.participants ?? [];
  const individualsById = new Map(
    participants
      .filter(({ participantType }) => participantType === INDIVIDUAL)
      .map((participant) => [participant.participantId, participant]),
  );

  for (const pairParticipant of participants.filter(({ participantType }) => participantType === PAIR)) {
    const { individualParticipantIds } = pairParticipant;
    // only the members, so that naming every pair is linear rather than pairs × individuals
    const members = (individualParticipantIds ?? []).map((id) => individualsById.get(id)).filter(Boolean);
    pairParticipant.participantName = generatePairParticipantName({
      individualParticipants: members,
      individualParticipantIds,
    });
  }

  const teamParticipants = participants.filter(({ participantType }) => participantType === TEAM);
  const teamNames = nameMocks({ count: teamParticipants.length, random }).names;
  teamParticipants.forEach((teamParticipant, i) => {
    teamParticipant.participantName = teamNames[i];
  });

  const groupParticipants = participants.filter(({ participantType }) => participantType === GROUP);
  const groupNames = nameMocks({ count: groupParticipants.length, nameRoot: 'Group', random }).names;
  groupParticipants.forEach((groupParticipant, i) => {
    groupParticipant.participantName = groupNames[i];
  });
}

/**
 * Pass 3: one walk over the whole record. Any string that IS an original id, as a value or as an object key, at any
 * depth, becomes its replacement; the attributes in CLEARED_EVERYWHERE and any `*OtherIds` are removed.
 *
 * Generic on purpose: references live in dozens of places (entries, positions, links, matchUp schedules and
 * timeItems, scheduling and flight profiles, extension values keyed by participantId) and a per-field remap misses
 * whichever one was not listed. Only whole-string matches are replaced, so an id embedded in a longer string (a URL,
 * a composite key) is not; free text is removed instead.
 */
function remapReferences(node: unknown, idMap: IdMap) {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index++) {
      const value = node[index];
      if (typeof value === 'string') {
        const mapped = idMap.get(value);
        if (mapped) node[index] = mapped;
      } else if (value && typeof value === 'object') {
        remapReferences(value, idMap);
      }
    }
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const key of Object.keys(node)) {
    if (CLEARED_EVERYWHERE.has(key) || isOtherIdsKey(key)) {
      delete node[key];
      continue;
    }
    const value = node[key];
    let target = key;
    const mappedKey = idMap.get(key);
    if (mappedKey) {
      delete node[key];
      target = mappedKey;
    }
    if (typeof value === 'string') {
      node[target] = idMap.get(value) ?? value;
    } else {
      if (value && typeof value === 'object') remapReferences(value, idMap);
      if (mappedKey) node[target] = value;
    }
  }
}
