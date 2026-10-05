import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A loser carrying an exit past a BYE converges with a PENDING produced exit standing on the side nobody has
 * reached, and the differential reads that exit from the side's provenance by NUMBER.
 *
 * The early-exit census arm (`exitBeforeArrivalCensus`), COMPASS 32/27 seed 9700103, shrunk from 30 steps to 7.
 * `West|2|1` and `West|2|2` both lose by default, so `Southwest|1|1` is a DOUBLE_DEFAULT and the DEFAULTED it
 * produces stands pending on side 1 of `Southwest|2|1` (no winningSide while side 2 is unreached: CA, 2026-09-20).
 * Then a WALKOVER is recorded at `West|2|4` before its second opponent arrives: the participant there loses it,
 * carries the WALKOVER into `Southwest|1|2`, passes the BYE (RULE 1) and reaches `Southwest|2|1`. A walkover
 * meeting a default converges to a DOUBLE_WALKOVER (exit-propagation.md, "any other combination, including a
 * default meeting a walkover"), and nobody wins it. v1 writes exactly that.
 *
 * The differential diverged instead (reported by factory-e2, 2026-10-04): it found the side opposite the arrival
 * through the in-context `sides`, and a side nobody has reached hydrates as `{}` with no `sideNumber`, so it saw
 * no standing exit and expected a WALKOVER won by side 1, the empty side. The produced exit holds no drawPosition
 * there; only `sideExitProvenance[1]` says it stands.
 */
const drawId = 'carried-past-bye-meets-pending';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

const STEPS: [string, any][] = [
  ['East|1|10', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['East|1|9', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['East|1|8', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['East|1|2', { winningSide: 1 }],
  ['East|1|15', { winningSide: 2 }],
  ['West|2|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
];

afterEach(() => setOutcomePipeline());

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL])(
  'under %s: a walkover carried past a BYE converges with a pending produced default on the unreached side',
  (mode) => {
    setOutcomePipeline(mode);
    setSubscriptions({});
    const config = { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: COMPASS, seed: 9700103 };
    expect(prepareDraw(config as any, drawId)).toEqual(true);

    for (const [k, outcome] of STEPS) {
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: find(k).matchUpId,
        propagateExitStatus: true,
        outcome,
        drawId,
      });
      expect(result.error, k).toBeUndefined();
    }

    // CONTROL: the pending produced default stands on side 1, which holds no drawPosition and hydrates empty
    const pending = find('Southwest|2|1');
    expect(find('Southwest|1|1').matchUpStatus).toEqual(DOUBLE_DEFAULT);
    expect(pending.matchUpStatus).toEqual(DEFAULTED);
    expect(pending.winningSide).toBeUndefined();
    expect(pending.sideExitProvenance?.[1]).toMatchObject({
      previousMatchUpStatus: DOUBLE_DEFAULT,
      matchUpStatus: DEFAULTED,
    });
    expect(pending.sides.find((side: any) => side.sideNumber === 1)).toBeUndefined();

    const recorded = find('West|2|4');
    const loser = recorded.sides.find((side: any) => side.participantId);
    expect(loser.sideNumber).toEqual(2);

    resetDifferentialTally();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      matchUpId: recorded.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.error).toBeUndefined();

    expect(find('Southwest|1|2').sides.map((side: any) => side.participantId)).toContain(loser.participantId);
    const onward = find('Southwest|2|1');
    expect(onward.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(onward.winningSide).toBeUndefined();
    expect(onward.sides.find((side: any) => side.sideNumber === 2)?.participantId).toEqual(loser.participantId);
    expect(onward.sideExitProvenance?.[1]?.matchUpStatus).toEqual(DEFAULTED);
    expect(onward.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);
    expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);

    // the differential compared the convergence rather than passing it by
    const tally = getDifferentialTally()['winner:loser-exit-past-bye-converged'];
    if (mode === OUTCOME_PIPELINE_DIFFERENTIAL) expect(tally?.compared).toEqual(1);
    else expect(tally).toBeUndefined();
  },
);
