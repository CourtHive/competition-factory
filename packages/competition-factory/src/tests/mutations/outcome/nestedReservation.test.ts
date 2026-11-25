import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { getOutcomePipeline, getProvider, setOutcomePipeline, setStateProvider } from '@Global/state/globalState';
import { inDraftWrites } from '@Global/state/withDraftWrites';
import * as reservations from '@Mutate/matchUps/outcome/plan/nestedReservation';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
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
  { seed: 371, size: 16, block: 0, status: DOUBLE_WALKOVER, change: 'none' },
  { seed: 9173, size: 32, block: 1, status: DOUBLE_WALKOVER, change: 'none' },
  { seed: 371, size: 16, block: 0, status: DOUBLE_DEFAULT, change: 'none' },
  { seed: 371, size: 16, block: 0, status: DOUBLE_WALKOVER, change: 'stale' },
  { seed: 371, size: 16, block: 0, status: DOUBLE_WALKOVER, change: 'borrowed' },
  { seed: 371, size: 16, block: 0, status: DOUBLE_WALKOVER, change: 'external' },
  { seed: 371, size: 16, block: 0, status: DOUBLE_WALKOVER, change: 'origin' },
] as const)(
  'carries the vacant loser seat through the intersecting BYE on a fresh $size draw (block $block, $change)',
  ({ seed, size, block, status, change }) => {
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
        const consolationWidth = round === 3 ? 1 : 2;
        const width = stage === 'MAIN' ? 8 / 2 ** round : consolationWidth;
        return getDrawMatchUps(drawId).find(
          (m) => m.stage === stage && m.roundNumber === round && m.roundPosition === position + block * width,
        );
      };
      const play = (matchUpId: string, outcome: Outcome) =>
        tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, propagateExitStatus: false });
      if (change === 'origin') {
        expect(play(at('MAIN', 1, 5).matchUpId, { matchUpStatus: DOUBLE_DEFAULT }).success).toBe(true);
        expect(play(at('MAIN', 1, 6).matchUpId, { winningSide: 2 }).success).toBe(true);
        expect(play(at('MAIN', 1, 7).matchUpId, { matchUpStatus: DOUBLE_WALKOVER }).success).toBe(true);
      }
      for (const [stage, round, position, outcome] of history)
        expect(
          play(at(stage, round, position).matchUpId, stage === 'CONSOLATION' ? { matchUpStatus: status } : outcome)
            .success,
        ).toBe(true);
      const source = at('MAIN', 1, 4),
        loser = at('CONSOLATION', 1, 2);
      const crossing = at('CONSOLATION', 2, 2),
        onward = at('CONSOLATION', 3, 1);
      expect(onward.matchUpStatus).toBe(status === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER);
      let onStamp: (() => void) | undefined;
      let changedId: string | undefined;
      const prepare = reservations.nestedReservationSuffix;
      vi.spyOn(reservations, 'nestedReservationSuffix').mockImplementation((args, view, prefix) => {
        const run = prepare(args, view, prefix);
        if (!run || change === 'none') return run;
        const draw = args.drawDefinition!;
        const main = draw.structures!.find((s) => s.stage === 'MAIN')!;
        const consolation = draw.structures!.find((s) => s.stage === 'CONSOLATION')!;
        if (change === 'stale') {
          const elsewhere = matchUpsOf(main)!.find((m) => m.roundNumber === 1 && m.roundPosition === 8)!;
          elsewhere.schedule = { scoredTime: '2026-11-08T11:00:00.000Z' };
          changedId = elsewhere.matchUpId;
        } else if (change === 'external') {
          const matchUp = matchUpsOf(consolation)!.find((m) => m.matchUpId === loser.matchUpId)!;
          Object.assign(args.tournamentRecord!, { relatedMatch: matchUp });
          changedId = matchUp.matchUpId;
        } else if (change === 'origin') {
          const elsewhere = matchUpsOf(main)!.find((m) => m.roundNumber === 1 && m.roundPosition === 7)!;
          elsewhere.matchUpStatus = 'TO_BE_PLAYED';
          delete elsewhere.schedule;
          changedId = elsewhere.matchUpId;
        } else {
          onStamp = () => {
            const target = positionAssignmentsOf(consolation)!.find((a) => a.drawPosition === loser.drawPositions[0])!;
            target.participantId = positionAssignmentsOf(main)!.find((a) => a.participantId)!.participantId;
            changedId = source.matchUpId;
          };
        }
        return run;
      });
      const preparedFallback = vi.spyOn(cascade, 'recordPreparedCascade');
      const nested = vi.spyOn(cascade, 'recordDoubleExitCascade');
      const wholeCall = vi.spyOn(whole, 'recordWholeCall');
      const adds: { draft: boolean; key?: string }[] = [];
      setStateProvider({
        ...provider,
        getCapturedStamps() {
          const changeRecord = onStamp;
          onStamp = undefined;
          changeRecord?.();
          return provider.getCapturedStamps?.();
        },
        addNotice(...args: Parameters<AddNotice>) {
          adds.push({ draft: inDraftWrites(), key: args[0].key });
          return (provider.addNotice as AddNotice).apply(provider, args);
        },
      });
      expect(play(source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT }).success).toBe(true);
      if (change !== 'none') {
        expect(changedId).toBeDefined();
        expect(preparedFallback).toHaveBeenCalledOnce();
        if (change === 'stale') expect(adds.some((n) => n.draft && n.key === changedId)).toBe(true);
        return;
      }
      if (status === DOUBLE_DEFAULT) {
        expect(nested).toHaveBeenCalledOnce();
        return;
      }
      expect(preparedFallback).not.toHaveBeenCalled();
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

it('awards the pending default to an arriving participant and places both winners', () => {
  const pipeline = getOutcomePipeline(),
    drawId = 'occupied-crossing';
  try {
    setOutcomePipeline('v2');
    expect(
      prepareDraw(
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          seed: 371,
          drawSize: 16,
          participantsCount: 15,
          propagateExitStatus: true,
        },
        drawId,
        { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
      ),
    ).toBe(true);
    const at = (stage: string, round: number, position: number) =>
      getDrawMatchUps(drawId).find((m) => m.stage === stage && m.roundNumber === round && m.roundPosition === position);
    const play = (position: number, outcome: Outcome) =>
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId: at('MAIN', 1, position).matchUpId,
        outcome,
        propagateExitStatus: true,
      });
    expect(at('MAIN', 1, 1).matchUpStatus).toBe(BYE);
    expect(play(2, { matchUpStatus: DOUBLE_DEFAULT }).success).toBe(true);
    expect(play(3, { winningSide: 1 }).success).toBe(true);
    const advancing = at('CONSOLATION', 1, 2).drawPositions[0],
      mainPosition = at('MAIN', 2, 2).drawPositions[0];
    expect(at('CONSOLATION', 3, 1).matchUpStatus).toBe(DEFAULTED);
    const nested = vi.spyOn(cascade, 'recordDoubleExitCascade'),
      wholeCall = vi.spyOn(whole, 'recordWholeCall');
    expect(play(4, { matchUpStatus: DOUBLE_DEFAULT }).success).toBe(true);
    expect(nested).not.toHaveBeenCalled();
    expect(wholeCall).not.toHaveBeenCalled();
    expect(at('CONSOLATION', 3, 1).winningSide).toBe(2);
    expect(at('CONSOLATION', 4, 1).drawPositions).toEqual([advancing]);
    expect(at('MAIN', 3, 1).drawPositions).toContain(mainPosition);
  } finally {
    setOutcomePipeline(pipeline);
    vi.restoreAllMocks();
  }
});
