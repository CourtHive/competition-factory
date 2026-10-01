import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { CorpusWriteError, writeScenario } from '../testHarness/corpus/writeScenario';
import { canonicalHash } from '../testHarness/corpus/hash';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

/**
 * Golden corpus C1c, the done-when from the plan: "one scenario round-trips: generate → write →
 * read → replay through the TS engine → every step hash matches. Twice, byte-identical."
 */
const CLOCK = '2026-10-01T12:00:00.000Z';
const SEED = 9000017;

afterEach(() => {
  setRandomSource();
  setClock();
});

function generate() {
  setRandomSource(SEED);
  setClock(CLOCK);
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  });
  return tournamentRecord;
}

function directivesFor(record: any) {
  tournamentEngine.reset();
  tournamentEngine.setState(record);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRound = matchUps
    .filter((m: any) => m.roundNumber === 1)
    .sort((a: any, b: any) => a.roundPosition - b.roundPosition);
  const score = (m: any, scoreString: string, winningSide: number) => ({
    method: 'setMatchUpStatus',
    params: {
      outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome,
      matchUpId: m.matchUpId,
      drawId: m.drawId,
    },
  });
  return [
    score(firstRound[0], '6-1 6-1', 1),
    score(firstRound[1], '6-2 6-2', 2),
    {
      method: 'setMatchUpStatus',
      params: { drawId: firstRound[0].drawId, matchUpId: 'no-such-matchUp', outcome: { winningSide: 1 } },
    },
    score(firstRound[2], '7-5 7-5', 1),
    score(firstRound[0], '6-4 6-4', 2), // re-score the first with the other winner
  ];
}

function write() {
  const record = generate();
  return writeScenario({
    scenarioId: 'scoring/single-elimination-8/round-trip',
    source: { kind: 'authored', ref: 'src/tests/corpus/scenarioRoundTrip.test.ts' },
    seed: SEED,
    clock: CLOCK,
    tags: ['scoring', 'round-trip'],
    initialRecord: record,
    directives: directivesFor(record),
    invariants: ['PARTICIPANT_DUPLICATED_IN_STRUCTURE', 'BYE_POSITION_WITH_PARTICIPANT'],
  });
}

it('writes a scenario the schema accepts, with a refusal step that changes nothing', () => {
  const scenario = write();
  expect(scenario.steps).toHaveLength(5);
  expect(scenario.steps[0].result).toEqual({ success: true });
  const mainStructure = scenario.initial.record.events[0].drawDefinitions[0].structures[0];
  expect(scenario.steps[0].coordinates).toEqual({
    structureName: mainStructure.structureName,
    eventIndex: 0,
    drawIndex: 0,
    roundNumber: 1,
    roundPosition: 1,
  });
  expect(scenario.steps[0].patch.length).toBeGreaterThan(0);

  const refusal = scenario.steps[2];
  expect(refusal.result.error).toEqual(MATCHUP_NOT_FOUND.code);
  expect(refusal.patch).toEqual([]);
  expect(refusal.hash).toEqual(scenario.steps[1].hash);
  expect(refusal.coordinates).toBeUndefined();

  expect(scenario.initial.hash).toEqual(canonicalHash(scenario.initial.record));
});

it('reads back: applying each patch reproduces each hash, with no engine involved', () => {
  expect(replayAsReader(write())).toEqual([]);
});

it('replays through the engine: every step hash and result match', () => {
  expect(replayThroughEngine(write())).toEqual([]);
});

it('is byte-identical when written twice', () => {
  expect(canonicalJson(write())).toEqual(canonicalJson(write()));
});

it('a tampered patch is caught by the reader and a tampered hash by the engine replay', () => {
  const tampered = write();
  tampered.steps[1].patch.push({ op: 'add', path: '/notes', value: 'tampered' } as any);
  expect(replayAsReader(tampered).map((m) => m.step)).toEqual([1, 2, 3, 4]);

  const wrongHash = write();
  wrongHash.steps[3].hash = `sha256:${'f'.repeat(64)}`;
  expect(replayThroughEngine(wrongHash).map((m) => m.step)).toEqual([3]);
});

it('refuses to write a scenario whose initial record fails the CODES schema', () => {
  const record = generate();
  record.events[0].drawDefinitions[0].structures[0].matchUps[0].notAField = true;
  expect(() =>
    writeScenario({
      scenarioId: 'scoring/bad/record',
      source: { kind: 'authored', ref: 'test' },
      seed: SEED,
      clock: CLOCK,
      initialRecord: record,
      directives: [],
    }),
  ).toThrow(CorpusWriteError);
});
