import { getTournamentInconsistencies } from '@Query/tournaments/getTournamentInconsistencies';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { createSeededRandom } from '@Tools/prng';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants
import { INDIVIDUAL, PAIR, TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { LINKED_TOURNAMENTS, MUTATION_LOCKS } from '@Constants/extensionConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { ASSIGN_COURT } from '@Constants/timeItemConstants';

/**
 * anonymizeTournamentRecord, end to end through mocksEngine, on a record that has everything a real one has:
 * venues with courts, auto-scheduled matchUps, singles/doubles/team events, a draw with linked structures,
 * tournament-level matchUps, linked tournament ids and the free-text and contact fields people fill in.
 *
 * The leak assertions scan the serialized record for every ORIGINAL id and every original name, so they
 * test values wherever they ended up, not the fields someone remembered to check.
 */

const ajv = new Ajv({ allowUnionTypes: true, verbose: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
addFormats(ajv);
const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const validateSchema = ajv.compile(schema);

const START_DATE = '2026-06-01';
const SENTINEL = 'ZqxSentinel';
const VENUE_ID = 'venue-original-zqx-0001';
const SINGLES_DRAW_ID = 'draw-singles-original-zqx-0001';
const DOUBLES_DRAW_ID = 'draw-doubles-original-zqx-0001';

function schemaErrors(record: any) {
  validateSchema(record);
  return (validateSchema.errors ?? []).map(({ instancePath, message, params }: any) => ({
    additionalProperty: params?.additionalProperty,
    instancePath,
    message,
  }));
}

function walk(node: any, visit: (key: string, value: any, parent: any) => void) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value, node);
      walk(value, visit);
    }
  }
}

function forEachMatchUp(record: any, fn: (matchUp: any) => void) {
  const visitMatchUps = (matchUps: any[] = []) => {
    for (const matchUp of matchUps) {
      fn(matchUp);
      visitMatchUps(matchUp.tieMatchUps);
    }
  };
  const visitStructure = (structure: any) => {
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

/** Every entity id the record DEFINES, by kind. */
function definedIds(record: any) {
  const ids = {
    tournamentId: new Set<string>([record.tournamentId]),
    participantId: new Set<string>(),
    personId: new Set<string>(),
    eventId: new Set<string>(),
    drawId: new Set<string>(),
    structureId: new Set<string>(),
    matchUpId: new Set<string>(),
    venueId: new Set<string>(),
    courtId: new Set<string>(),
  };
  for (const participant of record.participants ?? []) {
    ids.participantId.add(participant.participantId);
    if (participant.person?.personId) ids.personId.add(participant.person.personId);
  }
  const visitVenues = (venues: any[] = []) => {
    for (const venue of venues) {
      ids.venueId.add(venue.venueId);
      for (const court of venue.courts ?? []) ids.courtId.add(court.courtId);
      visitVenues(venue.subVenues);
    }
  };
  visitVenues(record.venues);
  const visitStructure = (structure: any) => {
    ids.structureId.add(structure.structureId);
    for (const child of structure.structures ?? []) visitStructure(child);
  };
  for (const event of record.events ?? []) {
    ids.eventId.add(event.eventId);
    for (const drawDefinition of event.drawDefinitions ?? []) {
      ids.drawId.add(drawDefinition.drawId);
      for (const structure of drawDefinition.structures ?? []) visitStructure(structure);
    }
  }
  forEachMatchUp(record, (matchUp) => ids.matchUpId.add(matchUp.matchUpId));
  return ids;
}

function allIds(ids: ReturnType<typeof definedIds>): string[] {
  return Object.values(ids).flatMap((set) => [...set]);
}

function buildRichRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [
      { venueId: VENUE_ID, venueName: 'Real Venue One', courtsCount: 4, startTime: '08:00', endTime: '20:00' },
      { venueName: 'Real Venue Two', courtsCount: 2, startTime: '08:00', endTime: '20:00' },
    ],
    eventProfiles: [
      {
        eventType: SINGLES,
        eventName: 'Real Singles',
        completeAllMatchUps: true,
        drawProfiles: [{ drawId: SINGLES_DRAW_ID, drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP }],
      },
      { eventType: DOUBLES, eventName: 'Real Doubles', drawProfiles: [{ drawId: DOUBLES_DRAW_ID, drawSize: 8 }] },
      {
        eventType: TEAM,
        eventName: 'Real Teams',
        tieFormatName: COLLEGE_DEFAULT,
        completeAllMatchUps: true,
        drawProfiles: [{ drawSize: 4 }],
      },
    ],
    schedulingProfile: [
      {
        scheduleDate: START_DATE,
        venues: [
          {
            venueId: VENUE_ID,
            rounds: [
              { drawId: SINGLES_DRAW_ID, roundNumber: 1 },
              { drawId: DOUBLES_DRAW_ID, roundNumber: 1 },
            ],
          },
        ],
      },
    ],
    startDate: START_DATE,
    endDate: '2026-06-03',
    autoSchedule: true,
    setState: true,
  });

  // auto-scheduling times matchUps at a venue; put the unplayed doubles on courts too, through the engine (a
  // completed matchUp's schedule is not edited)
  const venue = tournamentRecord.venues[0];
  const scheduled = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.filter((m) => m.schedule?.scheduledTime && !m.winningSide);
  scheduled.slice(0, venue.courts.length).forEach((matchUp, i) => {
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: {
        scheduledDate: matchUp.schedule.scheduledDate,
        courtId: venue.courts[i].courtId,
        venueId: venue.venueId,
      },
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
    });
    expect(result.success).toEqual(true);
  });
  const record: any = structuredClone(tournamentEngine.getTournament().tournamentRecord);

  // Unique original names, so that a generated name can never coincide with one by chance and a scan for it is
  // exact. Pair names are derived from the members' family names, so they carry the sentinel too.
  let index = 0;
  for (const participant of record.participants) {
    index += 1;
    if (participant.participantType === INDIVIDUAL) {
      participant.person.standardGivenName = `${SENTINEL}Given${index}`;
      participant.person.standardFamilyName = `${SENTINEL}Family${index}`;
      participant.participantName = `${SENTINEL}Given${index} ${SENTINEL}Family${index}`;
      participant.personId = participant.person.personId;
      participant.participantOtherName = `${SENTINEL}Nick${index}`;
      participant.contacts = [{ emailAddress: `${SENTINEL}${index}@example.org`, telephone: '555-0100' }];
      participant.participantOtherIds = [
        { participantId: `${SENTINEL}ExternalParticipant${index}`, organisationId: 'org' },
      ];
      participant.notes = `${SENTINEL} allergic to peanuts`;
      participant.onlineResources = [{ identifier: `https://example.org/${SENTINEL}${index}`, resourceType: 'URL' }];
      participant.person.contacts = [{ telephone: `${SENTINEL}-tel-${index}` }];
      participant.person.nativeFamilyName = `${SENTINEL}Native${index}`;
      participant.person.otherNames = [`${SENTINEL}Other${index}`];
      participant.person.personOtherIds = [{ personId: `${SENTINEL}ExternalPerson${index}`, organisationId: 'org' }];
      participant.person.tennisId = `${SENTINEL}TennisId${index}`;
      participant.person.birthDate = `${1990 + (index % 10)}-03-17`;
      participant.timeItems = [
        { itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: { wtnRating: 10 + (index % 20) }, itemDate: START_DATE },
      ];
      participant.extensions = [{ name: 'clubMembership', value: { clubName: `${SENTINEL}Club${index}` } }];
    } else if (participant.participantType === PAIR) {
      participant.participantName = undefined; // regenerated from members; a stale value is checked below
    } else if (participant.participantType === TEAM_PARTICIPANT) {
      participant.participantName = `${SENTINEL}Team${index}`;
    }
  }
  for (const participant of record.participants) {
    if (participant.participantType !== PAIR) continue;
    const names = participant.individualParticipantIds.map(
      (id) => record.participants.find((p) => p.participantId === id).person.standardFamilyName,
    );
    participant.participantName = names.join('/');
  }

  record.tournamentName = `${SENTINEL} Real Open`;
  record.formalName = `${SENTINEL} Formal`;
  record.promotionalName = `${SENTINEL} Promo`;
  record.notes = `${SENTINEL} director phone 555-0100`;
  record.linkedTournamentIds = [`${SENTINEL}LinkedTournament`];
  record.parentOrganisationId = `${SENTINEL}ParentOrg`;
  record.parentOrganisation = { organisationId: `${SENTINEL}OrgId`, organisationName: `${SENTINEL} Org` };
  record.tournamentOtherIds = [{ tournamentId: `${SENTINEL}ExternalTournament`, organisationId: 'org' }];
  record.tournamentSeriesId = `${SENTINEL}Series`;
  record.onlineResources = [{ identifier: `https://example.org/${SENTINEL}`, resourceType: 'URL' }];
  record.registrationProfile = { entriesOpen: `${START_DATE}T08:00:00Z`, eligibilityNotes: `${SENTINEL}Registrar` };
  record.extensions = [...(record.extensions ?? []), { name: 'sponsor', value: { name: `${SENTINEL}Sponsor` } }];

  for (const [venueIndex, venue] of record.venues.entries()) {
    venue.contacts = [{ telephone: `${SENTINEL}-venue-${venueIndex}` }];
    venue.addresses = [{ addressLine1: `${SENTINEL} Street ${venueIndex}`, city: `${SENTINEL}City` }];
    venue.venueOtherIds = [{ venueId: `${SENTINEL}ExternalVenue${venueIndex}`, organisationId: 'org' }];
    venue.facilityId = `${SENTINEL}Facility${venueIndex}`;
    venue.notes = `${SENTINEL} gate code 1234`;
    for (const [courtIndex, court] of venue.courts.entries()) {
      court.courtName = `${SENTINEL}Court${venueIndex}-${courtIndex}`;
      court.latitude = '51.4183';
      court.longitude = '-0.2206';
      court.notes = `${SENTINEL} court note`;
      court.onlineResources = [{ identifier: `https://example.org/${SENTINEL}/court`, resourceType: 'URL' }];
    }
  }

  for (const event of record.events) {
    event.eventOtherIds = [{ eventId: `${SENTINEL}ExternalEvent`, organisationId: 'org' }];
    event.tennisOfficialIds = [`${SENTINEL}Official`];
    event.notes = `${SENTINEL} event note`;
  }

  // tournament-level matchUps: one between two individuals, scheduled on a court
  const individuals = record.participants.filter((p) => p.participantType === INDIVIDUAL);
  const court = record.venues[0].courts[0];
  record.matchUps = [
    {
      matchUpId: 'standalone-matchup-one-0000',
      matchUpType: SINGLES,
      matchUpStatus: 'TO_BE_PLAYED',
      sides: [
        { sideNumber: 1, participantId: individuals[0].participantId },
        { sideNumber: 2, participantId: individuals[1].participantId },
      ],
      timeItems: [{ itemType: ASSIGN_COURT, itemValue: court.courtId, itemDate: START_DATE }],
      notes: `${SENTINEL} standalone note`,
    },
  ];

  return record;
}

function originalNames(record: any): string[] {
  const names: string[] = [record.tournamentName];
  for (const participant of record.participants) {
    if (participant.participantName) names.push(participant.participantName);
    if (participant.person?.standardGivenName) names.push(participant.person.standardGivenName);
    if (participant.person?.standardFamilyName) names.push(participant.person.standardFamilyName);
  }
  for (const venue of record.venues) {
    names.push(venue.venueName);
    for (const court of venue.courts) names.push(court.courtName);
  }
  for (const event of record.events) names.push(event.eventName);
  return names;
}

function scheduleSummary(record: any) {
  tournamentEngine.setState(record, true);
  const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
  return matchUps
    .filter((m) => m.schedule?.courtId || m.schedule?.scheduledTime)
    .map((m) => ({
      roundNumber: m.roundNumber,
      scheduledDate: m.schedule.scheduledDate,
      scheduledTime: m.schedule.scheduledTime,
      hasCourt: !!m.schedule.courtId,
      courtResolved: !!m.schedule.courtName && !!m.schedule.venueId,
      score: m.score?.scoreStringSide1,
    }));
}

describe('anonymizeTournamentRecord on a rich record', () => {
  it('replaces every id and name, everywhere, and leaves the record valid and consistent', () => {
    const record = buildRichRecord();
    const original = structuredClone(record);
    const originalIds = definedIds(original);
    const names = originalNames(original);

    // the fixture has what it claims
    expect(originalIds.venueId.size).toEqual(2);
    expect(originalIds.courtId.size).toEqual(6);
    expect(original.events[0].drawDefinitions[0].links.length).toBeGreaterThan(0);
    const before = scheduleSummary(structuredClone(original));
    expect(before.filter((s) => s.hasCourt).length).toBeGreaterThan(0);
    expect(before.every((s) => !s.hasCourt || s.courtResolved)).toEqual(true);

    let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord: record });
    expect(result.success).toEqual(true);
    const anonymized = result.tournamentRecord;
    expect(anonymized).toBe(record);

    const serialized = JSON.stringify(anonymized);
    const survivingIds = allIds(originalIds).filter((id) => serialized.includes(id));
    expect(survivingIds).toEqual([]);
    const survivingNames = names.filter((name) => serialized.includes(name));
    expect(survivingNames).toEqual([]);
    // every planted identifying value, whatever field it was in
    expect(serialized.includes(SENTINEL)).toEqual(false);

    // Schema: the anonymizer adds no violation. Compared with the original rather than asserted empty because the
    // generated TEAM matchUp sides carry drawPosition and displaySideNumber, which the schema does not declare; that
    // is pinned below so that any other difference fails here.
    const originalErrors = schemaErrors(original);
    expect(new Set(originalErrors.map((e) => e.additionalProperty))).toEqual(
      new Set(['drawPosition', 'displaySideNumber']),
    );
    expect(schemaErrors(anonymized)).toEqual(originalErrors);

    // every reference resolves to an entity the anonymized record defines
    const anonymizedIds = definedIds(anonymized);
    const dangling: string[] = [];
    walk(anonymized, (key, value) => {
      const kind = key === 'individualParticipantIds' ? 'participantId' : key;
      const known = anonymizedIds[kind];
      if (!known) return;
      for (const id of Array.isArray(value) ? value : [value]) {
        if (typeof id === 'string' && !known.has(id)) dangling.push(`${key}:${id}`);
      }
    });
    expect(dangling).toEqual([]);
    forEachMatchUp(anonymized, (matchUp) => {
      for (const timeItem of matchUp.timeItems ?? []) {
        if (timeItem.itemType === ASSIGN_COURT) expect(anonymizedIds.courtId.has(timeItem.itemValue)).toEqual(true);
      }
    });
    for (const venue of anonymized.venues) {
      for (const court of venue.courts) if (court.venueId) expect(court.venueId).toEqual(venue.venueId);
    }

    // persons: the participant-level pointer follows the replaced person
    for (const participant of anonymized.participants) {
      if (participant.personId) expect(participant.personId).toEqual(participant.person.personId);
    }

    // the factory's own integrity check reports exactly what it reported before
    const issues = (r: any) =>
      getTournamentInconsistencies({ tournamentRecord: r })
        .inconsistencies?.map((i: any) => i.issueType)
        .sort();
    expect(getTournamentInconsistencies({ tournamentRecord: anonymized }).valid).toEqual(true);
    expect(issues(anonymized)).toEqual(issues(original));

    // schedules and results survive, and every assigned court still resolves through the engine
    const after = scheduleSummary(structuredClone(anonymized));
    expect(after).toEqual(before);

    // tournament-level matchUps: their sides point at anonymized participants
    const sideIds = anonymized.matchUps[0].sides.map((side: any) => side.participantId);
    expect(sideIds.every((id: string) => anonymizedIds.participantId.has(id))).toEqual(true);
    // (allTournamentMatchUps does not hydrate a standalone matchUp's sides, so resolve them against participants)
    expect(
      sideIds.map((id: string) => anonymized.participants.find((p: any) => p.participantId === id)?.participantType),
    ).toEqual([INDIVIDUAL, INDIVIDUAL]);
    expect(allTournamentMatchUps({ tournamentRecord: anonymized }).matchUps?.map((m: any) => m.matchUpId)).toContain(
      anonymized.matchUps[0].matchUpId,
    );
  });

  it('keeps what is retained by design: dates, ratings in timeItems, birth year and sex', () => {
    const record = buildRichRecord();
    const original = structuredClone(record);

    let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord: record });
    expect(result.success).toEqual(true);

    expect(record.startDate).toEqual(original.startDate);
    expect(record.endDate).toEqual(original.endDate);
    const individuals = (r: any) => r.participants.filter((p) => p.participantType === INDIVIDUAL);
    const kept = individuals(original).map((p) => ({
      sex: p.person.sex,
      birthYear: p.person.birthDate.slice(0, 4),
      rating: p.timeItems[0].itemValue,
    }));
    const anonymizedKept = individuals(record).map((p) => ({
      sex: p.person.sex,
      birthYear: p.person.birthDate.slice(0, 4),
      rating: p.timeItems[0].itemValue,
    }));
    expect(anonymizedKept).toEqual(kept);
  });

  it('is deterministic under a seed', () => {
    const record = buildRichRecord();
    const first = structuredClone(record);
    const second = structuredClone(record);

    mocksEngine.anonymizeTournamentRecord({ tournamentRecord: first, nonRandom: 42 });
    mocksEngine.anonymizeTournamentRecord({ tournamentRecord: second, nonRandom: 42 });
    delete first.createdAt;
    delete second.createdAt;
    expect(first).toEqual(second);

    const third = structuredClone(record);
    mocksEngine.anonymizeTournamentRecord({ tournamentRecord: third, nonRandom: 43 });
    expect(third.tournamentId).not.toEqual(first.tournamentId);
  });
});

describe('anonymizeTournamentRecord options and edges', () => {
  function smallRecord() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    return tournamentRecord as any;
  }

  it('types its params as optional: the governor method compiles and runs with tournamentRecord alone', () => {
    const tournamentRecord = smallRecord();
    let result: any = mocksGovernor.anonymizeTournamentRecord({ tournamentRecord });
    expect(result.success).toEqual(true);
    expect(result.tournamentRecord).toBe(tournamentRecord);
  });

  it('is deterministic given a random source, without the engine', () => {
    const record = smallRecord();
    const first = structuredClone(record);
    const second = structuredClone(record);
    mocksGovernor.anonymizeTournamentRecord({ tournamentRecord: first, random: createSeededRandom(5) });
    mocksGovernor.anonymizeTournamentRecord({ tournamentRecord: second, random: createSeededRandom(5) });
    delete first.createdAt;
    delete second.createdAt;
    expect(first).toEqual(second);
  });

  it('drops linked-tournament and mutation-lock extensions although internal extensions are kept', () => {
    const tournamentRecord = smallRecord();
    tournamentRecord.extensions = [
      { name: LINKED_TOURNAMENTS, value: { tournamentIds: ['real-linked-tournament-id'] } },
      { name: MUTATION_LOCKS, value: [{ lockToken: 'live-lock-token', scope: 'TOURNAMENT' }] },
    ];
    let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord, keepExtensions: [LINKED_TOURNAMENTS] });
    expect(result.success).toEqual(true);
    expect(tournamentRecord.extensions ?? []).toEqual([]);
  });

  it('points a participant-level personId that disagreed with its person at the replacement person', () => {
    const tournamentRecord = smallRecord();
    const participant = tournamentRecord.participants.find((p) => p.participantType === INDIVIDUAL);
    participant.personId = 'stale-pointer-person-id';
    let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord, personIds: ['chosen-person-id'] });
    expect(result.success).toEqual(true);
    const anonymized = tournamentRecord.participants.find((p) => p.participantType === INDIVIDUAL);
    expect(anonymized.person.personId).toEqual('chosen-person-id');
    expect(anonymized.personId).toEqual('chosen-person-id');
  });

  it('keeps participantOtherName when names are kept', () => {
    const tournamentRecord = smallRecord();
    const participant = tournamentRecord.participants[0];
    participant.participantOtherName = 'Kept Nickname';
    mocksEngine.anonymizeTournamentRecord({ tournamentRecord, anonymizeParticipantNames: false });
    expect(tournamentRecord.participants[0].participantOtherName).toEqual('Kept Nickname');

    const other = smallRecord();
    other.participants[0].participantOtherName = 'Dropped Nickname';
    mocksEngine.anonymizeTournamentRecord({ tournamentRecord: other });
    expect(other.participants[0].participantOtherName).toBeUndefined();
  });

  it('anonymizes nested venues and remaps references keyed by id', () => {
    const tournamentRecord = smallRecord();
    const participantId = tournamentRecord.participants[0].participantId;
    tournamentRecord.venues = [
      {
        venueId: 'outer-venue-original',
        venueName: 'Outer Real',
        courts: [{ courtId: 'outer-court-original', courtName: 'Real Centre' }],
        subVenues: [
          {
            venueId: 'inner-venue-original',
            venueName: 'Inner Real',
            facilityId: 'real-facility',
            courts: [
              { courtId: 'inner-court-original', venueId: 'inner-venue-original', latitude: '1', longitude: '2' },
            ],
          },
        ],
      },
    ];
    tournamentRecord.extensions = [{ name: 'custom', value: { [participantId]: 'outer-court-original' } }];
    mocksEngine.anonymizeTournamentRecord({ tournamentRecord, keepExtensions: ['custom'] });

    const [outer] = tournamentRecord.venues;
    const [inner] = outer.subVenues;
    expect(outer.venueName).toEqual('Venue #0');
    expect(inner.venueName).toEqual('Venue #1');
    expect(inner.courts[0].courtName).toEqual('V1C0');
    expect(inner.courts[0].venueId).toEqual(inner.venueId);
    expect(inner.facilityId).toBeUndefined();
    expect(inner.courts[0].latitude).toBeUndefined();
    const serialized = JSON.stringify(tournamentRecord);
    for (const original of ['outer-venue-original', 'inner-venue-original', 'outer-court-original', participantId]) {
      expect(serialized.includes(original)).toEqual(false);
    }
    const custom = tournamentRecord.extensions.find((e) => e.name === 'custom');
    expect(custom.value).toEqual({ [tournamentRecord.participants[0].participantId]: outer.courts[0].courtId });
  });
});
