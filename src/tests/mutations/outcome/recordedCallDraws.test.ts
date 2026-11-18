import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { randomSource, setRandomSource } from '@Tools/prng';
import { replayedDraws } from '@Tools/replayedDraws';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

// CONTROL: with `refuse` set, v1 still runs on the copy (and draws there) and its recording is then thrown away
const recorder = vi.hoisted(() => ({ refuse: false, ran: 0 }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) => {
    const recorded = actual.recordWholeCall(args);
    recorder.ran += 1;
    return recorder.refuse ? undefined : recorded;
  };
  return { ...actual, recordWholeCall };
});

/**
 * A RECORDED CALL DRAWS ONCE (`tools/replayedDraws.ts`, `setMatchUpStatus`). A qualifying final given a winner seats
 * the qualifier in a main draw qualifier seat picked at random (`placeQualifier`). The call is recorded whole: v1 runs
 * on a copy of the record and picks there, and where v1 then runs on the stored record too (`differential`, or a
 * recording refused or dropped) it is handed the copy's draws, so it picks the same seat and the stream stands where
 * one run leaves it. Each case is the same calls on the same record under `v1`, `v2` and `differential`: the record
 * after them, each call's result and the source's next value must be the same in all three.
 */

const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;
const PLACE = { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } };
const REMOVE = { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } };
const cleared = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

const entryMode = getOutcomePipeline();

afterEach(() => {
  recorder.refuse = false;
  setOutcomePipeline(entryMode);
  setRandomSource();
  setClock();
});

const qualifyingMatchUps = () =>
  tournamentEngine
    .allTournamentMatchUps({ contextFilters: { stages: [QUALIFYING] } })
    .matchUps.sort((a: any, b: any) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition);

const seated = () =>
  tournamentEngine
    .allTournamentMatchUps({ contextFilters: { stages: [MAIN] } })
    .matchUps.flatMap((matchUp: any) => matchUp.sides)
    .filter((side: any) => side.qualifier && side.participantId)
    .map((side: any) => `${side.drawPosition}:${side.participantId}`)
    .sort();

/**
 * Four qualifying finals feeding eight main draw qualifier seats: the finals are won (each seats its qualifier), the
 * first is cleared (its qualifier is taken out) and won again, every call seeded as `seeds` says.
 */
function play(mode: OutcomePipelineMode, seeds: { configured?: number; nonRandom?: number }, refuse = false) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId: 'd',
        drawSize: 32,
        qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
      },
    ],
    nonRandom: 7,
    setState: true,
  });
  const win = (matchUpId: string, params: Record<string, unknown> = {}) =>
    tournamentEngine.setMatchUpStatus({
      outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome,
      drawId: 'd',
      matchUpId,
      ...params,
    });
  const finals = qualifyingMatchUps().filter((matchUp: any) => matchUp.finishingRound === 1);
  expect(finals).toHaveLength(4);
  for (const matchUp of qualifyingMatchUps().filter((matchUp: any) => matchUp.finishingRound !== 1)) {
    expect(win(matchUp.matchUpId).success).toEqual(true);
  }

  setOutcomePipeline(mode);
  recorder.refuse = refuse;
  recorder.ran = 0;
  if (seeds.configured !== undefined) setRandomSource(seeds.configured);
  const seeded = (step: number) => (seeds.nonRandom === undefined ? {} : { nonRandom: seeds.nonRandom + step });
  const compared = () => Object.values(getDifferentialTally()).reduce((sum, route) => sum + route.compared, 0);
  const comparedBefore = compared();
  const results: any[] = [];
  const seats: string[][] = [];
  const call = (result: any) => {
    results.push(result);
    seats.push(seated());
  };
  finals.forEach((final: any, at: number) => call(win(final.matchUpId, { policyDefinitions: PLACE, ...seeded(at) })));
  call(
    tournamentEngine.setMatchUpStatus({
      matchUpId: finals[0].matchUpId,
      policyDefinitions: REMOVE,
      outcome: cleared,
      drawId: 'd',
      ...seeded(4),
    }),
  );
  call(win(finals[0].matchUpId, { policyDefinitions: PLACE, ...seeded(5) }));
  const next = randomSource()();
  recorder.refuse = false;
  return {
    results: results.map(({ stack: _stack, ...result }) => result),
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    compared: compared() - comparedBefore,
    recordings: recorder.ran,
    seats,
    next,
  };
}

const SEEDS = [11, 12, 13, 14, 15];

function expectAsV1(seeds: { configured?: number; nonRandom?: number }, refuse = false) {
  const [v1, v2, differential] = MODES.map((mode) => play(mode, seeds, refuse));
  // the scenario is the one meant: every final seats a qualifier, the clear takes one out, and it is seated again
  expect(v1.results.map((result) => result.error)).toEqual(v1.results.map(() => undefined));
  expect(v1.seats.map((seats) => seats.length)).toEqual([1, 2, 3, 4, 3, 4]);
  // and the calls are recorded ones: v1 ran on a copy for each, and `differential` applied and compared each shadow
  expect(v1.recordings).toEqual(0);
  expect(v2.recordings).toEqual(6);
  expect(differential.recordings).toEqual(6);
  if (!refuse) expect(differential.compared).toBeGreaterThanOrEqual(6);
  for (const run of [v2, differential]) {
    expect(run.seats).toEqual(v1.seats);
    expect(run.results).toEqual(v1.results);
    expect(run.record).toEqual(v1.record);
    expect(run.next).toEqual(v1.next);
  }
  return v1;
}

describe('a recorded call takes its random draws once', () => {
  it.each(SEEDS)('configured seed %i: the record and the stream are the same in every mode', (configured) => {
    expectAsV1({ configured });
  });

  it.each(SEEDS)(
    'configured seed %i: the same where the recording is refused after v1 ran on the copy',
    (configured) => {
      expectAsV1({ configured }, true);
    },
  );

  it.each(SEEDS)('a call seeded with nonRandom %i: the same seat in every mode, recorded or refused', (nonRandom) => {
    expectAsV1({ nonRandom, configured: 3 });
    expectAsV1({ nonRandom, configured: 3 }, true);
  });

  it('the seat is a draw: seeds seat the qualifiers differently', () => {
    const seats = SEEDS.map((configured) => play(OUTCOME_PIPELINE_V1, { configured }).seats.at(-1)?.join());
    expect(new Set(seats).size).toBeGreaterThan(1);
  });
});

describe('replayedDraws', () => {
  it('hands a later run the draws an earlier run took, then reads the source', () => {
    setRandomSource(5);
    const draws = replayedDraws();
    const first = draws.record(() => [randomSource()(), randomSource()()]);
    // the source stands two draws on, and a replay reads none of them again
    const replayed = draws.replay(() => [randomSource()(), randomSource()(), randomSource()()]);
    expect(replayed.slice(0, 2)).toEqual(first);
    const after = randomSource()();
    setRandomSource(5);
    const alone = [randomSource()(), randomSource()(), randomSource()(), randomSource()()];
    expect([...replayed, after]).toEqual(alone);
  });

  it('reads nothing and scopes nothing for a run that follows no draw', () => {
    setRandomSource(5);
    const source = randomSource();
    const draws = replayedDraws();
    expect(draws.record(() => 'ran')).toEqual('ran');
    expect(draws.replay(() => randomSource())).toBe(source);
  });

  it('a second recording starts from the first draw too', () => {
    setRandomSource(5);
    const draws = replayedDraws();
    const first = draws.record(() => randomSource()());
    const second = draws.record(() => [randomSource()(), randomSource()()]);
    expect(second?.[0]).toEqual(first);
    expect(draws.replay(() => [randomSource()(), randomSource()()])).toEqual(second);
  });

  it('a source that threw throws the same error again, and is not read again for it', () => {
    let reads = 0;
    setRandomSource(() => {
      reads += 1;
      return reads === 2 ? 2 : 0.25;
    });
    const draws = replayedDraws();
    const run = () => {
      const values: unknown[] = [randomSource()()];
      try {
        randomSource()();
      } catch (error) {
        values.push((error as Error).message);
      }
      return values;
    };
    const first = draws.record(run);
    expect(first?.[1]).toMatch(/DEGENERATE_RANDOM_SOURCE/);
    expect(draws.replay(run)).toEqual(first);
    expect(reads).toEqual(2);
  });

  it('each run reads through a function of its own', () => {
    const draws = replayedDraws();
    const sources = new Set([draws.record(() => randomSource()), draws.record(() => randomSource())]);
    draws.record(() => randomSource()());
    sources.add(draws.replay(() => randomSource()));
    expect(sources.size).toEqual(3);
  });

  it('stands as the configured source for a provider without the call-stream hooks', async () => {
    const { setStateProvider } = await import('@Global/state/globalState');
    const syncGlobalState = (await import('@Global/state/syncGlobalState')).default;
    try {
      setStateProvider({ ...syncGlobalState, getCallRandomSource: undefined, setCallRandomSource: undefined });
      setRandomSource(5);
      const draws = replayedDraws();
      const first = draws.record(() => [randomSource()(), randomSource()()]);
      expect(first).toHaveLength(2);
      expect(draws.replay(() => [randomSource()(), randomSource()()])).toEqual(first);
      const after = randomSource()();
      setRandomSource(5);
      expect([...(first ?? []), after]).toEqual([randomSource()(), randomSource()(), randomSource()()]);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });

  it('refuses, before the run, where the provider keeps a stream of its own', async () => {
    const { setStateProvider, getCallRandomSource } = await import('@Global/state/globalState');
    const syncGlobalState = (await import('@Global/state/syncGlobalState')).default;
    const fixed = () => 0.5;
    try {
      setStateProvider({ ...syncGlobalState, getCallRandomSource: () => fixed, setCallRandomSource: undefined });
      expect(getCallRandomSource()).toBe(fixed);
      const draws = replayedDraws();
      const run = vi.fn(() => randomSource()());
      expect(draws.record(run)).toBeUndefined();
      expect(run).not.toHaveBeenCalled();
      // and a run that follows reads the provider's stream itself
      expect(draws.replay(() => randomSource())).toBe(fixed);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
