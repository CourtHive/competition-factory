import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { idRecord, isIdRecord, plainRecord } from '@Tools/plainRecord';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { afterEach, describe, expect, it } from 'vitest';

// Id maps are built without inheritance and handed to callers in place (tools/plainRecord), not copied key by key.
// These cases pin what the hand-over must keep: no write reaches a prototype, every id stays an own key in its order,
// and callers receive Object.prototype objects throughout.
const IDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
const ID_MAPS = ['structureParticipation', 'potentialMatchUps', 'scheduleConflicts', 'opponents', 'pairIdMap'];

const baseline = new Set(Object.getOwnPropertyNames(Object.prototype));
const arrayBaseline = new Set(Object.getOwnPropertyNames(Array.prototype));
const pollution = () => [
  ...Object.getOwnPropertyNames(Object.prototype).filter((key) => !baseline.has(key)),
  ...Object.getOwnPropertyNames(Array.prototype).filter((key) => !arrayBaseline.has(key)),
];
afterEach(() => {
  pollution().forEach((key) => {
    delete (Object.prototype as any)[key];
    delete (Array.prototype as any)[key];
  });
});

const renamed = (record: any, id: string, to: string) =>
  JSON.parse(JSON.stringify(record).split(`"${id}"`).join(`"${to}"`));
const fixture = () =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, drawType: ROUND_ROBIN, seedsCount: 2 },
      { drawSize: 4, eventType: DOUBLES_EVENT },
    ],
    completeAllMatchUps: true,
    setState: false,
  } as any).tournamentRecord;
const ALL = {
  withMatchUps: true,
  withStatistics: true,
  withOpponents: true,
  withEvents: true,
  withDraws: true,
  withSeeding: true,
  withScheduleItems: true,
  withIndividualParticipants: true,
};

function expectPlainMap(participantMap: any) {
  expect(Object.getPrototypeOf(participantMap)).toBe(Object.prototype);
  for (const entry of Object.values<any>(participantMap)) {
    for (const key of [...ID_MAPS, 'matchUps', 'events', 'draws'])
      expect(Object.getPrototypeOf(entry[key]), key).toBe(Object.prototype);
  }
}

describe('id maps handed over in place', () => {
  it('plainRecord gives an id record Object.prototype without copying, keeping "__proto__" an own key', () => {
    const map = idRecord();
    for (const id of ['b', ...IDS, 'a']) map[id] = { id };
    expect(isIdRecord(map)).toBe(true);
    expect((map as any).constructor).toEqual({ id: 'constructor' });
    const plain = plainRecord(map);
    expect(plain).toBe(map);
    expect(isIdRecord(plain)).toBe(false);
    expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
    expect(Object.keys(plain)).toEqual(['b', ...IDS, 'a']);
    expect(Object.hasOwn(plain, '__proto__')).toBe(true);
    // serialises with every id, in order, as a copy would
    expect(JSON.stringify(plain)).toEqual(
      '{' + ['b', ...IDS, 'a'].map((id) => `"${id}":{"id":"${id}"}`).join(',') + '}',
    );
    // a fresh id record inherits nothing: absent ids read as absent
    const fresh = idRecord();
    for (const id of IDS) expect(fresh[id], id).toBeUndefined();
    expect(pollution()).toEqual([]);
  });

  it.each(IDS)('getParticipants keeps a participant with the id "%s" in the participantMap', (id) => {
    const record = fixture();
    const participantId = record.participants[0].participantId;
    tournamentEngine.setState(renamed(record, participantId, id));
    const result: any = tournamentEngine.getParticipants(ALL);
    expect(pollution()).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.participants.some((p: any) => p.participantId === id)).toBe(true);
    // the map and the participants list hold the same people, the renamed one included
    expect(Object.keys(result.participantMap).sort()).toEqual(
      result.participants.map((p: any) => p.participantId).sort(),
    );
    expect(Object.hasOwn(result.participantMap, id)).toBe(true);
    expect(result.participantMap[id].participant.participantId).toEqual(id);
    expectPlainMap(result.participantMap);
  });

  it.each(IDS)('getParticipants keys an event and a draw with the id "%s" as own keys', (id) => {
    const record = fixture();
    const event = record.events[0];
    let renamedRecord = renamed(record, event.eventId, id);
    renamedRecord = renamed(renamedRecord, event.drawDefinitions[0].drawId, `${id}`);
    tournamentEngine.setState(renamedRecord);
    const result: any = tournamentEngine.getParticipants({ ...ALL, policyDefinitions: undefined });
    expect(pollution()).toEqual([]);
    const entered = Object.values<any>(result.participantMap).filter((entry) => Object.hasOwn(entry.events, id));
    expect(entered.length).toBeGreaterThan(0);
    for (const entry of entered) {
      expect(entry.events[id].eventId).toEqual(id);
      expect(Object.hasOwn(entry.draws, id)).toBe(true);
    }
    expectPlainMap(result.participantMap);
  });

  it.each(IDS)('dynamic ratings key a participant with the id "%s" as an own key of a plain map', (id) => {
    const record = fixture();
    tournamentEngine.setState(renamed(record, record.participants[0].participantId, id));
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m: any) => m.sides?.some((s: any) => s.participantId === id));
    const result: any = scaleEngine.generateDynamicRatings({
      matchUpIds: [target.matchUpId],
      updateParticipantRatings: true,
    });
    expect(pollution()).toEqual([]);
    expect(result.success).toBe(true);
    expect(Object.getPrototypeOf(result.modifiedScaleValues)).toBe(Object.prototype);
    expect(Object.hasOwn(result.modifiedScaleValues, id)).toBe(true);
  });

  it.each(IDS)('a round robin tally keeps a participant with the id "%s"', (id) => {
    const record = fixture();
    tournamentEngine.setState(renamed(record, record.participants[0].participantId, id));
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { drawIds: [record.events[0].drawDefinitions[0].drawId] },
    } as any);
    const group = matchUps.filter((m: any) => m.sides?.some((s: any) => s.participantId === id));
    const structureMatchUps = matchUps.filter((m: any) => m.structureId === group[0].structureId);
    const result: any = tournamentEngine.tallyParticipantResults({ matchUps: structureMatchUps });
    expect(pollution()).toEqual([]);
    expect(Object.getPrototypeOf(result.participantResults)).toBe(Object.prototype);
    expect(Object.hasOwn(result.participantResults, id)).toBe(true);
    expect(typeof result.participantResults[id].matchUpsWon).toBe('number');
  });
});

describe('amendment paths', () => {
  const policy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };
  const approved = () =>
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-id-records',
          applicant: { organisationId: 'org', organisationName: 'Org', contactName: 'C', contactEmail: 'c@e.test' },
          proposal: {
            tournamentName: 'Paths Open',
            proposedStartDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
            proposedEndDate: new Date(Date.now() + 61 * 86_400_000).toISOString().slice(0, 10),
            events: [{ eventName: 'S', eventType: SINGLES_EVENT, drawSize: 32, drawType: SINGLE_ELIMINATION }],
          },
          sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: policy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ] as any);
  const propose = (field: string, proposedValue: any = 'yes') =>
    sanctioningEngine.proposeAmendment({
      changes: [{ field, previousValue: undefined, proposedValue, changeType: 'MODIFIED' }],
      sanctioningPolicy: policy,
    } as any) as any;

  it.each([
    '__proto__',
    'constructor',
    'prototype',
    'events.__proto__',
    'events[0].constructor',
    'events[0].prototype.x',
    'venues.__proto__[0].x',
    'events.constructor[1]',
  ])('refuses the field %s, which names a prototype', (field) => {
    approved();
    expect(propose(field).error).toEqual(INVALID_VALUES);
    expect(pollution()).toEqual([]);
  });

  it.each(['events[0].constructorName', 'events[0].prototypeId', 'events[0].x__proto__', 'events[0].__proto__[0][1]'])(
    'does not refuse %s for naming a prototype: the segment is not one',
    (field) => {
      approved();
      expect(propose(field).context?.message).not.toEqual('A change field may not name a prototype');
      expect(pollution()).toEqual([]);
    },
  );

  it('walks own fields only: an inherited name on the path leads nowhere, an own field is amended', () => {
    approved();
    for (const field of ['events[0].hasOwnProperty.x', 'events[0].toString.x', 'tournamentName.length.x']) {
      propose(field);
      expect(pollution()).toEqual([]);
    }
    expect(typeof Object.prototype.hasOwnProperty).toBe('function');
    for (const [field, value] of [
      ['events[0].drawSize', 64],
      ['events[0].eventName', 'Renamed'],
    ] as const) {
      const proposed = propose(field, value);
      if (!proposed.autoApproved)
        sanctioningEngine.reviewAmendment({ amendmentId: proposed.amendmentId, approved: true } as any);
    }
    const { proposal } = (sanctioningEngine.getSanctioningRecord() as any).sanctioningRecord;
    expect(proposal.events[0].drawSize).toEqual(64);
    expect(proposal.events[0].eventName).toEqual('Renamed');
  });
});
