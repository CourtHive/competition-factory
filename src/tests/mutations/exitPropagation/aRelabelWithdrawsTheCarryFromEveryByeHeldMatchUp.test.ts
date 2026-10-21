import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A RELABEL WITHDRAWS THE CARRY FROM EVERY BYE-HELD MATCHUP IT REACHED (census S8 off arm, FEED_IN_CHAMPIONSHIP 8/6
 * 20576342 and 16/11 20544709, both STALLED_POSITION in the Consolation).
 *
 * A loser carrying a walkover into the Consolation is carried past each BYE that arrives in front of them, and the
 * carry is written on every matchUp they pass ("a carry written past a late BYE names the exit's origin"). When BYEs
 * claim two consecutive rounds, the carry stands recorded on TWO BYE-held matchUps. Relabelling the origin as a played
 * result withdraws the carry (the 2026-10-02 relabel rule), but the BYE-held search (census 20030075) returned only the
 * first such matchUp; the entry left on the second still named the origin. In 8/6 that stale entry later met another
 * loser's own carry and converged into a double walkover nobody could have produced; in 16/11 the settle relayed it
 * back onto the matchUp the withdrawal had just cleared. Either way the Consolation stalled once the second exit was
 * relabelled as played. The stale entries were wiped or ignored by accident until #5403 ("a clear takes back only
 * the side it cleared" kept the held side's entry) and #5455 ("a relabel into an exit takes back an award over a
 * carried exit" took back the award the stale entry had given) made them count.
 *
 * Every BYE-held matchUp holding this origin's carry on the loser's side is cleared; the draw then equals the one the
 * same final results, entered directly, reach.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const toSteps = (steps: Step[]) =>
  steps.map(([key, outcome]) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  });

function play(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }
  return getDrawMatchUps(drawId);
}

const byCoordinate = (matchUps: any[]) =>
  Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );

const stalls = (drawId: string) =>
  (getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );

// matchUps still recording a carried exit from `origin`
const carriesFrom = (matchUps: any[], origin: string) => {
  const originId = matchUps.find((matchUp: any) => coordinate(matchUp) === origin)?.matchUpId;
  return matchUps
    .filter((matchUp: any) =>
      Object.values(matchUp.sideExitProvenance ?? {}).some(
        (entry: any) => entry?.sourceMatchUpId === originId && entry?.matchUpStatus,
      ),
    )
    .map(coordinate);
};

const cases = [
  {
    name: 'FEED_IN_CHAMPIONSHIP 8/6 (20576342)',
    config: {
      drawType: FEED_IN_CHAMPIONSHIP,
      propagateExitStatus: true,
      participantsCount: 6,
      drawSize: 8,
      seed: 20576342,
    },
    origin: 'Main|1|3',
    throughRelabel: 4,
    schedule: [
      ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|3', { winningSide: 2 }],
      ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|2', { winningSide: 1 }],
      ['Main|3|1', { winningSide: 2 }],
    ] as Step[],
    // the same final results entered directly: each corrected matchUp entered once, as it finally stands
    direct: [
      ['Main|1|3', { winningSide: 2 }],
      ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|2|2', { winningSide: 1 }],
      ['Main|3|1', { winningSide: 2 }],
    ] as Step[],
  },
  {
    name: 'FEED_IN_CHAMPIONSHIP 16/11 (20544709)',
    config: {
      drawType: FEED_IN_CHAMPIONSHIP,
      propagateExitStatus: true,
      participantsCount: 11,
      drawSize: 16,
      seed: 20544709,
    },
    origin: 'Main|1|2',
    throughRelabel: 6,
    schedule: [
      ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|3', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|2', { winningSide: 1 }],
      ['Main|2|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|2|3', { winningSide: 2 }],
      ['Main|3|1', { winningSide: 2 }],
      ['Main|3|2', { winningSide: 1 }],
      ['Main|4|1', { winningSide: 1 }],
    ] as Step[],
    direct: [
      ['Main|1|2', { winningSide: 1 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|2|3', { winningSide: 2 }],
      ['Main|3|1', { winningSide: 2 }],
      ['Main|3|2', { winningSide: 1 }],
      ['Main|4|1', { winningSide: 1 }],
    ] as Step[],
  },
];

describe.each(cases)('$name', ({ config, origin, throughRelabel, schedule, direct }) => {
  it('relabelling the origin as played leaves its carry recorded nowhere', () => {
    const before = play(config, schedule.slice(0, throughRelabel - 1), 'every-bye-held-before');
    // the carry stands on more than one matchUp before the relabel: the shape this rule is about
    expect(carriesFrom(before, origin).length).toBeGreaterThan(1);
    const after = play(config, schedule.slice(0, throughRelabel), 'every-bye-held-after');
    expect(carriesFrom(after, origin)).toEqual([]);
  });

  it('the corrected draw stalls nowhere and equals the draw the results entered directly reach', () => {
    const viaCorrection = play(config, schedule, 'every-bye-held-corrected');
    expect(stalls('every-bye-held-corrected')).toEqual([]);
    const directly = play(config, direct, 'every-bye-held-direct');
    expect(byCoordinate(viaCorrection)).toEqual(byCoordinate(directly));
  });

  it('the schedule replays clean', () => {
    setSubscriptions({});
    expect(replay(config, toSteps(schedule), 'every-bye-held-replay')).toBeNull();
  });
});
