import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  DRAW_POSITION_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * A WINNER DIRECTED ACROSS A LINK IS PLACED, OR THE CALL REFUSES — `directWinnerViaLink`.
 *
 * It dropped every result but one: the two `assignDrawPosition` placements of the winner into the target structure,
 * and the error it built when there was no position for the winner at all. Each could leave the winner unplaced while
 * the call reported success.
 *
 * ## What the play reaches: one case, and it is benign
 *
 * Measured 2026-10-22 on factory `dev` `01ce40e544`, with a probe on each dropped result, over the full suite and the
 * frozen census windows w1 and w2 (both BYE arms) and de (default and `doubleExitPropagateBye: false`): the placements
 * returned an error twice, both `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`, both a DOUBLE_ELIMINATION Decider
 * whose side-1 seat ALREADY held the winner being directed, seated there earlier in the same call across the same
 * link. The second direction then reached for the other, empty seat, and `assignDrawPosition` refused to seat one
 * participant twice. The stored draw was right, because the refusal stopped the double seat; the error was dropped.
 *
 * - census de 9304558, `doubleExitPropagateBye: false`: by the ordinary direction
 *   (`directWinner → assignMatchUpDrawPosition → advanceDrawPosition → advanceIntoWinnerMatchUp → directWinner`),
 *   re-scoring `Main|2|2` from a walkover to a played result for the same winner;
 * - census F2 20477784 (`censusF2RefusalRegression20261011`): by a double exit's crossing
 *   (`doubleExitAdvancement → … → directExitWinnerAcrossLink → directWinner`).
 *
 * Such a winner is now recognised as placed and nothing is attempted; any other refusal is the call's result. The
 * "no position" error was never reached; it is pinned by a constructed state, and the placements' propagation by
 * fault injection. Under `rollbackOnError` a refused call changes nothing (CA, 2026-10-18).
 */

const FORCED_ERROR = { code: 'ERR_FORCED', message: 'forced by the test' };
const watch = vi.hoisted(() => ({
  force: false,
  forced: 0,
  /** refusals of a winner's placement across a link, whether or not anything returned them */
  duplicateRefusals: 0,
  /** the frame below `assignDrawPosition` is `directWinnerViaLink`: the placement of a winner across a link */
  placingWinner: (): boolean => {
    const frames = (new Error().stack ?? '').split('\n').map((line) => line.trim());
    const index = frames.findIndex((frame) => frame.startsWith('at assignDrawPosition '));
    return index >= 0 && !!frames[index + 1]?.startsWith('at directWinnerViaLink ');
  },
}));

// the first fallible call `assignDrawPosition` makes; forced only for a winner's placement across a link
vi.mock('@Acquire/findStructure', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    findStructure: (params: any) => {
      if (watch.force && watch.placingWinner()) {
        watch.forced += 1;
        return { error: FORCED_ERROR };
      }
      return actual.findStructure(params);
    },
  };
});

vi.mock('@Functions/global/decorateResult', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    decorateResult: (params: any) => {
      if (params?.result?.error?.code === EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT.code && watch.placingWinner())
        watch.duplicateRefusals += 1;
      return actual.decorateResult(params);
    },
  };
});

afterEach(() => {
  watch.force = false;
  watch.forced = 0;
  watch.duplicateRefusals = 0;
});

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const drawMatchUps = (drawId: string): any[] =>
  tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
const find = (drawId: string, key: string) => drawMatchUps(drawId).find((matchUp) => coordinate(matchUp) === key);
const names = (matchUp: any) => matchUp.sides.map((side: any) => side.participant?.participantName);
const apply = (drawId: string, key: string, outcome: any) =>
  tournamentEngine.setMatchUpStatus({
    matchUpId: find(drawId, key).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
const assignments = (drawId: string, structureName: string): any[] =>
  tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((structure: any) => structure.structureName === structureName).positionAssignments;

type Step = [string, any];
const replayed = (drawId: string, seed: number, participantsCount: number, steps: Step[]) => {
  setSubscriptions({});
  const config = { drawType: DOUBLE_ELIMINATION, propagateExitStatus: true, drawSize: 8, participantsCount, seed };
  expect(prepareDraw(config as any, drawId, POLICY_OFF)).toEqual(true);
  for (const [key, outcome] of steps) expect(apply(drawId, key, outcome).success).toEqual(true);
};

it('census de 9304558: a winner already seated in the Decider is not seated again', () => {
  const drawId = 'census-de-9304558';
  const retired = { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' };
  replayed(drawId, 9304558, 4, [
    ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|1', { winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: RETIRED, winningSide: 1, score: retired }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  // the Main final was decided by the exit, and its winner went on to the Decider
  expect(names(find(drawId, 'Decider|1|1'))).toEqual(['Leeloo Pendejo', undefined]);

  // the same winner of `Main|2|2`, now by a played result: the Backdraw's finalist comes back to the Main final
  let result: any = apply(drawId, 'Main|2|2', { winningSide: 2 });
  expect(result.success).toEqual(true);
  // the redundant placement in the Decider is no longer attempted; on `dev` it was, and refused (1)
  expect(watch.duplicateRefusals).toEqual(0);

  expect(names(find(drawId, 'Main|4|1'))).toEqual(['Lizzie Deckard', 'Leeloo Pendejo']);
  expect(find(drawId, 'Main|4|1').winningSide).toBeUndefined();
  expect(names(find(drawId, 'Decider|1|1'))).toEqual([undefined, undefined]);
  expect(assignments(drawId, 'Decider').filter((assignment) => assignment.participantId)).toEqual([]);
});

it('census F2 20477784: a double exit crossing to a winner already seated in the Decider is not seated again', () => {
  const drawId = 'census-f2-20477784';
  const cleared = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' };
  replayed(drawId, 20477784, 4, [
    ['Main|2|1', cleared],
    ['Main|2|1', cleared],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);

  let result: any = apply(drawId, 'Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 });
  expect(result.success).toEqual(true);
  // on `dev` the crossing reached for the Decider's empty seat and was refused (1)
  expect(watch.duplicateRefusals).toEqual(0);

  // seated once, in the seat the Main final's winner takes
  expect(names(find(drawId, 'Main|4|1'))).toEqual([undefined, 'Valentina Rodda']);
  expect(names(find(drawId, 'Decider|1|1'))).toEqual(['Valentina Rodda', undefined]);
});

/** a DOUBLE_ELIMINATION 8 played to its Main final: Joe Jovovich (Main) against Marie Ogden (Backdraw) */
function mainFinalToPlay(): { drawId: string; record: any } {
  setSubscriptions({});
  const drawId = 'de-final';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 8 }],
    nonRandom: 7001,
    setState: true,
  });
  const bracket = ['Main|1|1', 'Main|1|2', 'Main|1|3', 'Main|1|4', 'Main|2|1', 'Main|2|2', 'Main|3|1'];
  const backdraw = ['Backdraw|1|1', 'Backdraw|1|2', 'Backdraw|2|1', 'Backdraw|2|2', 'Backdraw|3|1', 'Backdraw|4|1'];
  for (const key of [...bracket, ...backdraw]) expect(apply(drawId, key, { winningSide: 1 }).success).toEqual(true);
  expect(names(find(drawId, 'Main|4|1'))).toEqual(['Joe Jovovich', 'Marie Ogden']);
  return { drawId, record: recordNow() };
}

/** seat the Decider by hand with participants of the draw who are not the Main final's, as a stale record might */
function deciderHeldBy(drawId: string, record: any, holders: string[]) {
  const participants = tournamentEngine.getParticipants().participants;
  const idOf = (name: string) =>
    participants.find((participant: any) => participant.participantName === name).participantId;
  const drawDefinition = record.events[0].drawDefinitions.find((definition: any) => definition.drawId === drawId);
  const decider = drawDefinition.structures.find((structure: any) => structure.structureName === 'Decider');
  holders.forEach((name, index) => (decider.positionAssignments[index].participantId = idOf(name)));
  tournamentEngine.setState(record);
}

it('the Main final winner is seated in the Decider, and a placement that fails is the call result', () => {
  let { drawId } = mainFinalToPlay();
  // CONTROL: unforced, Marie is placed in the Decider by `directWinnerViaLink`
  let result: any = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(result.success).toEqual(true);
  expect(names(find(drawId, 'Decider|1|1'))).toContain('Marie Ogden');

  ({ drawId } = mainFinalToPlay());
  watch.force = true;
  result = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(watch.forced).toEqual(1);
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(FORCED_ERROR);
});

it('a winner placed in the Decider seat left open beside a stale holder: a failed placement is the call result', () => {
  let { drawId, record } = mainFinalToPlay();
  deciderHeldBy(drawId, record, ['Inigo Batty']);
  // CONTROL: unforced, the winner takes the open seat; the loser then finds none, and `directLoser` already says so
  let result: any = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(result.error?.code).toEqual('ERR_OCCUPIED_DRAW_POSITION');
  expect(result.stack[0]).toEqual('directLoser');
  expect(assignments(drawId, 'Decider').map((assignment) => assignment.participantId)).toContain(
    find(drawId, 'Main|4|1').sides[1].participantId,
  );

  ({ drawId, record } = mainFinalToPlay());
  deciderHeldBy(drawId, record, ['Inigo Batty']);
  watch.force = true;
  result = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(watch.forced).toEqual(1);
  expect(result.error).toEqual(FORCED_ERROR);
});

/**
 * Every seat of the Decider held, and not by the winner: there is nowhere to place them. On `dev` the error was built
 * and dropped, `directWinner` reported success with the winner unplaced, and only the Decider's own reconciliation,
 * later in the call, put the winner over the stale holder. A direction that cannot place its winner now says so.
 */
it('a winner with no position to take refuses the call', () => {
  const { drawId, record } = mainFinalToPlay();
  deciderHeldBy(drawId, record, ['Inigo Batty', 'Joe Jovovich']);
  let result: any = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(DRAW_POSITION_NOT_FOUND);
  expect(result.info).toEqual('winner target position unavailable');
  expect(result.stack[0]).toEqual('directWinner');
});

it('under rollbackOnError a refused direction across a link changes nothing', () => {
  const { drawId, record } = mainFinalToPlay();
  deciderHeldBy(drawId, record, ['Inigo Batty', 'Joe Jovovich']);
  const before = recordNow();
  const matchUpId = find(drawId, 'Main|4|1').matchUpId;
  let result: any = tournamentEngine.executionQueue(
    [
      {
        method: 'setMatchUpStatus',
        params: { propagateExitStatus: true, outcome: { winningSide: 2 }, matchUpId, drawId },
      },
    ],
    true,
  );
  expect(result.error).toEqual(DRAW_POSITION_NOT_FOUND);
  expect(recordNow()).toEqual(before);

  // and the same under a forced placement failure
  const fresh = mainFinalToPlay();
  const freshBefore = recordNow();
  watch.force = true;
  result = tournamentEngine.executionQueue(
    [
      {
        params: {
          propagateExitStatus: true,
          outcome: { winningSide: 2 },
          matchUpId: find(fresh.drawId, 'Main|4|1').matchUpId,
          drawId: fresh.drawId,
        },
        method: 'setMatchUpStatus',
      },
    ],
    true,
  );
  expect(watch.forced).toEqual(1);
  expect(result.error).toEqual(FORCED_ERROR);
  expect(recordNow()).toEqual(freshBefore);
});
