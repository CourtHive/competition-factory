import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import fs from 'fs';

// constants and types
import type { Applicant, EventProposal, SanctioningPolicy } from '@Types/sanctioningTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

/*
 * Event.entryProfile has a writer: modifyEvent sets it (merged key by key, null removes), and activation from
 * sanctioning carries the sanctioned draw sizes into it. Every profile written is one the CODES schema accepts.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', 'utf8'));
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
ajv.addSchema(schema, 'tournament');
const validateProfile = ajv.compile({ $ref: 'tournament#/definitions/EventEntryProfile' });
const validateRecord = ajv.compile({ $ref: 'tournament' });
const validateEvent = ajv.compile({ $ref: 'tournament#/definitions/Event' });

function seedEvent() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventType: SINGLES_EVENT, participantsProfile: { participantsCount: 8 } }],
    setState: true,
  });
  return eventId;
}

const getProfile = (eventId: string) => tournamentEngine.getEvent({ eventId }).event.entryProfile;
const modify = (eventId: string, entryProfile: any) =>
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { entryProfile } }) as any;

describe('modifyEvent entryProfile', () => {
  it('writes a profile the CODES schema accepts', () => {
    const eventId = seedEvent();
    const entryProfile = {
      entriesLimit: 40,
      targetDrawSize: 32,
      qualifyingDrawSize: 16,
      qualifiersCount: 4,
      wildcardCount: 3,
      selectionProcess: 'TOP_DOWN_BY_RANKING',
      selectionScaleName: 'WTN',
      waitlistEnabled: true,
    };
    const result = modify(eventId, entryProfile);
    expect(result.success).toEqual(true);
    expect(getProfile(eventId)).toEqual(entryProfile);
    expect(validateProfile(getProfile(eventId))).toEqual(true);
    expect(validateRecord(tournamentEngine.getTournament().tournamentRecord)).toEqual(true);
  });

  it('merges key by key, so an edit keeps what it does not name; null removes a key', () => {
    const eventId = seedEvent();
    expect(modify(eventId, { targetDrawSize: 32, selectionProcess: 'TOP_DOWN_BY_RATING' }).success).toEqual(true);
    expect(modify(eventId, { targetDrawSize: 16, wildcardCount: 2 }).success).toEqual(true);
    expect(getProfile(eventId)).toEqual({
      targetDrawSize: 16,
      wildcardCount: 2,
      selectionProcess: 'TOP_DOWN_BY_RATING',
    });

    expect(modify(eventId, { wildcardCount: null }).success).toEqual(true);
    expect(getProfile(eventId)).toEqual({ targetDrawSize: 16, selectionProcess: 'TOP_DOWN_BY_RATING' });
  });

  it('null clears the whole profile, as does removing its last key', () => {
    const eventId = seedEvent();
    expect(modify(eventId, { targetDrawSize: 32, wildcardCount: 2 }).success).toEqual(true);
    expect(modify(eventId, null).success).toEqual(true);
    expect(getProfile(eventId)).toBeUndefined();

    expect(modify(eventId, { targetDrawSize: 32 }).success).toEqual(true);
    expect(modify(eventId, { targetDrawSize: null }).success).toEqual(true);
    expect(getProfile(eventId)).toBeUndefined();
  });

  it('stores qualifyingProfiles for multi-structure qualifying, and the schema accepts them', () => {
    const eventId = seedEvent();
    const qualifyingProfiles = [
      {
        roundTarget: 1,
        structureProfiles: [
          { stageSequence: 1, drawSize: 32, qualifyingPositions: 8 },
          { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
        ],
      },
    ];
    expect(modify(eventId, { targetDrawSize: 32, qualifyingProfiles }).success).toEqual(true);
    expect(getProfile(eventId).qualifyingProfiles).toEqual(qualifyingProfiles);
    expect(validateProfile(getProfile(eventId))).toEqual(true);
  });

  it('refuses an invalid profile and leaves the stored one unchanged', () => {
    const eventId = seedEvent();
    expect(modify(eventId, { targetDrawSize: 32, qualifyingDrawSize: 16 }).success).toEqual(true);
    const before = getProfile(eventId);

    const refusals = [
      'not an object',
      [],
      { unknownKey: 1 },
      { targetDrawSize: 0 },
      { targetDrawSize: 12.5 },
      { wildcardCount: -1 },
      { selectionProcess: 'BY_HEIGHT' },
      { selectionScaleName: 4 },
      { waitlistEnabled: 'yes' },
      { extensions: [{ value: 1 }] },
      // qualifiers must be fewer than the qualifying draw
      { qualifiersCount: 16 },
      // qualifier and wildcard places beyond the draw
      { qualifiersCount: 8, wildcardCount: 30 },
      // one shape or the other: the merged profile still holds qualifyingDrawSize
      { qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }] },
    ];
    for (const entryProfile of refusals) {
      const result = modify(eventId, entryProfile);
      expect(result.error).toEqual(INVALID_VALUES);
    }
    expect(getProfile(eventId)).toEqual(before);
  });

  it('refuses malformed qualifyingProfiles', () => {
    const eventId = seedEvent();
    const refusals = [
      'none',
      [null],
      [{ structureProfiles: [] }],
      [{ roundTarget: 0, structureProfiles: [{ drawSize: 16 }] }],
      [{ stage: 'QUALIFYING', structureProfiles: [{ drawSize: 16 }] }],
      [{ structureProfiles: [{ drawSize: 16, seedsCount: 4 }] }],
      [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 16 }] }],
      [{ structureProfiles: [{ stageSequence: 0 }] }],
    ];
    for (const qualifyingProfiles of refusals) {
      expect(modify(eventId, { qualifyingProfiles }).error).toEqual(INVALID_VALUES);
    }
    // switching shapes takes nulling the simple one in the same call
    expect(modify(eventId, { qualifyingDrawSize: 16, qualifiersCount: 4 }).success).toEqual(true);
    const result = modify(eventId, {
      qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
      qualifyingDrawSize: null,
      qualifiersCount: null,
    });
    expect(result.success).toEqual(true);
    expect(Object.keys(getProfile(eventId))).toEqual(['qualifyingProfiles']);
  });
});

describe('activation from sanctioning carries the sanctioned sizes', () => {
  const applicant: Applicant = {
    organisationId: 'org-001',
    organisationName: 'Test Tennis Club',
    contactName: 'Jane Doe',
    contactEmail: 'jane@test.com',
  };
  const policy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };

  function activate(events: EventProposal[]) {
    sanctioningEngine.reset();
    const proposal = {
      tournamentName: 'Sizes 2027',
      proposedStartDate: '2027-06-01',
      proposedEndDate: '2027-06-07',
      events,
    };
    sanctioningEngine.executionQueue([
      { method: 'createSanctioningRecord', params: { governingBodyId: 'gov-001', applicant, proposal } },
      { method: 'submitApplication', params: { sanctioningPolicy: policy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);
    const activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy });
    expect(activation.success).toEqual(true);
    return activation.tournamentRecord;
  }

  it('writes drawSize as targetDrawSize and qualifyingDrawSize, and the entry space counts from them', () => {
    const tournamentRecord = activate([
      { eventName: "Men's Singles", eventType: SINGLES_EVENT, gender: MALE, drawSize: 32, qualifyingDrawSize: 16 },
      { eventName: "Men's Doubles", eventType: 'DOUBLES', gender: MALE },
    ]);
    const [singles, doubles] = tournamentRecord.events;
    expect(singles.entryProfile).toEqual({ targetDrawSize: 32, qualifyingDrawSize: 16 });
    expect(doubles.entryProfile).toBeUndefined();
    // the whole record's validation, ACTIVE included, is tournamentStatusSchema.test.ts
    expect(validateEvent(singles)).toEqual(true);

    tournamentEngine.setState(tournamentRecord);
    let result: any = tournamentEngine.getEventEntrySpace({ eventId: singles.eventId });
    expect(result).toMatchObject({
      basis: 'TARGET_DRAW_SIZE',
      drawPositions: 32,
      qualifierPositions: 0,
      openPlaces: 32,
    });

    // the proposal states no qualifier count; the director sets it
    result = tournamentEngine.modifyEvent({
      eventId: singles.eventId,
      eventUpdates: { entryProfile: { qualifiersCount: 4 } },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId: singles.eventId });
    expect(result).toMatchObject({ qualifierPositions: 4, openPlaces: 28 });
  });

  it('writes no profile from sizes that are not positive whole numbers', () => {
    const tournamentRecord = activate([
      { eventName: 'MS', eventType: SINGLES_EVENT, drawSize: 0, qualifyingDrawSize: 12.5 } as EventProposal,
    ]);
    expect(tournamentRecord.events[0].entryProfile).toBeUndefined();
  });
});
