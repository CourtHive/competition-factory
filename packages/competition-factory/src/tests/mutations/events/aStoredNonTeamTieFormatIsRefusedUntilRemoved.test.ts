import { expectRefusalLeavesRecord, OUTCOME_MODES, withPipeline } from '../atomicity/refusalGate';
import { tieFormats } from '@courthive/competition-catalogue';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { tools } from '../../../index';

// constants
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

/**
 * A record written before 8.0.0 can store a tieFormat on a non-TEAM event, draw or structure. A generator that meets
 * one refuses with INVALID_TIE_FORMAT, names where it is stored, and writes nothing; it neither uses it nor ignores it.
 * `tools.removeNonTeamTieFormats` returns a copy without those tieFormats, after which the generators succeed.
 */

const NON_TEAM = [SINGLES, DOUBLES] as const;
const CODE = INVALID_TIE_FORMAT.code;
const tieFormat = (tieFormatId?: string) => {
  const copy = structuredClone(tieFormats.DOMINANT_DUO) as any;
  copy.collectionDefinitions = copy.collectionDefinitions.map((cd, i) => ({ ...cd, collectionId: `c${i}` }));
  return tieFormatId ? { ...copy, tieFormatId } : copy;
};

type Where = 'event' | 'drawDefinition' | 'structure';

// e1: an 8 elimination draw d1; e2: an AD_HOC draw d2; e3: a TEAM event with its own tieFormat (never touched)
function cleanRecord(eventType: string) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { eventType, drawSize: 8, eventId: 'e1', drawId: 'd1' },
      { eventType, drawSize: 8, eventId: 'e2', drawId: 'd2', drawType: AD_HOC, automated: true, roundsCount: 1 },
      { eventType: TEAM, drawSize: 4, eventId: 'e3', drawId: 'd3', tieFormat: tieFormat() },
    ],
    participantsProfile: { participantsCount: 48 },
    nonRandom: 7,
  }).tournamentRecord;
}

// the same record as a 7.x write could leave it: a tieFormat on the non-TEAM events, at `where`
function legacyRecord(eventType: string, where: Where, clean = cleanRecord(eventType)) {
  const record = structuredClone(clean);
  for (const event of record.events.filter((e) => e.eventType !== TEAM)) {
    const drawDefinition = event.drawDefinitions[0];
    const targets = { event, drawDefinition, structure: drawDefinition.structures[0] };
    targets[where].tieFormat = tieFormat();
  }
  return record;
}

const expectedContext = (record: any, where: Where, eventId: string) => {
  const event = record.events.find((e) => e.eventId === eventId);
  const drawDefinition = event.drawDefinitions[0];
  if (where === 'event') return { location: 'event', eventId };
  if (where === 'drawDefinition') return { location: 'drawDefinition', eventId, drawId: drawDefinition.drawId };
  return {
    location: 'structure',
    eventId,
    drawId: drawDefinition.drawId,
    structureId: drawDefinition.structures[0].structureId,
  };
};

type Case = { name: string; method: string; eventId: string; wheres: Where[]; params: (record: any) => any };
const mainStructureId = (record: any, eventId: string) =>
  record.events.find((e) => e.eventId === eventId).drawDefinitions[0].structures[0].structureId;

const CASES: Case[] = [
  {
    name: 'generateDrawDefinition',
    method: 'generateDrawDefinition',
    eventId: 'e1',
    wheres: ['event'],
    params: () => ({ eventId: 'e1', drawSize: 8, drawId: 'dx' }),
  },
  {
    name: 'generateDrawDefinition AD_HOC',
    method: 'generateDrawDefinition',
    eventId: 'e2',
    wheres: ['event'],
    params: () => ({ eventId: 'e2', drawSize: 8, drawId: 'dx', drawType: AD_HOC, automated: true, roundsCount: 1 }),
  },
  {
    name: 'generateDrawDefinition on the existing draw',
    method: 'generateDrawDefinition',
    eventId: 'e1',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ eventId: 'e1', drawId: 'd1', drawSize: 8 }),
  },
  {
    name: 'generateAdHocMatchUps',
    method: 'generateAdHocMatchUps',
    eventId: 'e2',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd2', newRound: true }),
  },
  {
    name: 'generateAdHocRounds',
    method: 'generateAdHocRounds',
    eventId: 'e2',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd2', roundsCount: 1 }),
  },
  {
    name: 'drawMatic',
    method: 'drawMatic',
    eventId: 'e2',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd2', roundsCount: 1 }),
  },
  {
    name: 'generateSwissRound',
    method: 'generateSwissRound',
    eventId: 'e2',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd2' }),
  },
  {
    name: 'addPlayoffStructures',
    method: 'addPlayoffStructures',
    eventId: 'e1',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: (record) => ({ drawId: 'd1', structureId: mainStructureId(record, 'e1'), roundNumbers: [1] }),
  },
  {
    name: 'generateVoluntaryConsolation',
    method: 'generateVoluntaryConsolation',
    eventId: 'e1',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd1' }),
  },
  {
    name: 'generateQualifyingStructure',
    method: 'generateQualifyingStructure',
    eventId: 'e1',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: (record) => ({
      drawId: 'd1',
      targetStructureId: mainStructureId(record, 'e1'),
      qualifyingPositions: 2,
      drawSize: 4,
    }),
  },
  {
    name: 'generateDrawTypeAndModifyDrawDefinition',
    method: 'generateDrawTypeAndModifyDrawDefinition',
    eventId: 'e1',
    wheres: ['event', 'drawDefinition', 'structure'],
    params: () => ({ drawId: 'd1', drawSize: 8 }),
  },
];

describe.each(OUTCOME_MODES)('a generator refuses a stored non-TEAM tieFormat and writes nothing (%s)', (mode) => {
  for (const eventType of NON_TEAM) {
    for (const { name, method, eventId, wheres, params } of CASES) {
      for (const where of wheres) {
        it(`${eventType}: ${name}, stored on the ${where}`, () => {
          withPipeline(mode, () => {
            const record = legacyRecord(eventType, where);
            const directive = { method, params: params(record) };
            expectRefusalLeavesRecord({ directive, code: CODE, initial: record }, false);

            tournamentEngine.reset();
            tournamentEngine.setState(structuredClone(record));
            const result: any = tournamentEngine[method](params(record));
            expect(result.error).toEqual(INVALID_TIE_FORMAT);
            expect(result.context).toEqual(expectedContext(record, where, eventId));
          });
        });
      }
    }
  }
});

describe('tools.removeNonTeamTieFormats', () => {
  for (const eventType of NON_TEAM) {
    for (const where of ['event', 'drawDefinition', 'structure'] as Where[]) {
      it(`${eventType}: removes exactly the non-TEAM tieFormats stored on the ${where}, and changes nothing passed in`, () => {
        const clean = cleanRecord(eventType);
        const record = legacyRecord(eventType, where, clean);
        const before = canonicalJson(record);
        const result: any = tools.removeNonTeamTieFormats({ tournamentRecord: record });
        expect(result.success).toBe(true);
        expect(canonicalJson(record)).toEqual(before);
        expect(result.tournamentRecord).not.toBe(record);

        expect(result.removed).toEqual(
          ['e1', 'e2'].map((eventId) => {
            const { location, ...ids } = expectedContext(record, where, eventId);
            expect(location).toEqual(where);
            return ids;
          }),
        );

        // the cleaned copy is the record with only those tieFormats removed: it equals the record never given them
        expect(canonicalJson(result.tournamentRecord)).toEqual(canonicalJson(clean));
        // the TEAM event keeps its tieFormat
        const team = result.tournamentRecord.events.find((e) => e.eventId === 'e3');
        expect(team.tieFormat ?? team.drawDefinitions[0].tieFormat).toBeDefined();
      });
    }
  }

  it('removes a tieFormatId too, and returns nothing to remove for a clean record', () => {
    const record = cleanRecord(SINGLES);
    record.events[0].tieFormatId = 'tf-1';
    record.events[0].drawDefinitions[0].structures[0].tieFormat = tieFormat('tf-2');
    let result: any = tools.removeNonTeamTieFormats({ tournamentRecord: record });
    expect(result.removed).toEqual([
      { eventId: 'e1' },
      { eventId: 'e1', drawId: 'd1', structureId: mainStructureId(record, 'e1') },
    ]);
    expect(result.tournamentRecord.events[0].tieFormatId).toBeUndefined();
    result = tools.removeNonTeamTieFormats({ tournamentRecord: cleanRecord(DOUBLES) });
    expect(result.removed).toEqual([]);
  });

  it('refuses a missing record', () => {
    expect((tools.removeNonTeamTieFormats as any)({}).error).toBeDefined();
  });
});

describe.each(OUTCOME_MODES)('after tools.removeNonTeamTieFormats the generators succeed (%s)', (mode) => {
  for (const eventType of NON_TEAM) {
    for (const where of ['event', 'drawDefinition', 'structure'] as Where[]) {
      it(`${eventType}: stored on the ${where}`, () => {
        withPipeline(mode, () => {
          const { tournamentRecord }: any = tools.removeNonTeamTieFormats({
            tournamentRecord: legacyRecord(eventType, where),
          });
          for (const { method, params } of CASES) {
            tournamentEngine.reset();
            tournamentEngine.setState(structuredClone(tournamentRecord));
            const result: any = tournamentEngine[method](params(tournamentRecord));
            expect(result.error?.code === CODE, `${method}: ${JSON.stringify(result.error)}`).toBe(false);
          }
          tournamentEngine.reset();
          tournamentEngine.setState(structuredClone(tournamentRecord));
          expect(tournamentEngine.generateDrawDefinition({ eventId: 'e1', drawSize: 8, drawId: 'dx' }).success).toBe(
            true,
          );
          expect(tournamentEngine.generateAdHocMatchUps({ drawId: 'd2', newRound: true }).success ?? true).toBe(true);
        });
      });
    }
  }
});
