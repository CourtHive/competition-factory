import { carriedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * F9 (`OUTCOME_PIPELINE_OPEN_QUESTIONS.md`), CA 2026-10-07: *"A's Main|2|2 is not a produced exit at all. It's just an
 * advanced participant, advanced by the fact that their previous round opponent DEFAULTED. The provenance
 * `{ previousMatchUpStatus: DEFAULTED }` would be correct, but the matchUpStatus of Main|2|2 should not be seen as an exit
 * awaiting a participant, so the produced exit from Main|1|4 should advance the waiting participant to Main|3. There
 * should be no matchUpStatus on the provenance for A, because nothing was decided when they arrived, they were just
 * waiting."*
 *
 * Census w2 9100389 (DOUBLE_ELIMINATION 8/8), the first nine steps. `Main|1|3` ends DEFAULTED: A wins, B defaulted. B
 * goes down the loser link into the Backdraw carrying the exit, and B's seat records it, `matchUpStatus` and all. A goes
 * up the winner link into `Main|2|2`, and A's seat used to record the SAME entry, byte for byte: an arrival that no
 * reader could tell from a carried exit. It now records the origin alone.
 */
const drawId = 'arrival-records-no-exit-status';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const seat = (m: any, sideNumber: number) => m.sides.find((side: any) => side.sideNumber === sideNumber);

afterEach(() => setOutcomePipeline());

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
}

it('a participant who won a DEFAULTED arrives with the origin recorded and nothing decided', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 9100389,
    drawSize: 8,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|4', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' });
  score('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 });

  const origin = find('Main|1|3');
  const a = seat(origin, 1).participantId;
  const b = seat(origin, 2).participantId;
  expect(a).toBeDefined();
  expect(b).toBeDefined();

  // A arrived at Main|2|2 by winning, and is waiting: no exit is recorded against them
  const next = find('Main|2|2');
  expect(seat(next, 1).participantId).toEqual(a);
  expect(carriedExitStatus(next.sideExitProvenance?.[1])).toBeUndefined();

  // B carried the exit down the loser link: that seat IS exiting, and its entry says so
  const backdraw = getDrawMatchUps(drawId).find(
    (m: any) => m.structureName === 'Backdraw' && m.sides?.some((side: any) => side.participantId === b),
  );
  expect(backdraw).toBeDefined();
  const carrierSide = seat(backdraw, 1).participantId === b ? 1 : 2;
  const carried = backdraw.sideExitProvenance?.[carrierSide];
  expect(carried).toEqual({
    matchUpStatus: DEFAULTED,
    previousMatchUpStatus: DEFAULTED,
    sourceMatchUpId: origin.matchUpId,
  });
  expect(carriedExitStatus(carried)).toEqual(DEFAULTED);

  score('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });

  // Main|1|4's double walkover produces a WALKOVER onto Main|2|2's other side, and the convergence writer records
  // both origins. A's reads as an ARRIVAL: the origin, and nothing decided (CA, 2026-10-07). It used to read
  // `{ matchUpStatus: DEFAULTED, previousMatchUpStatus: DEFAULTED }`, byte for byte B's carried exit below.
  const produced = find('Main|2|2');
  expect(produced.matchUpStatus).toEqual(WALKOVER);
  expect(produced.winningSide).toEqual(1);
  const arrival = produced.sideExitProvenance?.[1];
  expect(arrival).toEqual({ previousMatchUpStatus: DEFAULTED, sourceMatchUpId: origin.matchUpId });
  expect(arrival.matchUpStatus).toBeUndefined();
  expect(carriedExitStatus(arrival)).toBeUndefined();
  expect(produced.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);

  score('Main|1|1', { winningSide: 2 });
  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT });

  // Main|1|4's double default produces a DEFAULTED onto Main|2|2's other side; A, waiting, wins it and goes on
  const decided = find('Main|2|2');
  expect(decided.matchUpStatus).toEqual(DEFAULTED);
  expect(decided.winningSide).toEqual(1);
  expect(seat(decided, 1).participantId).toEqual(a);
  expect(decided.sideExitProvenance?.[1]).toEqual({
    previousMatchUpStatus: DEFAULTED,
    sourceMatchUpId: origin.matchUpId,
  });
  expect(decided.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(find('Main|3|1').sides.some((side: any) => side.participantId === a)).toEqual(true);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(true);
});
