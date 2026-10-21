import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants
import { ABANDONED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { PAIR, SIGNED_IN } from '@Constants/participantConstants';
import { PRACTICE } from '@Constants/scheduleConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

/**
 * EVERY STORED FIELD THE TYPES DECLARE, THE SCHEMA DECLARES.
 *
 * A closed schema definition (`additionalProperties: false`, the convention `codesSchemaConvention`
 * enforces) rejects any field it does not list. So a field added to a type and not to the schema
 * makes every record that carries it invalid, and nothing noticed: the schema tests validated only
 * records that held none of them (fresh mocks, the corpus's initial record). Measured 2026-10-20: a
 * COMPASS 16 record validated clean, then failed after one double walkover, on
 * `MatchUp.sideExitProvenance` and `PositionAssignment.byeFromPropagation`; 12 closed definitions
 * lacked typed fields, and only `MatchUp.onlineResources` had ever been added (#5431).
 *
 * The first test compares the two declarations directly; the second validates a record AFTER the
 * engine has written exit provenance, which is the record a consumer stores.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));

/**
 * Typed fields that are never stored, so the schema rightly omits them. Each needs its reason.
 */
const NOT_STORED: Record<string, string> = {
  // hydrated onto in-context matchUps; a stored side carries participantId only
  'Side.participant': 'hydrated',
  // declared `never` so a ladder of awards cannot pass as a list of totals; never set
  'PrizeMoney.finishingPosition': 'never set',
  // END_DATE stays a timeItem (matchUpDuration walks the ordered history); the schema's own description says so
  'MatchUpSchedule.endDate': 'a timeItem',
};

function typedProperties(): Map<string, string[]> {
  const fileName = './src/types/tournamentTypes.ts';
  const program = ts.createProgram([fileName], { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(fileName);
  const properties = new Map<string, string[]>();
  source?.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)) return;
    const type = checker.getTypeAtLocation(node.name);
    properties.set(
      node.name.text,
      checker.getPropertiesOfType(type).map((property) => property.name),
    );
  });
  return properties;
}

function compileSchema() {
  const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
  ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
  addFormats(ajv);
  return { ajv, validate: ajv.compile(schema) };
}

const DATE = '2026-06-15';
const REPORTED_TIE_FORMAT = {
  tieFormatName: 'REPORTED_SINGLES_3',
  scoreSource: 'REPORTED',
  winCriteria: { valueGoal: 2 },
  collectionDefinitions: [
    {
      collectionName: 'Singles',
      matchUpFormat: 'SET3-S:6/TB7',
      collectionId: 'singles',
      matchUpType: 'SINGLES',
      collectionOrder: 1,
      matchUpValue: 1,
      matchUpCount: 3,
    },
  ],
};

/**
 * One public method per newly declared field, as a client sends them (an `executionQueue` payload),
 * so the same list can be replayed through a server. Fields with no engine writer (`Contact.relationship`,
 * `Participant.homeVenueIds`, `DrawDefinition.competitionFormat`, the `DrawLinkSource` extras) reach a
 * record only by import; the first test covers their declaration.
 */
function storedFieldsScenario() {
  const additionalSeeds = { ...POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING], additionalSeeds: { maxCount: 1 } };
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'venue', courtsCount: 2 }],
    participantsProfile: { participantsCount: 40 },
    drawProfiles: [
      { drawId: 'compass', drawType: COMPASS, drawSize: 16 },
      { drawId: 'seeded', drawSize: 32, seedsCount: 8, policyDefinitions: { [POLICY_TYPE_SEEDING]: additionalSeeds } },
      { drawId: 'doubles', drawSize: 4, eventType: DOUBLES },
      { drawId: 'team', drawSize: 4, eventType: TEAM, tieFormat: REPORTED_TIE_FORMAT },
    ],
    startDate: DATE,
    endDate: DATE,
    setState: true,
    nonRandom: 1,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const east = (roundPosition: number): any =>
    matchUps.find(
      (matchUp: any) =>
        matchUp.drawId === 'compass' &&
        matchUp.structureName === 'East' &&
        matchUp.roundNumber === 1 &&
        matchUp.roundPosition === roundPosition,
    );
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId: 'seeded' });
  const seeded = drawDefinition.structures[0];
  const unseeded = seeded.positionAssignments
    .map((assignment: any) => assignment.participantId)
    .filter(Boolean)
    .find((participantId: string) => !seeded.seedAssignments.some((seed: any) => seed.participantId === participantId));
  const pair = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [PAIR] } }).participants[0];
  const individual = east(4).sides[0].participantId;
  const courtId = tournamentEngine.getTournament().tournamentRecord.venues[0].courts[0].courtId;
  const booking = { bookingId: 'booking-1', bookingType: PRACTICE, startTime: '14:00', endTime: '16:00', capacity: 4 };

  const methods = [
    {
      method: 'setMatchUpStatus',
      params: {
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: east(1).matchUpId,
        propagateExitStatus: true,
        drawId: 'compass',
      },
    },
    {
      method: 'setMatchUpStatus',
      params: {
        outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'WO'] },
        matchUpId: east(2).matchUpId,
        drawId: 'compass',
      },
    },
    {
      method: 'setMatchUpStatus',
      params: {
        outcome: { matchUpStatus: ABANDONED, matchUpStatusCodes: ['RAIN'] },
        matchUpId: east(3).matchUpId,
        drawId: 'compass',
      },
    },
    {
      method: 'checkInParticipant',
      params: { matchUpId: east(4).matchUpId, participantId: individual, drawId: 'compass' },
    },
    { method: 'modifyParticipantsSignInStatus', params: { participantIds: [individual], signInState: SIGNED_IN } },
    {
      method: 'addParticipantOtherId',
      params: { participantId: individual, organisationId: 'org', otherParticipantId: 'other-participant' },
    },
    { method: 'addDrawOtherId', params: { drawId: 'compass', organisationId: 'org', otherDrawId: 'other-draw' } },
    {
      method: 'addAdditionalSeed',
      params: {
        structureId: seeded.structureId,
        seedingBasis: 'PROTECTED_RANKING',
        participantId: unseeded,
        eventId: event.eventId,
        drawId: 'seeded',
      },
    },
    {
      method: 'modifyParticipant',
      params: {
        participant: { participantId: pair.participantId, contactParticipantIds: [pair.individualParticipantIds[0]] },
      },
    },
    {
      method: 'modifyCourtAvailability',
      params: {
        courtId,
        dateAvailability: [{ date: DATE, startTime: '08:00', endTime: '20:00', bookings: [booking] }],
      },
    },
    {
      method: 'addPracticeRegistration',
      params: {
        courtId,
        date: DATE,
        bookingId: 'booking-1',
        participantId: individual,
        startTime: '14:00',
        endTime: '14:30',
      },
    },
  ];
  return { methods };
}

/** each field the scenario writes, as the key the stored record carries */
const SCENARIO_FIELDS = [
  'sideExitProvenance',
  'byeFromPropagation',
  'sideStatusCodes',
  'matchUpStatusCode',
  'checkIns',
  'presence',
  'participantOtherIds',
  'drawOtherIds',
  'seedingBasis',
  'contactParticipantIds',
  'registrations',
  'bookingId',
  'capacity',
  'scoreSource',
];

describe('the schema declares what the types store', () => {
  it('every closed definition lists every field its type declares', () => {
    const typed = typedProperties();
    const compared: string[] = [];
    const missing: string[] = [];
    for (const [name, definition] of Object.entries<any>(schema.definitions)) {
      if (definition.additionalProperties !== false || !definition.properties || !typed.has(name)) continue;
      compared.push(name);
      for (const field of typed.get(name) ?? []) {
        const key = `${name}.${field}`;
        if (!(field in definition.properties) && !NOT_STORED[key]) missing.push(key);
      }
    }
    // the comparison must actually compare: a parse that found no types would pass vacuously
    expect(compared.length).toBeGreaterThan(40);
    expect(compared).toEqual(expect.arrayContaining(['MatchUp', 'PositionAssignment', 'Participant']));
    expect(missing).toEqual([]);
  });

  it('a record holding exit provenance and a propagated BYE validates', () => {
    const { ajv, validate } = compileSchema();

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'compass', drawType: COMPASS, drawSize: 16 }],
      setState: true,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const first: any = matchUps.find(
      (matchUp: any) => matchUp.structureName === 'East' && matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
    );
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: first.matchUpId,
      propagateExitStatus: true,
      drawId: 'compass',
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = JSON.stringify(tournamentRecord);
    // CONTROL: the record holds the fields that failed validation before they were declared
    expect(stored).toContain('"sideExitProvenance"');
    expect(stored).toContain('"byeFromPropagation"');

    result = validate(tournamentRecord);
    expect(result, ajv.errorsText(validate.errors)).toEqual(true);
  });

  it('a record written by every method that stores a newly declared field validates', () => {
    const { ajv, validate } = compileSchema();
    const { methods } = storedFieldsScenario();
    for (const method of methods) {
      const result: any = tournamentEngine.executionQueue([method]);
      expect(result.success, `${method.method}: ${JSON.stringify(result.error)}`).toEqual(true);
    }

    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = JSON.stringify(tournamentRecord);
    // CONTROL: each field is on the record, so the validation below is about it
    expect(SCENARIO_FIELDS.filter((field) => !stored.includes(`"${field}"`))).toEqual([]);

    const valid = validate(tournamentRecord);
    expect(valid, ajv.errorsText(validate.errors)).toEqual(true);
  });
});
