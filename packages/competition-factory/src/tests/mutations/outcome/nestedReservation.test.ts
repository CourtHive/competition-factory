import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { getOutcomePipeline, getProvider, setOutcomePipeline, setStateProvider } from '@Global/state/globalState';
import { inDraftWrites } from '@Global/state/withDraftWrites';
import * as cascade from '@Mutate/matchUps/outcome/plan/recordedCascade';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, vi } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type AddNotice = typeof import('@Global/state/syncGlobalState').addNotice;

type Outcome = { matchUpStatus?: MatchUpStatusUnion; winningSide?: number };
const history: [string, number, number, Outcome][] = [
  ['MAIN', 1, 2, { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['MAIN', 1, 1, { winningSide: 1 }],
  ['MAIN', 2, 1, { matchUpStatus: DOUBLE_WALKOVER }],
  ['CONSOLATION', 1, 1, { matchUpStatus: DOUBLE_WALKOVER }],
];

it.each([
  { seed: 371, size: 16, block: 0 },
  { seed: 9173, size: 32, block: 1 },
])(
  'carries the vacant loser seat through the intersecting BYE on a fresh $size draw (block $block)',
  ({ seed, size, block }) => {
    const pipeline = getOutcomePipeline(),
      provider = getProvider();
    const drawId = 'nested-' + seed;
    const input = {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      seed,
      drawSize: size,
      participantsCount: size,
      propagateExitStatus: false,
    };
    try {
      setOutcomePipeline('v2');
      expect(prepareDraw(input, drawId, { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } })).toBe(true);
      const at = (stage: string, round: number, position: number) => {
        const width = stage === 'MAIN' ? 8 / 2 ** round : round === 3 ? 1 : 2;
        return getDrawMatchUps(drawId).find(
          (m) => m.stage === stage && m.roundNumber === round && m.roundPosition === position + block * width,
        );
      };
      const play = (matchUpId: string, outcome: Outcome) =>
        tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, propagateExitStatus: false });
      for (const [stage, round, position, outcome] of history)
        expect(play(at(stage, round, position).matchUpId, outcome).success).toBe(true);
      const source = at('MAIN', 1, 4),
        loser = at('CONSOLATION', 1, 2);
      const crossing = at('CONSOLATION', 2, 2),
        onward = at('CONSOLATION', 3, 1);
      expect(onward.matchUpStatus).toBe(WALKOVER);
      const nested = vi.spyOn(cascade, 'recordDoubleExitCascade');
      const wholeCall = vi.spyOn(whole, 'recordWholeCall');
      const adds: { draft: boolean; key?: string }[] = [];
      setStateProvider({
        ...provider,
        addNotice(...args: Parameters<AddNotice>) {
          adds.push({ draft: inDraftWrites(), key: args[0].key });
          return (provider.addNotice as AddNotice).apply(provider, args);
        },
      });
      expect(play(source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT }).success).toBe(true);
      expect(nested).not.toHaveBeenCalled();
      expect(wholeCall).not.toHaveBeenCalled();
      expect(adds.filter((n) => n.draft).map((n) => n.key)).toEqual([
        drawId,
        loser.matchUpId,
        drawId,
        crossing.matchUpId,
        drawId,
        crossing.matchUpId,
        drawId,
        onward.matchUpId,
        loser.structureId,
        drawId,
        drawId,
        source.winnerMatchUpId,
      ]);
      expect(adds.filter((n) => !n.draft).map((n) => n.key)).toEqual([
        drawId,
        source.matchUpId,
        drawId,
        source.matchUpId,
      ]);
      const matches = getDrawDefinition(drawId).structures.flatMap(
        (s: { matchUps: { matchUpId: string }[] }) => s.matchUps,
      );
      expect(matches.find((m: { matchUpId: string }) => m.matchUpId === crossing.matchUpId)).toMatchObject({
        matchUpStatus: BYE,
      });
      expect(matches.find((m: { matchUpId: string }) => m.matchUpId === onward.matchUpId)).toMatchObject({
        matchUpStatus: WALKOVER,
        drawPositions: [loser.drawPositions[0]],
      });
    } finally {
      setStateProvider(provider);
      setOutcomePipeline(pipeline);
      vi.restoreAllMocks();
    }
  },
);
