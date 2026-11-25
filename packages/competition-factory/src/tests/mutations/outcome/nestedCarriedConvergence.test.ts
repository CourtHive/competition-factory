import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import * as nested from '@Mutate/matchUps/outcome/plan/nestedCarriedConvergence';
import * as cascade from '@Mutate/matchUps/outcome/plan/recordedCascade';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, vi } from 'vitest';

import { FIRST_ROUND_LOSER_CONSOLATION, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

it.each([
  { seed: 371, pairedStatus: DEFAULTED },
  { seed: 9173, pairedStatus: DEFAULTED },
  { seed: 371, pairedStatus: WALKOVER },
] as const)(
  'checks the carried exit from a $pairedStatus on the paired source (seed $seed)',
  ({ seed, pairedStatus }) => {
    const saved = getOutcomePipeline(),
      drawId = 'carried-' + seed;
    try {
      setOutcomePipeline('v2');
      expect(
        prepareDraw(
          {
            drawType: FIRST_ROUND_LOSER_CONSOLATION,
            seed,
            drawSize: 8,
            participantsCount: 7,
            propagateExitStatus: true,
          },
          drawId,
          { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
        ),
      ).toBe(true);
      const at = (stage: string, round: number, position: number) =>
        getDrawMatchUps(drawId).find(
          (m) => m.stage === stage && m.roundNumber === round && m.roundPosition === position,
        );
      const play = (position: number, matchUpStatus: MatchUpStatusUnion, winningSide?: number) =>
        tournamentEngine.setMatchUpStatus({
          matchUpId: at(MAIN, 1, position).matchUpId,
          drawId,
          propagateExitStatus: true,
          outcome: { matchUpStatus, winningSide },
        });
      expect(at(MAIN, 1, 1).matchUpStatus).toBe(BYE);
      expect(play(2, WALKOVER, 2).success).toBe(true);
      expect(play(3, pairedStatus, 1).success).toBe(true);
      expect(at(CONSOLATION, 1, 2).matchUpStatus).toBe(pairedStatus);
      expect(at(CONSOLATION, 2, 1).matchUpStatus).toBe(WALKOVER);
      const suffix = vi.spyOn(nested, 'nestedCarriedConvergence');
      const recorder = vi.spyOn(cascade, 'recordDoubleExitCascade'),
        wholeCall = vi.spyOn(whole, 'recordWholeCall');
      expect(play(4, DOUBLE_WALKOVER).success).toBe(true);
      const admitted = suffix.mock.results.some((row) => typeof row.value === 'function');
      expect(admitted).toBe(pairedStatus === DEFAULTED);
      if (!admitted) {
        expect(recorder).toHaveBeenCalledOnce();
        return;
      }
      expect(recorder).not.toHaveBeenCalled();
      expect(wholeCall).not.toHaveBeenCalled();
      expect(at(CONSOLATION, 1, 2).matchUpStatus).toBe(DOUBLE_WALKOVER);
      expect(at(CONSOLATION, 2, 1).matchUpStatus).toBe(DOUBLE_WALKOVER);
      expect(at(MAIN, 2, 2).winningSide).toBe(1);
      expect(at(MAIN, 3, 1).drawPositions).toEqual(at(MAIN, 2, 2).drawPositions);
    } finally {
      setOutcomePipeline(saved);
      vi.restoreAllMocks();
    }
  },
);
