import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';
import { drawTypes, setupTimedPlayoff } from './timedTeamPlayoff';
import { setOutcomePipeline } from '@Global/state/globalState';
import { tieFormats } from '@courthive/competition-catalogue';
import { afterEach, describe, expect, it } from 'vitest';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

// constants and types
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';

const tieFormat = tieFormats.INTENNSE_2026;

const drawId = 'bolts';
const modes = ['v1', 'v2', 'differential'] as const;
afterEach(() => setOutcomePipeline('v1'));

function completed(winningSide: 1 | 2, periods = 2) {
  const side1Score = winningSide === 1 ? 15 : 11;
  const side2Score = winningSide === 2 ? 15 : 11;
  const sets = Array.from({ length: periods }, (_, i) => ({ setNumber: i + 1, side1Score, side2Score, winningSide }));
  return {
    winningSide,
    matchUpStatus: 'COMPLETED' as const,
    score: {
      sets,
      scoreStringSide1: Array(periods).fill([side1Score, side2Score].join('-')).join(' '),
      scoreStringSide2: Array(periods).fill([side2Score, side1Score].join('-')).join(' '),
    },
  };
}

const liveScore = {
  sets: [{ setNumber: 1, side1Score: 7, side2Score: 6 }],
  scoreStringSide1: '7-6',
  scoreStringSide2: '6-7',
};
type Correction = {
  name: string;
  outcome: { matchUpStatus?: MatchUpStatusUnion; winningSide?: 1 | 2; score?: Score };
  winner?: number;
  tally?: string;
  error?: string;
};
const scenarios: Correction[] = [
  { name: 'live', outcome: { matchUpStatus: 'IN_PROGRESS', score: liveScore }, tally: '0-0' },
  { name: 'suspended', outcome: { matchUpStatus: 'SUSPENDED', score: liveScore }, tally: '0-0' },
  { name: 'clear', outcome: { matchUpStatus: 'TO_BE_PLAYED' }, tally: '22-30' },
  { name: 'opposite winner', outcome: completed(1), winner: 1, tally: '30-22' },
  { name: 'same winner', outcome: completed(2), winner: 2, tally: '22-30' },
  { name: 'score only', outcome: { score: liveScore }, error: 'ERR_INVALID_SCORE' },
];

function setup() {
  engine.reset();
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    drawProfiles: [
      {
        drawId,
        drawSize: 4,
        eventType: 'TEAM',
        teamGenders: { MALE: 3, FEMALE: 3 },
        tieFormat: structuredClone(tieFormat),
      },
    ],
    nonRandom: 2027,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
}

describe.each(modes)('%s timed TEAM line correction', (mode) => {
  it.each(scenarios)('$name', (scenario) => {
    setup();
    const get = () =>
      engine.getTournament().tournamentRecord!.events![0].drawDefinitions![0].structures[0].matchUps![0];
    const ids = get()
      .tieMatchUps!.filter((m) => m.matchUpType === 'SINGLES')
      .map((m) => m.matchUpId);
    expect(ids).toHaveLength(4);
    const freshRecord = structuredClone(engine.getTournament().tournamentRecord!);
    for (const matchUpId of ids) {
      setOutcomePipeline('v1');
      expect(engine.setState(structuredClone(freshRecord)).success).toBe(true);
      expect(engine.setMatchUpStatus({ drawId, matchUpId, outcome: completed(2) }).success).toBe(true);
      expect(
        engine.setMatchUpStatus({
          drawId,
          matchUpId: get().matchUpId,
          outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
        }).success,
      ).toBe(true);
      const decided = structuredClone(engine.getTournament().tournamentRecord!);
      for (const route of ['direct', 'queue-off', 'queue-on']) {
        expect(engine.setState(structuredClone(decided)).success).toBe(true);
        setOutcomePipeline(mode);
        const params = { drawId, matchUpId, outcome: structuredClone(scenario.outcome) };
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
        if (scenario.error) {
          expect(result.error?.code).toBe(scenario.error);
          expect(engine.getTournament().tournamentRecord).toEqual(decided);
          continue;
        }
        expect(result.success).toBe(true);
        const parent = get();
        const line = parent.tieMatchUps!.find((m) => m.matchUpId === matchUpId)!;
        const { drawDefinition, event } = engine.getEvent({ drawId });
        const tally = generateTieMatchUpScore({ matchUp: parent, drawDefinition, event });
        expect(parent).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 2 });
        expect(line.winningSide).toBe(scenario.winner);
        if (scenario.name === 'clear') expect(line.matchUpStatus).toBe('IN_PROGRESS');
        else expect(line.matchUpStatus).toBe(scenario.outcome.matchUpStatus);
        if ('score' in scenario.outcome) expect(line.score).toEqual(scenario.outcome.score);
        expect(tally.scoreStringSide1).toBe(scenario.tally);
      }
    }
  });
});

describe.each(drawTypes)('%s', (drawType) => {
  it.each(modes)('keeps the finalist seat empty after the other six BOLTs finish in %s', (mode) => {
    for (const prior of ['fresh', 'score only on fresh', 'completed', 'completed then cleared']) {
      const { drawId, matches } = setupTimedPlayoff(drawType);
      const [parent] = matches();
      const [line, ...others] = parent.tieMatchUps!;
      expect(line.matchUpType).toBe('SINGLES');
      const write = (matchUpId: string, outcome: Correction['outcome']) =>
        engine.setMatchUpStatus({ drawId, matchUpId, outcome });
      if (prior.startsWith('completed')) expect(write(line.matchUpId, completed(2)).success).toBe(true);
      if (prior === 'completed then cleared')
        expect(write(line.matchUpId, { matchUpStatus: 'TO_BE_PLAYED' }).success).toBe(true);
      setOutcomePipeline(mode);
      const outcome =
        prior === 'score only on fresh'
          ? { score: liveScore }
          : { matchUpStatus: 'IN_PROGRESS' as const, score: liveScore };
      expect(write(line.matchUpId, outcome).success).toBe(true);
      expect(line).toMatchObject({ matchUpStatus: 'IN_PROGRESS', score: { scoreStringSide1: '7-6' } });
      expect(line.winningSide).toBeUndefined();
      for (const other of others)
        expect(write(other.matchUpId, completed(2, other.matchUpType === 'SINGLES' ? 2 : 1)).success).toBe(true);
      const [semifinal, , final] = matches();
      expect(semifinal).toMatchObject({ matchUpStatus: 'IN_PROGRESS', score: { scoreStringSide1: '99-135' } });
      expect(semifinal.winningSide).toBeUndefined();
      expect(final.drawPositions).toEqual([]);
      const hydrated = engine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === line.matchUpId)!;
      expect(hydrated.matchUpStatus).toBe('IN_PROGRESS');
      expect(hydrated.winningSide).toBeUndefined();
    }
  });
});

it.each(modes)('refuses an implied completed score on a one-period doubles BOLT in %s', (mode) => {
  setup();
  const record = structuredClone(engine.getTournament().tournamentRecord!);
  const parent = record.events![0].drawDefinitions![0].structures[0].matchUps![0];
  const doubles = parent.tieMatchUps!.filter((m) => m.matchUpType === 'DOUBLES');
  expect(doubles).toHaveLength(3);
  for (const { matchUpId } of doubles) {
    setOutcomePipeline('v1');
    expect(engine.setState(structuredClone(record)).success).toBe(true);
    expect(engine.setMatchUpStatus({ drawId, matchUpId, outcome: completed(2, 1) }).success).toBe(true);
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: parent.matchUpId,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      }).success,
    ).toBe(true);
    const before = structuredClone(engine.getTournament().tournamentRecord!);
    setOutcomePipeline(mode);
    for (const route of ['direct', 'queue-off', 'queue-on']) {
      const params = { drawId, matchUpId, outcome: { matchUpStatus: 'IN_PROGRESS' as const, score: liveScore } };
      const result =
        route === 'direct'
          ? engine.setMatchUpStatus(params)
          : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
      expect(result.error?.code).toBe('ERR_INCOMPATIBLE_MATCHUP_STATUS');
      expect(engine.getTournament().tournamentRecord).toEqual(before);
    }
  }
});
