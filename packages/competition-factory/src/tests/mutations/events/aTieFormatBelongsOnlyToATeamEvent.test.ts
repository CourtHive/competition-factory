import { expectRefusalLeavesRecord, OUTCOME_MODES, withPipeline } from '../atomicity/refusalGate';
import { defined } from '@Tests/helpers/defined';
import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { createSanctioningRecord } from '@Mutate/sanctioning/createSanctioningRecord';
import { updateEventProposal } from '@Mutate/sanctioning/updateEventProposal';
import { addEventProposal } from '@Mutate/sanctioning/addEventProposal';
import { tieFormats } from '@courthive/competition-catalogue';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_EVENT_TYPE, INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { APPROVED } from '@Constants/sanctioningConstants';

/**
 * A tieFormat describes the lines of a TEAM tie. Supplied for a SINGLES or DOUBLES event, draw, structure or matchUp it
 * is refused with INVALID_TIE_FORMAT, and the record is left exactly as it was. Before 8.0.0 it was accepted: stored on
 * the event, dropped without a word, or (with a matchUpFormat) generated into a SINGLES draw as tieMatchUps.
 */

const NON_TEAM = [SINGLES, DOUBLES] as const;
const CODE = INVALID_TIE_FORMAT.code;
const DOMINANT_DUO = 'DOMINANT_DUO';
// a full tieFormat object, with collectionIds, as a caller holds one
const tieFormat = () => {
  const copy = structuredClone(tieFormats.DOMINANT_DUO) as any;
  copy.collectionDefinitions = copy.collectionDefinitions.map((cd, i) => ({
    ...cd,
    collectionId: cd.collectionId ?? `c${i}`,
  }));
  return copy;
};

// an event e1 with an 8-draw d1 of the given type
function recordWith(eventType: string) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { eventType, drawSize: 8, eventId: 'e1', drawId: 'd1', ...(eventType === TEAM && { tieFormat: tieFormat() }) },
    ],
    participantsProfile: { participantsCount: 32 },
    nonRandom: 1,
  }).tournamentRecord;
}

// a record written before 8.0.0, whose non-TEAM event was stored with a tieFormat
function legacyRecordWith(eventType: string) {
  const tournamentRecord = recordWith(eventType);
  defined(tournamentRecord.events, 'events')[0].tieFormat = tieFormat();
  return tournamentRecord;
}

function mainStructureId(tournamentRecord: any) {
  return tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;
}

function teamDrawDefinition() {
  tournamentEngine.reset();
  tournamentEngine.setState(recordWith(TEAM));
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'd1' });
  return { ...structuredClone(drawDefinition), drawId: 'team-draw' };
}

type Case = {
  name: string;
  method: string;
  params: (eventType: string, record: any) => any;
  initial?: (eventType: string) => any;
  code?: string;
};

const CASES: Case[] = [
  {
    name: 'addEvent with a tieFormat',
    method: 'addEvent',
    params: (eventType) => ({ event: { eventType, eventId: 'e2', tieFormat: tieFormat() } }),
  },
  {
    name: 'addEvent with a tieFormatName',
    method: 'addEvent',
    params: (eventType) => ({ event: { eventType, eventId: 'e2', tieFormatName: DOMINANT_DUO } }),
  },
  {
    name: 'addEvent with tieFormats',
    method: 'addEvent',
    params: (eventType) => ({ event: { eventType, eventId: 'e2', tieFormats: [tieFormat()] } }),
  },
  {
    name: 'addEvent defaulting to SINGLES',
    method: 'addEvent',
    params: () => ({ event: { eventId: 'e2', tieFormat: tieFormat() } }),
  },
  {
    name: 'generateDrawDefinition with a tieFormat',
    method: 'generateDrawDefinition',
    params: () => ({ eventId: 'e1', drawSize: 8, tieFormat: tieFormat() }),
  },
  {
    name: 'generateDrawDefinition with a tieFormatName',
    method: 'generateDrawDefinition',
    params: () => ({ eventId: 'e1', drawSize: 8, tieFormatName: DOMINANT_DUO }),
  },
  {
    name: 'generateDrawDefinition with a tieFormat and a matchUpFormat',
    method: 'generateDrawDefinition',
    params: () => ({ eventId: 'e1', drawSize: 8, tieFormat: tieFormat(), matchUpFormat: 'SET3-S:6/TB7' }),
  },
  {
    name: 'addDrawDefinition of a TEAM draw',
    method: 'addDrawDefinition',
    params: () => ({ eventId: 'e1', drawDefinition: teamDrawDefinition() }),
  },
  {
    name: 'addDrawDefinition of a draw that carries a tieFormat',
    method: 'addDrawDefinition',
    params: (eventType, record) => ({
      eventId: 'e1',
      drawDefinition: {
        ...structuredClone(record.events[0].drawDefinitions[0]),
        drawId: 'd2',
        matchUpType: eventType,
        tieFormat: tieFormat(),
      },
    }),
  },
  {
    name: 'generateVoluntaryConsolation with a tieFormat',
    method: 'generateVoluntaryConsolation',
    params: () => ({ drawId: 'd1', tieFormat: tieFormat() }),
  },
  {
    name: 'generateQualifyingStructure with a tieFormat',
    method: 'generateQualifyingStructure',
    params: (_, record) => ({
      drawId: 'd1',
      targetStructureId: mainStructureId(record),
      qualifyingPositions: 2,
      drawSize: 4,
      tieFormat: tieFormat(),
    }),
  },
  {
    name: 'generateDrawTypeAndModifyDrawDefinition with a tieFormat',
    method: 'generateDrawTypeAndModifyDrawDefinition',
    params: () => ({ drawId: 'd1', drawSize: 8, tieFormat: tieFormat() }),
  },
  {
    name: 'setMatchUpFormat with a tieFormat',
    method: 'setMatchUpFormat',
    params: () => ({ eventId: 'e1', matchUpFormat: 'SET1-S:6/TB7', tieFormat: tieFormat() }),
  },
  {
    name: 'setMatchUpFormat with a tieFormatName',
    method: 'setMatchUpFormat',
    params: () => ({ eventId: 'e1', matchUpFormat: 'SET1-S:6/TB7', tieFormatName: DOMINANT_DUO }),
  },
  // a record written before 8.0.0 can hold a tieFormat on a non-TEAM event: editing it is refused
  {
    name: 'modifyTieFormat on a stored non-TEAM tieFormat',
    method: 'modifyTieFormat',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      modifiedTieFormat: { ...record.events[0].tieFormat, winCriteria: { valueGoal: 2 } },
    }),
  },
  {
    name: 'addCollectionDefinition on a stored non-TEAM tieFormat',
    method: 'addCollectionDefinition',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      collectionDefinition: { ...record.events[0].tieFormat.collectionDefinitions[0], collectionId: 'c-new' },
    }),
  },
  {
    name: 'removeCollectionDefinition on a stored non-TEAM tieFormat',
    method: 'removeCollectionDefinition',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      collectionId: record.events[0].tieFormat.collectionDefinitions[0].collectionId,
    }),
  },
  {
    name: 'modifyCollectionDefinition on a stored non-TEAM tieFormat',
    method: 'modifyCollectionDefinition',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      collectionId: record.events[0].tieFormat.collectionDefinitions[0].collectionId,
      collectionName: 'renamed',
    }),
  },
  {
    name: 'orderCollectionDefinitions on a stored non-TEAM tieFormat',
    method: 'orderCollectionDefinitions',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      orderMap: Object.fromEntries(
        record.events[0].tieFormat.collectionDefinitions.map((cd, i, all) => [cd.collectionId, all.length - i]),
      ),
    }),
  },
  {
    name: 'addCollectionGroup on a stored non-TEAM tieFormat',
    method: 'addCollectionGroup',
    initial: legacyRecordWith,
    params: (_, record) => ({
      eventId: 'e1',
      collectionIds: record.events[0].tieFormat.collectionDefinitions.map((cd) => cd.collectionId),
      groupDefinition: { groupName: 'g' },
    }),
  },
  {
    name: 'modifyEvent from TEAM to a non-TEAM type',
    method: 'modifyEvent',
    code: INVALID_EVENT_TYPE.code,
    initial: () => teamEventWithoutEntries(),
    params: (eventType) => ({ eventId: 'e2', eventUpdates: { eventType } }),
  },
];

// a TEAM event holding a tieFormat and no entries, so that its type could otherwise change
function teamEventWithoutEntries() {
  tournamentEngine.reset();
  tournamentEngine.setState(recordWith(SINGLES));
  expect(tournamentEngine.addEvent({ event: { eventType: TEAM, eventId: 'e2', tieFormat: tieFormat() } }).success).toBe(
    true,
  );
  return tournamentEngine.getTournament().tournamentRecord;
}

describe.each(OUTCOME_MODES)('a tieFormat for a non-TEAM target is refused, record unchanged (%s)', (mode) => {
  for (const eventType of NON_TEAM) {
    for (const { name, method, params, initial, code } of CASES) {
      it(`${eventType}: ${name}`, () => {
        withPipeline(mode, () => {
          const record = (initial ?? recordWith)(eventType);
          const directive = { method, params: params(eventType, record) };
          expectRefusalLeavesRecord({ directive, code: code ?? CODE, initial: record }, false);
        });
      });
    }
  }
});

describe('mocks refuse a tieFormat on a non-TEAM profile', () => {
  for (const eventType of NON_TEAM) {
    // a mocks profile takes no tieFormatName in 8.0.0 (an unknown option), so only the object is a case here
    for (const profile of [{ tieFormat: tieFormat() }]) {
      const key = Object.keys(profile)[0];
      it(`${eventType} drawProfiles ${key}`, () => {
        const result: any = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ eventType, drawSize: 4, ...profile }],
        });
        expect(result.error).toEqual(INVALID_TIE_FORMAT);
      });
      it(`${eventType} eventProfiles ${key}`, () => {
        const result: any = mocksEngine.generateTournamentRecord({
          eventProfiles: [{ eventType, drawProfiles: [{ drawSize: 4 }], ...profile }],
        });
        expect(result.error).toEqual(INVALID_TIE_FORMAT);
      });
      it(`${eventType} a flight's drawProfile ${key}`, () => {
        const result: any = mocksEngine.generateTournamentRecord({
          eventProfiles: [{ eventType, drawProfiles: [{ drawSize: 4, ...profile }] }],
        });
        expect(result.error).toEqual(INVALID_TIE_FORMAT);
      });
      it(`${eventType} modifyTournamentRecord leaves the record unchanged (${key})`, () => {
        const tournamentRecord = recordWith(SINGLES);
        const before = canonicalJson(tournamentRecord);
        const result: any = mocksEngine.modifyTournamentRecord({
          tournamentRecord,
          drawProfiles: [{ eventType, drawSize: 4, ...profile }],
        });
        expect(result.error).toEqual(INVALID_TIE_FORMAT);
        expect(canonicalJson(tournamentRecord)).toEqual(before);
      });
    }
  }
});

const applicant = { organisationId: 'org', organisationName: 'Club', contactName: 'A', contactEmail: 'a@b.test' };
const proposal = (events: any[]) => ({
  tournamentName: 'Open',
  proposedStartDate: '2028-06-01',
  proposedEndDate: '2028-06-07',
  events,
});
const proposed = (eventType: string, extra?: any) => ({
  eventName: eventType,
  eventType,
  drawSize: 8,
  drawType: SINGLE_ELIMINATION,
  ...extra,
});
const sanctioningRecordWith = (events: any[]) =>
  (createSanctioningRecord({ governingBodyId: 'gov', applicant, proposal: proposal(events) }) as any).sanctioningRecord;

describe('sanctioning refuses a tieFormat on a non-TEAM event proposal', () => {
  for (const eventType of NON_TEAM) {
    it(`${eventType}: createSanctioningRecord`, () => {
      const result: any = createSanctioningRecord({
        governingBodyId: 'gov',
        applicant,
        proposal: proposal([proposed(eventType, { tieFormat: tieFormat() })]),
      });
      expect(result.error).toEqual(INVALID_TIE_FORMAT);
    });
    it(`${eventType}: addEventProposal, record unchanged`, () => {
      const sanctioningRecord = sanctioningRecordWith([proposed(SINGLES)]);
      const before = canonicalJson(sanctioningRecord);
      const result: any = addEventProposal({
        sanctioningRecord,
        eventProposal: proposed(eventType, { tieFormat: tieFormat() }),
      });
      expect(result.error).toEqual(INVALID_TIE_FORMAT);
      expect(canonicalJson(sanctioningRecord)).toEqual(before);
    });
    it(`${eventType}: updateEventProposal, record unchanged`, () => {
      const sanctioningRecord = sanctioningRecordWith([proposed(eventType)]);
      const before = canonicalJson(sanctioningRecord);
      const { eventProposalId } = sanctioningRecord.proposal.events[0];
      const result: any = updateEventProposal({
        sanctioningRecord,
        eventProposalId,
        updates: { tieFormat: tieFormat() },
      });
      expect(result.error).toEqual(INVALID_TIE_FORMAT);
      expect(canonicalJson(sanctioningRecord)).toEqual(before);
    });
    it(`${eventType}: updateEventProposal from TEAM, record unchanged`, () => {
      const sanctioningRecord = sanctioningRecordWith([proposed(TEAM, { tieFormat: tieFormat() })]);
      const before = canonicalJson(sanctioningRecord);
      const { eventProposalId } = sanctioningRecord.proposal.events[0];
      const result: any = updateEventProposal({ sanctioningRecord, eventProposalId, updates: { eventType } });
      expect(result.error).toEqual(INVALID_TIE_FORMAT);
      expect(canonicalJson(sanctioningRecord)).toEqual(before);
    });
    it(`${eventType}: activateFromSanctioning (a proposal set by amendment), record unchanged`, () => {
      const sanctioningRecord = sanctioningRecordWith([proposed(eventType)]);
      sanctioningRecord.status = APPROVED;
      sanctioningRecord.proposal.events[0].tieFormat = tieFormat();
      const before = canonicalJson(sanctioningRecord);
      const result: any = activateFromSanctioning({ sanctioningRecord });
      expect(result.error).toEqual(INVALID_TIE_FORMAT);
      expect(canonicalJson(sanctioningRecord)).toEqual(before);
    });
  }
});

describe('TEAM still accepts a tieFormat', () => {
  it('addEvent, generateDrawDefinition and addDrawDefinition', () => {
    tournamentEngine.reset();
    tournamentEngine.setState(recordWith(TEAM));
    let result: any = tournamentEngine.addEvent({ event: { eventType: TEAM, eventId: 't2', tieFormat: tieFormat() } });
    expect(result.success).toBe(true);
    expect(tournamentEngine.getEvent({ eventId: 't2' }).event.tieFormat.collectionDefinitions.length).toBeGreaterThan(
      0,
    );

    result = tournamentEngine.generateDrawDefinition({
      eventId: 'e1',
      drawSize: 8,
      tieFormat: tieFormat(),
      drawId: 'd2',
    });
    expect(result.success).toBe(true);
    expect(result.drawDefinition.structures[0].matchUps[0].tieMatchUps.length).toBeGreaterThan(0);
    result = tournamentEngine.addDrawDefinition({ eventId: 'e1', drawDefinition: result.drawDefinition });
    expect(result.success).toBe(true);
  });

  it('modifyEvent keeps TEAM, and the tieFormat governor edits a TEAM event', () => {
    tournamentEngine.reset();
    tournamentEngine.setState(recordWith(TEAM));
    expect(tournamentEngine.modifyEvent({ eventId: 'e1', eventUpdates: { eventType: TEAM } }).success).toBe(true);
    const { tieFormat: stored } = tournamentEngine.getEvent({ eventId: 'e1' }).drawDefinition ?? {};
    const eventTieFormat = tournamentEngine.getEvent({ eventId: 'e1' }).event.tieFormat ?? stored;
    expect(eventTieFormat).toBeDefined();
    const collectionId = eventTieFormat.collectionDefinitions[0].collectionId;
    const result: any = tournamentEngine.modifyCollectionDefinition({
      eventId: 'e1',
      collectionId,
      collectionName: 'renamed',
    });
    expect(result.success).toBe(true);
  });

  it('mocks and sanctioning', () => {
    expect(
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ eventType: TEAM, drawSize: 4, tieFormat: tieFormat() }],
      }).tournamentRecord,
    ).toBeDefined();
    const sanctioningRecord = sanctioningRecordWith([proposed(TEAM, { tieFormat: tieFormat() })]);
    expect(sanctioningRecord).toBeDefined();
    expect(
      (addEventProposal({ sanctioningRecord, eventProposal: proposed(TEAM, { tieFormat: tieFormat() }) }) as any)
        .success,
    ).toBe(true);
  });

  it('a non-TEAM event and draw without a tieFormat are unaffected', () => {
    tournamentEngine.reset();
    tournamentEngine.setState(recordWith(SINGLES));
    expect(tournamentEngine.addEvent({ event: { eventType: DOUBLES, eventId: 'e2' } }).success).toBe(true);
    expect(
      tournamentEngine.generateDrawDefinition({ eventId: 'e1', drawSize: 8, matchUpFormat: 'SET3-S:6/TB7' }).success,
    ).toBe(true);
    expect(tournamentEngine.setMatchUpFormat({ eventId: 'e1', matchUpFormat: 'SET1-S:6/TB7' }).success).toBe(true);
  });
});
