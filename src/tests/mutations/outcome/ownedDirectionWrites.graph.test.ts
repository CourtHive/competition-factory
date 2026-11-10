import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getProvider, getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { USTA_COLLEGE } from '@Constants/tieFormatConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';

const counter = vi.hoisted(() => ({ active: false, calls: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (load) => {
  const actual: any = await load();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      if (counter.active) counter.calls++;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.graph.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  counter.active = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fresh(drawProfile = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const generated = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, ...drawProfile }],
    nonRandom: 1,
    setState: true,
  });
  expect(generated.success).toBe(true);
  if ('eventType' in drawProfile && drawProfile.eventType === TEAM)
    expect(
      tournamentEngine.generateLineUps({ drawId: generated.drawIds![0], useDefaultEventRanking: true, attach: true })
        .success,
    ).toBe(true);
  const record = Object.values(getTournamentRecords())[0] as Tournament;
  const draw = record.events![0].drawDefinitions![0];
  return { drawId: generated.drawIds![0], record, matchUps: getMatchUpsMap({ drawDefinition: draw }).drawMatchUps };
}

function write(
  mode: typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2,
  drawId: string,
  matchUpId: string,
  outcome: object,
) {
  setOutcomePipeline(mode);
  counter.calls = 0;
  counter.active = true;
  try {
    const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
    expect(result).toMatchObject({ success: true });
    if (mode === OUTCOME_PIPELINE_V2) expect(counter.calls).toBe(0);
    const { stack: _stack, ...returned } = result;
    return returned;
  } finally {
    counter.active = false;
  }
}

const won = () => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clears result and direction with exact own properties and reset sharing',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, won());
    const result = write(mode, drawId, source.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    expect(Object.keys(result)).toEqual(['success', 'connectedStructures']);
    expect(Object.hasOwn(source, 'winningSide')).toBe(true);
    expect(Object.hasOwn(source, 'matchUpFormat')).toBe(true);
    expect(Object.hasOwn(source, 'sideExitProvenance')).toBe(false);
    expect(source.score).toBe(toBePlayed.score);
    expect(source.matchUpStatusCodes).toBe(toBePlayed.matchUpStatusCodes);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(Object.hasOwn(target, 'score')).toBe(true);
    expect(target.winningSide).toBeUndefined();
    expect(target.score).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s records an unplayed double exit with the reset fixture keys',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(source.score).toBe(toBePlayed.score);
    expect(source.matchUpStatusCodes).toBe(toBePlayed.matchUpStatusCodes);
    expect(Object.hasOwn(source, 'winningSide')).toBe(true);
    expect(Object.hasOwn(source, 'sideExitProvenance')).toBe(true);
    expect(Object.hasOwn(source, 'matchUpFormat')).toBe(true);
    expect(Object.keys(source.score!)).toEqual(['scoreStringSide1', 'scoreStringSide2', 'sets']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s includes the unnamed tally modification before its named result',
  (mode) => {
    const { drawId, matchUps, record } = fresh({ drawSize: 4, drawType: ROUND_ROBIN });
    const observed: string[][] = [];
    const provider = getProvider();
    const original = provider.cycleModifiedTournamentIds!;
    vi.spyOn(provider, 'cycleModifiedTournamentIds').mockImplementation(() => {
      const ids = original();
      if (counter.active && ids?.size) observed.push([...ids]);
      return ids;
    });
    write(mode, drawId, matchUps[0].matchUpId, won());
    expect(observed.at(-1)).toEqual(['*', record.tournamentId]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the undecided dual tally with explicit undefined fields',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 4, eventType: TEAM, tieFormatName: USTA_COLLEGE });
    const dual = matchUps.find((m) => m.tieMatchUps?.length && m.roundNumber === 1 && m.roundPosition === 1)!;
    const result = write(mode, drawId, dual.tieMatchUps![0].matchUpId, { winningSide: 1 });
    expect(Object.keys(result)).toEqual(['success', 'tieMatchUpResult', 'context']);
    expect(Object.keys(result.tieMatchUpResult)).toEqual([
      'success',
      'score',
      'removeWinningSide',
      'tieFormatRemoved',
      'winningSide',
    ]);
    expect(result.tieMatchUpResult.tieFormatRemoved).toBeUndefined();
    expect(result.tieMatchUpResult.winningSide).toBeUndefined();
  },
);
