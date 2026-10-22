import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';

/**
 * A WINNER DIRECTED ACROSS A LINK IS SEATED ONCE — `directWinnerViaLink`.
 *
 * It dropped the results of its two `assignDrawPosition` placements. Measured 2026-10-22 on factory `dev` `01ce40e544`,
 * with a probe on each dropped result, over the full suite and the frozen census windows w1 and w2 (both BYE arms) and
 * de (default and `doubleExitPropagateBye: false`): they refused twice, both
 * `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`, both a DOUBLE_ELIMINATION Decider whose side-1 seat ALREADY held
 * the winner being directed, seated there earlier in the same call across the same link. The second direction reached
 * for the other, empty seat, and `assignDrawPosition` refused to seat one participant twice. The stored draw was right;
 * the attempt was redundant.
 *
 * - census de 9304558, `doubleExitPropagateBye: false`: by the ordinary direction
 *   (`directWinner → assignMatchUpDrawPosition → advanceDrawPosition → advanceIntoWinnerMatchUp → directWinner`),
 *   re-scoring `Main|2|2` from a walkover to a played result for the same winner;
 * - census F2 20477784 (`censusF2RefusalRegression20261011`): by a double exit's crossing
 *   (`doubleExitAdvancement → … → directExitWinnerAcrossLink → directWinner`).
 *
 * A winner already seated in the target matchUp is now left where they are, and nothing is attempted.
 *
 * ## Why the other failures are not returned
 *
 * A direction runs after the call has written the source matchUp's result, and nothing in the cascade restores it: a
 * refusal from here would leave that write behind, and an error must change nothing with no rollback by the caller
 * (CA, 2026-10-22). So a placement that fails, and a winner with no position to take, are logged and not returned. For
 * the Decider, `reconcileDeciders` seats it from the final that stands later in the same call; the last two cases pin
 * that, the second by fault injection (no placement failure other than the seated case is reached in play).
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

it('a Decider whose seats are held by others is re-seated from the final, and the call succeeds', () => {
  const { drawId, record } = mainFinalToPlay();
  deciderHeldBy(drawId, record, ['Inigo Batty', 'Joe Jovovich']);
  // `directWinnerViaLink` finds no position for Marie (every seat held, she holds none); it does not refuse after the
  // result is written, and `reconcileDeciders` seats the Decider from the final that stands, as on `dev`
  let result: any = apply(drawId, 'Main|4|1', { winningSide: 2 });
  expect(result.success).toEqual(true);
  expect(names(find(drawId, 'Decider|1|1'))).toEqual(['Marie Ogden', 'Joe Jovovich']);
});

it('a placement across the link that fails is not returned as a refusal over the written result', () => {
  const { drawId } = mainFinalToPlay();
  watch.force = true;
  let result: any = apply(drawId, 'Main|4|1', { winningSide: 2 });
  // CONTROL: the winner's placement across the link was made, and failed
  expect(watch.forced).toBeGreaterThan(0);
  expect(result.success).toEqual(true);
  expect(names(find(drawId, 'Decider|1|1'))).toEqual(['Marie Ogden', 'Joe Jovovich']);
});
