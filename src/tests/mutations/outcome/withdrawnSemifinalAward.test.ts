import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import {
  BYE,
  DEFAULTED,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

const drawId = 'withdrawn-semifinal-award';
const record = () => Object.values(getTournamentRecords())[0] as Tournament;
const matches = () => matchUpsOf(record().events![0].drawDefinitions![0].structures![0])!;
const outcome = (matchUpId: string, matchUpStatus: MatchUpStatusUnion, winningSide?: number) => ({
  drawId,
  matchUpId,
  outcome: { matchUpStatus, winningSide },
});

function setup(scoredLine: boolean) {
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 8,
        participantsCount: 6,
        eventType: 'TEAM',
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
        tieFormatName: 'DOMINANT_DUO',
      },
    ],
    nonRandom: 326,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
  const [paired, source, opposite, , semi, other, final] = matches();
  const set = (...args: Parameters<typeof outcome>) =>
    expect(engine.setMatchUpStatus(outcome(...args)).success).toBe(true);
  if (scoredLine) set(paired.tieMatchUps![0].matchUpId, DEFAULTED, 1);
  expect(paired.matchUpStatus).toBe(scoredLine ? IN_PROGRESS : BYE);
  set(opposite.matchUpId, WALKOVER, 1);
  set(other.matchUpId, WALKOVER, 1);
  set(source.matchUpId, DOUBLE_WALKOVER);
  expect(semi.winningSide).toBe(1);
  expect(final.drawPositions).toEqual([1, 5]);
  return { source, semi, other };
}

afterEach(() => setOutcomePipeline('v1'));

for (const shape of ['scored line', 'original BYE', 'persisted stale finalist', 'earned finalist'] as const) {
  it.each(['v1', 'v2', 'differential'] as const)('%s withdraws the produced advancement with ' + shape, (mode) => {
    const { source, semi, other } = setup(shape !== 'original BYE');
    let params = outcome(source.matchUpId, WALKOVER, 2);
    if (shape === 'persisted stale finalist' || shape === 'earned finalist') {
      expect(engine.setMatchUpStatus(params).success).toBe(true);
      if (shape === 'earned finalist')
        expect(engine.setMatchUpStatus(outcome(semi.matchUpId, WALKOVER, 1)).success).toBe(true);
      else matches()[6].drawPositions = [1, 5];
      params = outcome(semi.matchUpId, DOUBLE_WALKOVER);
    }
    const initial = structuredClone(record());
    const standing = structuredClone(other);
    for (const route of ['direct', 'queueOff', 'queueOn']) {
      engine.setState(structuredClone(initial));
      setOutcomePipeline(mode);
      const result =
        route === 'direct'
          ? engine.setMatchUpStatus(params)
          : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queueOn');
      expect(result.success).toBe(true);
      const [, , , , updated, retained, final] = matches();
      expect(retained).toEqual(standing);
      expect(final.drawPositions).toEqual([5]);
      if (params.matchUpId === semi.matchUpId) {
        expect(updated.matchUpStatus).toBe(DOUBLE_WALKOVER);
        expect(final.matchUpStatus).toBe(WALKOVER);
        expect(final.winningSide).toBe(2);
      } else {
        expect(updated.matchUpStatus).toBe(TO_BE_PLAYED);
        expect(updated.winningSide).toBeUndefined();
        expect(updated.sideExitProvenance).toBeUndefined();
        expect(engine.getDrawInconsistencies({ drawId }).inconsistencies).toEqual([]);
      }
    }
  });
}

it.each(['v1', 'v2', 'differential'] as const)(
  '%s preserves a finalist when the stored award has a different feeder',
  (mode) => {
    const { source, semi, other } = setup(true);
    const origins = semi.sideExitProvenance!;
    expect(origins[1].sourceMatchUpId).toBe(matches()[0].matchUpId);
    origins[1].sourceMatchUpId = other.matchUpId;
    setOutcomePipeline(mode);
    const result = engine.setMatchUpStatus(outcome(source.matchUpId, WALKOVER, 2));
    expect(result.success).toBe(true);
    expect(matches()[6].drawPositions).toEqual([1, 5]);
  },
);
