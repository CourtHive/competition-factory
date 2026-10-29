import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { COMPASS, MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';

function generate(drawProfile) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  return drawId;
}

function matchUpsOf(drawId) {
  return tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
}

describe('applyOutcomes', () => {
  test('records outcomes by round and position through the engine', () => {
    const drawId = generate({ drawSize: 8 });

    let result: any = tournamentEngine.applyOutcomes({
      drawId,
      outcomes: [
        { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
        { roundNumber: 1, roundPosition: 2, scoreString: '6-2 3-1', winningSide: 2, matchUpStatus: RETIRED },
      ],
    });
    expect(result.success).toEqual(true);
    expect(result.appliedMatchUpIds.length).toEqual(2);
    expect(result.skipped).toEqual([]);

    const matchUps = matchUpsOf(drawId);
    const [first, second] = [1, 2].map((roundPosition) =>
      matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === roundPosition),
    );
    expect(first.matchUpStatus).toEqual(COMPLETED);
    expect(first.score.scoreStringSide1).toEqual('6-1 6-1');
    expect(second.matchUpStatus).toEqual(RETIRED);
    expect(second.winningSide).toEqual(2);
    expect(result.appliedMatchUpIds).toEqual([first.matchUpId, second.matchUpId]);
  });

  test('a later outcome can name, by drawPositions, a matchUp an earlier outcome filled', () => {
    const drawId = generate({ drawSize: 4 });
    const firstRound = matchUpsOf(drawId).filter((m) => m.roundNumber === 1);
    const [side1, side2] = firstRound.map((m) => m.drawPositions[0]);

    // both first-round winners are drawPositions[0] of their matchUp; the final's positions exist only
    // once those two outcomes are recorded
    const result: any = tournamentEngine.applyOutcomes({
      drawId,
      outcomes: [
        ...firstRound.map(({ roundPosition }) => ({
          roundNumber: 1,
          roundPosition,
          scoreString: '6-0 6-0',
          winningSide: 1,
        })),
        { roundNumber: 2, drawPositions: [side1, side2], scoreString: '7-5 7-5', winningSide: 2 },
      ],
    });
    expect(result.success).toEqual(true);
    expect(result.skipped).toEqual([]);

    const final = matchUpsOf(drawId).find((m) => m.roundNumber === 2);
    expect(final.winningSide).toEqual(2);
    expect(final.score.scoreStringSide1).toEqual('5-7 5-7');
  });

  test('targets a round robin group by structureOrder, and a structure by name', () => {
    let drawId = generate({ drawSize: 16, drawType: ROUND_ROBIN });

    let result: any = tournamentEngine.applyOutcomes({
      drawId,
      outcomes: [{ structureOrder: 3, roundNumber: 1, matchUpIndex: 1, scoreString: '6-3 6-3', winningSide: 1 }],
    });
    expect(result.success).toEqual(true);
    let [matchUpId] = result.appliedMatchUpIds;
    let target = matchUpsOf(drawId).find((m) => m.matchUpId === matchUpId);
    expect(target.structureName).toEqual('Group 3');
    expect(target.roundNumber).toEqual(1);

    drawId = generate({ drawSize: 16, drawType: COMPASS });
    result = tournamentEngine.applyOutcomes({
      drawId,
      outcomes: [
        {
          stage: MAIN,
          structureName: 'East',
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-4 6-4',
          winningSide: 1,
        },
      ],
    });
    expect(result.success).toEqual(true);
    [matchUpId] = result.appliedMatchUpIds;
    target = matchUpsOf(drawId).find((m) => m.matchUpId === matchUpId);
    expect(target.structureName).toEqual('East');
    expect(target.roundPosition).toEqual(2);
  });

  test('reports an outcome that matches nothing, or a BYE, and applies the rest', () => {
    const drawId = generate({ drawSize: 8, participantsCount: 7 });
    const bye = matchUpsOf(drawId).find((m) => m.matchUpStatus === 'BYE');
    const playable = matchUpsOf(drawId).find((m) => m.roundNumber === 1 && m.matchUpStatus !== 'BYE');

    const result: any = tournamentEngine.applyOutcomes({
      drawId,
      outcomes: [
        { roundNumber: 1, roundPosition: bye.roundPosition, scoreString: '6-1 6-1', winningSide: 1 },
        { roundNumber: 9, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
        { roundNumber: 1, roundPosition: playable.roundPosition, scoreString: '6-1 6-1', winningSide: 1 },
      ],
    });
    expect(result.success).toEqual(true);
    expect(result.skipped).toEqual([
      { index: 0, reason: 'BYE' },
      { index: 1, reason: 'NOT_FOUND' },
    ]);
    expect(result.appliedMatchUpIds).toEqual([playable.matchUpId]);
  });

  test('refuses outcomes that are not a list', () => {
    const drawId = generate({ drawSize: 4 });
    let result: any = tournamentEngine.applyOutcomes({ drawId, outcomes: { roundNumber: 1 } });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.applyOutcomes({ drawId });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});
