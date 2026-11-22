import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants and types
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

function at(record: Tournament, name: string, round: number, position = 1) {
  const structure = record.events![0].drawDefinitions![0].structures!.find((s) => s.structureName === name)!;
  return matchUpsOf(structure)!.find((m) => m.roundNumber === round && m.roundPosition === position)!;
}

function relabel(returnsToMain: boolean) {
  return prepareCall(() => {
    const drawId = 'foreign-award';
    expect(
      prepareDraw(
        {
          drawType: DOUBLE_ELIMINATION,
          drawSize: 8,
          participantsCount: returnsToMain ? 4 : 6,
          seed: returnsToMain ? 9300887 : 9100555,
          propagateExitStatus: true,
        },
        drawId,
      ),
    ).toBe(true);
    const params = (
      name: string,
      round: number,
      pos: number,
      matchUpStatus: MatchUpStatusUnion,
      winningSide?: number,
    ) => ({
      matchUpId: at(engine.getTournament().tournamentRecord, name, round, pos).matchUpId,
      propagateExitStatus: true,
      drawId,
      outcome: { matchUpStatus, winningSide },
    });
    const enter = (...args: Parameters<typeof params>) =>
      expect(engine.setMatchUpStatus(params(...args)).success).toBe(true);
    if (returnsToMain) {
      enter('Main', 2, 1, COMPLETED, 1);
      enter('Main', 2, 2, DEFAULTED, 1);
      enter('Main', 3, 1, WALKOVER, 1);
      enter('Main', 4, 1, COMPLETED, 1);
      return params('Main', 2, 1, DEFAULTED, 1);
    }
    enter('Main', 1, 2, COMPLETED, 2);
    enter('Main', 1, 3, COMPLETED, 2);
    enter('Main', 2, 2, DOUBLE_DEFAULT);
    enter('Main', 2, 1, DEFAULTED, 1);
    enter('Backdraw', 3, 1, DOUBLE_WALKOVER);
    return params('Main', 1, 3, WALKOVER, 2);
  });
}

it.each([false, true])(
  'preserves a foreign award fixed by an independently played result (returns to Main %s)',
  (returnsToMain) => {
    const call = relabel(returnsToMain);
    const awardRound = returnsToMain ? 3 : 2;
    const earned = (r: Tournament) => (returnsToMain ? at(r, 'Main', 4) : at(r, 'Backdraw', 3));
    expect(earned(call.prepared).matchUpStatus).toBe(returnsToMain ? COMPLETED : DOUBLE_WALKOVER);
    const award = at(call.prepared, 'Backdraw', awardRound);
    expect(award.matchUpStatus).toBe(DEFAULTED);
    const after = compareHeldClaims(call, true);
    expect(at(after, 'Backdraw', awardRound)).toEqual(award);
    expect(earned(after)).toEqual(earned(call.prepared));
    if (returnsToMain) expect(at(after, 'Backdraw', 4)).toEqual(at(call.prepared, 'Backdraw', 4));
  },
);

it.each([false, true])(
  'rederives the first award when its winner has only advanced (returns to Main %s)',
  (returnsToMain) => {
    const call = relabel(returnsToMain);
    const end = returnsToMain ? at(call.prepared, 'Main', 4) : at(call.prepared, 'Backdraw', 3);
    end.matchUpStatus = TO_BE_PLAYED;
    delete end.winningSide;
    delete end.score;
    const after = compareHeldClaims(call, false);
    const award = at(after, 'Backdraw', returnsToMain ? 3 : 2);
    expect(award.matchUpStatus).toBe(returnsToMain ? DOUBLE_DEFAULT : DOUBLE_WALKOVER);
    expect(award.winningSide).toBeUndefined();
  },
);

it.each([false, true])(
  'restores the awarded winner to the next match when their position is missing (%s)',
  (returnsToMain) => {
    const call = relabel(returnsToMain);
    const round = returnsToMain ? 4 : 3;
    const missing = at(call.prepared, 'Backdraw', round);
    missing.drawPositions = [];
    const restored = at(compareHeldClaims(call, false), 'Backdraw', round);
    expect(restored.drawPositions).toEqual(returnsToMain ? [2] : [4, 7]);
    expect(restored.matchUpStatus).toBe(returnsToMain ? WALKOVER : TO_BE_PLAYED);
  },
);
