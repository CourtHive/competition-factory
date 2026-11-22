import type { Tournament } from '@Types/tournamentTypes';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { afterEach, describe, expect, it } from 'vitest';
import { createSeededRandom } from '@Tools/prng';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

const drawId = 'recorded-consolation';
const originalRandom = Math.random;
afterEach(() => {
  Math.random = originalRandom;
  setOutcomePipeline('v1');
});

const record = () => Object.values(getTournamentRecords())[0] as Tournament;
const retired = (winningSide: number) => ({
  ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide }).outcome,
  matchUpStatus: RETIRED,
});
function draw() {
  const [main, consolation] = record().events![0].drawDefinitions![0].structures!;
  const at = (structure: typeof main, round: number, position: number) =>
    structure.matchUps!.find((m) => m.roundNumber === round && m.roundPosition === position)!;
  return {
    source: at(main, 1, 4),
    adjacent: at(main, 1, 3),
    semifinal: at(main, 2, 2),
    consolation: at(consolation, 1, 2),
    onward: at(consolation, 2, 2),
  };
}

function fixture(status: typeof WALKOVER | typeof RETIRED | typeof DEFAULTED, winningSide: number) {
  Math.random = createSeededRandom(158);
  setOutcomePipeline('v1');
  mocks.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: 'FEED_IN_CHAMPIONSHIP', drawSize: 8, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' },
    ],
    nonRandom: 158,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toBe(true);
  const { source, adjacent, consolation } = draw();
  const apply = (
    matchUpId: string,
    outcome: { winningSide: number; matchUpStatus?: string },
    propagateExitStatus = false,
  ) => {
    expect(engine.setMatchUpStatus({ drawId, matchUpId, outcome, propagateExitStatus }).success).toBe(true);
  };
  apply(source.matchUpId, retired(2));
  apply(source.tieMatchUps![2].matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, true);
  if (status === RETIRED) apply(adjacent.matchUpId, { winningSide: 1 });
  apply(consolation.matchUpId, status === RETIRED ? retired(winningSide) : { matchUpStatus: status, winningSide });
  if (status !== RETIRED) apply(adjacent.matchUpId, { winningSide: 1 });
  return { drawId, matchUpId: source.tieMatchUps![1].matchUpId, outcome: retired(1), propagateExitStatus: true };
}

describe.each(['v1', 'v2', 'differential'] as const)(
  '%s respects an independently recorded consolation result (F-032)',
  (mode) => {
    it.each([WALKOVER, DEFAULTED, RETIRED] as const)('preserves a %s award on a linked loser replacement', (status) => {
      const params = fixture(status, 1);
      const { consolation, onward } = draw();
      const held = [...onward.drawPositions!];
      const winningPosition = consolation.drawPositions![consolation.winningSide! - 1];
      expect(held).toContain(winningPosition);
      const saved = structuredClone(record());
      for (const freeOnward of [false, true]) {
        for (const direct of [true, false]) {
          engine.setState(structuredClone(saved));
          setOutcomePipeline(mode);
          if (freeOnward) draw().onward.drawPositions = held.filter((position) => position !== winningPosition);
          const beforeOnward = [...draw().onward.drawPositions!];
          const result = direct
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], false);
          expect(result.error).toBeUndefined();
          expect(result.success).toBe(true);
          const after = draw();
          expect(after.source.matchUpStatus).toBe(COMPLETED);
          expect(after.source.winningSide).toBe(1);
          expect(after.semifinal.drawPositions).toEqual([5, 7]);
          expect(after.consolation.matchUpStatus).toBe(status);
          expect(after.consolation.drawPositions![after.consolation.winningSide! - 1]).toBe(winningPosition);
          expect(after.onward.drawPositions).toEqual(beforeOnward);
        }
      }
    });
    it('keeps the award on the winning seat when its occupant is replaced', () => {
      const params = fixture(RETIRED, 2);
      const before = draw();
      const position = before.consolation.drawPositions![before.consolation.winningSide! - 1];
      expect(before.onward.drawPositions).toContain(position);
      setOutcomePipeline(mode);
      const result = engine.setMatchUpStatus(params);
      expect(result.error).toBeUndefined();
      const after = draw();
      expect(after.source.winningSide).toBe(1);
      expect(after.consolation.matchUpStatus).toBe(RETIRED);
      expect(after.consolation.drawPositions![after.consolation.winningSide! - 1]).toBe(position);
      expect(after.onward.drawPositions).toContain(position);
    });
  },
);
