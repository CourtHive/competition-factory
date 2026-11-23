import { afterEach, expect, it } from 'vitest';
import { getOutcomePipeline, getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import type { MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';

const drawId = 'line-correction';
const entryPipeline = getOutcomePipeline();
afterEach(() => setOutcomePipeline(entryPipeline));

const record = () => Object.values(getTournamentRecords())[0] as Tournament;
const duals = () => matchUpsOf(record().events![0].drawDefinitions![0].structures![0])!;
function reload() {
  const saved = JSON.stringify(record());
  expect(engine.setState(JSON.parse(saved)).success).toBe(true);
}

function submit(matchUp: MatchUp, matchUpStatus: MatchUpStatusUnion, winningSide?: number) {
  const score =
    matchUpStatus === 'COMPLETED' && matchUp.matchUpType === 'DOUBLES'
      ? {
          sets: [
            { setNumber: 1, side1Score: winningSide === 1 ? 8 : 2, side2Score: winningSide === 2 ? 8 : 2, winningSide },
          ],
        }
      : undefined;
  const result = engine.setMatchUpStatus({
    drawId,
    matchUpId: matchUp.matchUpId,
    outcome: { matchUpStatus, winningSide, score },
    allowChangePropagation: true,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  reload();
}

for (const hasCollectionId of [true, false]) {
  it.each(['v1', 'v2', 'differential'] as const)(
    `%s keeps the TEAM winner seated on a stored line with round coordinates (collectionId present: ${hasCollectionId})`,
    (mode) => {
      setOutcomePipeline(mode);
      mocks.generateTournamentRecord({
        drawProfiles: [{ drawId, drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' }],
        nonRandom: 1,
        setState: true,
      });
      expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
      const [semi, other, final] = duals();
      const [line, ...remaining] = semi.tieMatchUps!;
      // Stored tournament records can carry the enclosing dual's bracket coordinates on a collection line.
      Object.assign(line, {
        roundNumber: semi.roundNumber,
        roundPosition: semi.roundPosition,
        drawPositions: [...semi.drawPositions!],
      });
      reload();
      submit(line, 'COMPLETED', 1);
      for (const sibling of remaining) submit(sibling, 'WALKOVER', 2);
      submit(other, 'WALKOVER', 2);
      const finalists = [semi.drawPositions![1], other.drawPositions![1]];
      expect(duals()[2].drawPositions).toEqual(finalists);
      submit(final, 'WALKOVER', 1);
      submit(final, 'TO_BE_PLAYED');
      if (!hasCollectionId) {
        // An imported line can identify its format directly and its parent through tieMatchUps.
        const storedLine = duals()[0].tieMatchUps![0];
        delete storedLine.collectionId;
        storedLine.matchUpFormat = 'SET1-S:8/TB7';
        reload();
      }
      submit(duals()[0].tieMatchUps![0], 'COMPLETED', 2);
      const [updated, , destination] = duals();
      expect(updated.tieMatchUps![0].winningSide).toBe(2);
      expect(updated.winningSide).toBe(2);
      expect(destination.drawPositions).toEqual(finalists);
      submit(updated, 'WALKOVER', 2);
      expect(duals()[2].drawPositions).toEqual(finalists);
    },
  );
}
