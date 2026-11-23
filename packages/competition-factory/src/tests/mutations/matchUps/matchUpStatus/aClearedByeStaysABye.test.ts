import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A CLEARED BYE STAYS A BYE (CA, 2026-10-24: "a TO_BE_PLAYED matchUp with a BYE side should never occur"; punch-list
 * P26).
 *
 * A BYE has no result to clear. Clearing one (`TO_BE_PLAYED`, an empty score) was accepted and wrote `TO_BE_PLAYED`
 * against nobody: re-witnessed on 2026-10-24 over sched-w1, both arms, on four seeds, every one this clear. Now the
 * call succeeds and changes nothing (v1's dispatch and v2's `noop` route both ask `clearsABye`), and a schedule it
 * carries is still applied. The harness invariant `TO_BE_PLAYED_BESIDE_BYE` polices the shape at every census step.
 */
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const record = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

function firstRoundBye() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  const bye = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.matchUpStatus === BYE);
  // CONTROL: the draw has a first-round BYE, with a participant beside it who has advanced
  expect(bye).toBeDefined();
  expect(bye.sides.some((side: any) => side.bye)).toEqual(true);
  return bye;
}

const stored = (matchUpId: string) => tournamentEngine.findMatchUp({ drawId: 'd', matchUpId }).matchUp;

describe('a clear of a BYE matchUp', () => {
  it('succeeds and changes nothing', () => {
    const bye = firstRoundBye();
    const before = record();
    const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: bye.matchUpId, outcome: CLEAR });
    expect(result.success).toEqual(true);
    expect(stored(bye.matchUpId).matchUpStatus).toEqual(BYE);
    expect(record()).toEqual(before);
  });

  it('still applies the schedule it carries', () => {
    const bye = firstRoundBye();
    // a date within the tournament: mocksEngine dates it from today, so a literal date is refused once it has passed
    const { startDate } = tournamentEngine.getTournament().tournamentRecord;
    const result: any = tournamentEngine.setMatchUpStatus({
      schedule: { scheduledDate: startDate },
      matchUpId: bye.matchUpId,
      outcome: CLEAR,
      drawId: 'd',
    });
    expect(result.success).toEqual(true);
    expect(stored(bye.matchUpId).matchUpStatus).toEqual(BYE);
    const { matchUp } = tournamentEngine.findMatchUp({ drawId: 'd', matchUpId: bye.matchUpId, inContext: true });
    expect(matchUp.schedule?.scheduledDate).toEqual(startDate);
  });

  /**
   * The census case, sched-w1 9000593 (FEED_IN_CHAMPIONSHIP 8/4, `propagateExitStatus`): fourteen steps leave
   * `Consolation|4|1` a BYE, and the fifteenth clears it.
   */
  it('leaves the census case a BYE (sched-w1 9000593)', () => {
    const steps: [string, number, number, any][] = [
      ['Main', 2, 2, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main', 2, 2, { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main', 2, 2, { winningSide: 2 }],
      ['Main', 2, 2, { winningSide: 1 }],
      ['Main', 2, 2, { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main', 2, 2, { winningSide: 1 }],
      ['Main', 2, 2, { winningSide: 2 }],
      ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main', 2, 2, { matchUpStatus: DOUBLE_WALKOVER }],
      ['Consolation', 3, 1, { winningSide: 1 }],
      ['Main', 2, 1, CLEAR],
      ['Main', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Main', 2, 1, { winningSide: 1 }],
      ['Consolation', 3, 1, { winningSide: 2 }],
    ];
    const config = { participantsCount: 4, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, seed: 9000593 };
    setSubscriptions({});
    expect(prepareDraw(config as any, 'w1-9000593')).toEqual(true);
    for (const [structureName, roundNumber, roundPosition, outcome] of steps) {
      const target = getDrawMatchUps('w1-9000593').find(
        (matchUp: any) => key(matchUp) === key({ structureName, roundNumber, roundPosition }),
      );
      if (target)
        observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId: 'w1-9000593' });
    }
    const consolationFinal = () =>
      getDrawMatchUps('w1-9000593').find((matchUp: any) => key(matchUp) === 'Consolation|4|1');
    // CONTROL: the replay reached the state the census did, a BYE beside a participant
    expect(consolationFinal().matchUpStatus).toEqual(BYE);

    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: consolationFinal().matchUpId,
      drawId: 'w1-9000593',
      outcome: CLEAR,
    });
    expect(result.success).toEqual(true);
    expect(consolationFinal().matchUpStatus).toEqual(BYE);
  });
});
