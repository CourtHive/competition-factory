import { checkIntegrity, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { CLEAR_SCORE, EXIT, SCORE } from '@Constants/matchUpActionConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * **A WALKOVER or DEFAULTED can be recorded before the second opponent arrives** (CA, 2026-10-04).
 *
 * A participant has advanced and the other has not yet arrived; in between, the present participant falls
 * ill, is injured, or is defaulted for conduct. USTA's own codes contemplate it (*Friend at Court* Table
 * 10D: "Misconduct before or between matches — Def [cond]"; "the Referee need not wait until the scheduled
 * time of the match to record the result"). The EMPTY side is awarded the matchUp; whoever arrives there
 * takes the walkover and advances; the present participant is directed onward as any loser is.
 *
 * And *"propagateExitStatus shouldn't have anything to do with this ability"*: the entry was accepted only
 * with the flag on. The flag still decides whether the exit is CARRIED into the loser's next matchUp —
 * nothing else.
 */
const drawId = 'early-exit';
const all = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const inconsistencies = () =>
  getDrawInconsistencies({ drawDefinition: tournamentEngine.getEvent({ drawId }).drawDefinition }).inconsistencies?.map(
    (issue: any) => issue.issueType,
  ) ?? [];
const actionsOf = (matchUpId: string) =>
  (tournamentEngine.matchUpActions({ drawId, matchUpId }).validActions ?? []) as any[];

/** a draw whose first first-round matchUp is decided, so its winner waits ALONE in the second round */
function aLoneOccupant(drawType: string, propagateExitStatus?: boolean) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 16, drawId }],
    nonRandom: 4242,
    setState: true,
  });
  const main = all().find((m: any) => m.roundNumber === 1).structureName;
  const at = (roundNumber: number, roundPosition: number) =>
    all().find(
      (m: any) => m.structureName === main && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: at(1, 1).matchUpId,
    outcome: { winningSide: 1 },
    propagateExitStatus,
    drawId,
  });
  expect(result.success).toEqual(true);
  const lone = at(2, 1);
  const present = lone.sides.find((side: any) => side.participantId);
  return { main, at, lone, present, emptySide: 3 - present.sideNumber };
}

const CELLS = [
  SINGLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  COMPASS,
  OLYMPIC,
].flatMap((drawType) =>
  [false, true].flatMap((propagateExitStatus) =>
    [WALKOVER, DEFAULTED].map((matchUpStatus) => ({ drawType, propagateExitStatus, matchUpStatus })),
  ),
);

describe('recorded, then the opponent arrives', () => {
  it.each(CELLS)(
    '$drawType, propagateExitStatus $propagateExitStatus: $matchUpStatus',
    ({ drawType, propagateExitStatus, matchUpStatus }) => {
      const { main, at, lone, present, emptySide } = aLoneOccupant(drawType, propagateExitStatus);

      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus, winningSide: emptySide },
        matchUpId: lone.matchUpId,
        propagateExitStatus,
        drawId,
      });
      expect(result.success).toEqual(true);
      expect(inconsistencies()).toEqual([]);

      // the opponent arrives, takes the walkover, and advances
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: at(1, 2).matchUpId,
        outcome: { winningSide: 1 },
        propagateExitStatus,
        drawId,
      });
      expect(result.success).toEqual(true);
      const decided = all().find((m: any) => m.matchUpId === lone.matchUpId);
      expect(decided.matchUpStatus).toEqual(matchUpStatus);
      expect(decided.winningSide).toEqual(emptySide);
      const winnerId = decided.sides.find((side: any) => side.sideNumber === emptySide).participantId;
      expect(winnerId).toBeDefined();
      expect(at(3, 1).sides.some((side: any) => side.participantId === winnerId)).toEqual(true);

      // the present participant is the loser, directed onward where the draw has somewhere to send them
      const elsewhere = all().filter(
        (m: any) =>
          m.structureName !== main && m.sides.some((side: any) => side.participantId === present.participantId),
      );
      if (drawType === SINGLE_ELIMINATION || drawType === FIRST_MATCH_LOSER_CONSOLATION) {
        // nowhere to go: no consolation, or not their first match
        expect(elsewhere).toEqual([]);
      } else {
        expect(elsewhere.length).toBeGreaterThan(0);
        // carried only under propagation; otherwise they play their next matchUp
        expect(elsewhere[0].matchUpStatus).toEqual(propagateExitStatus ? matchUpStatus : TO_BE_PLAYED);
      }
      expect(inconsistencies()).toEqual([]);
    },
  );
});

describe('matchUpActions', () => {
  it('offers EXIT on a lone occupant, awarding the empty side, and never SCORE', () => {
    const { lone, present, emptySide } = aLoneOccupant(FEED_IN_CHAMPIONSHIP);
    const actions = actionsOf(lone.matchUpId);
    const exit = actions.find((action) => action.type === EXIT);
    expect(actions.some((action) => action.type === SCORE)).toEqual(false);
    expect(exit.payload).toMatchObject({
      exitingParticipantId: present.participantId,
      exitingSideNumber: present.sideNumber,
      matchUpStatuses: [WALKOVER, DEFAULTED],
      outcome: { winningSide: emptySide },
    });

    // the payload, as offered, is accepted
    const result: any = tournamentEngine[exit.method]({
      ...exit.payload,
      outcome: { ...exit.payload.outcome, matchUpStatus: DEFAULTED },
    });
    expect(result.success).toEqual(true);

    // once recorded, and until the opponent arrives, it can be changed (EXIT, naming what stands) or cleared
    const after = actionsOf(lone.matchUpId);
    expect(after.find((action) => action.type === EXIT)?.payload.recorded).toEqual({ matchUpStatus: DEFAULTED });
    expect(after.some((action) => action.type === CLEAR_SCORE)).toEqual(true);
  });

  it('is not offered where both participants are present, nor where neither is', () => {
    const { at } = aLoneOccupant(FEED_IN_CHAMPIONSHIP);
    expect(actionsOf(at(1, 2).matchUpId).some((action) => action.type === EXIT)).toEqual(false);
    expect(actionsOf(at(2, 2).matchUpId).some((action) => action.type === EXIT)).toEqual(false);
  });
});

describe('refused', () => {
  it('never awards the participant already there', () => {
    const { lone, present } = aLoneOccupant(FEED_IN_CHAMPIONSHIP);
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: present.sideNumber },
      matchUpId: lone.matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
  });
});

/**
 * **Until the opponent arrives the director may change it** — WALKOVER <-> DEFAULTED and its reason — **or
 * clear it; once they arrive it is a decided walkover like any other** (CA, 2026-10-04). Under propagation
 * the exit carried to the present participant's next matchUp follows the label.
 */
describe('changed before the opponent arrives', () => {
  it.each([false, true])('propagateExitStatus %s', (propagateExitStatus) => {
    const { main, at, lone, present, emptySide } = aLoneOccupant(FEED_IN_CHAMPIONSHIP, propagateExitStatus);
    const record = (outcome: any) =>
      tournamentEngine.setMatchUpStatus({ matchUpId: lone.matchUpId, propagateExitStatus, outcome, drawId }) as any;
    const carried = () =>
      all().find(
        (m: any) =>
          m.structureName !== main && m.sides.some((side: any) => side.participantId === present.participantId),
      ).matchUpStatus;

    expect(record({ matchUpStatus: WALKOVER, winningSide: emptySide }).success).toEqual(true);
    expect(carried()).toEqual(propagateExitStatus ? WALKOVER : TO_BE_PLAYED);

    // the offered change, with a reason
    const exit = actionsOf(lone.matchUpId).find((action) => action.type === EXIT);
    expect(exit.payload.recorded).toEqual({ matchUpStatus: WALKOVER });
    const outcome = { ...exit.payload.outcome, matchUpStatus: DEFAULTED, matchUpStatusCodes: ['DM'] };
    expect(record(outcome).success).toEqual(true);
    expect(carried()).toEqual(propagateExitStatus ? DEFAULTED : TO_BE_PLAYED);
    expect(actionsOf(lone.matchUpId).find((action) => action.type === EXIT).payload.recorded).toEqual({
      matchUpStatus: DEFAULTED,
      matchUpStatusCode: 'DM',
    });
    expect(inconsistencies()).toEqual([]);

    // the opponent arrives: a decided walkover like any other, no longer an EXIT
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: at(1, 2).matchUpId,
      outcome: { winningSide: 1 },
      propagateExitStatus,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(actionsOf(lone.matchUpId).some((action) => action.type === EXIT)).toEqual(false);
    expect(inconsistencies()).toEqual([]);
  });
});

/**
 * **The carry follows the label for any exit re-entered as the other exit**, the winner unchanged — the
 * 2026-10-02 relabel ruling (a relabel carries the exit to the loser, or withdraws it) applied between the two
 * exits. Before, the loser's next matchUp kept the label it was first carried with.
 */
it('a WALKOVER re-entered as DEFAULTED relabels the exit its loser carried', () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, drawId }],
    nonRandom: 4242,
    setState: true,
  });
  const first = all().find((m: any) => m.structureName === 'Main' && m.roundNumber === 1 && m.roundPosition === 1);
  const loserId = first.sides.find((side: any) => side.sideNumber === 2).participantId;
  const carried = () =>
    all().find(
      (m: any) => m.structureName === 'Consolation' && m.sides.some((side: any) => side.participantId === loserId),
    ).matchUpStatus;
  for (const matchUpStatus of [WALKOVER, DEFAULTED, WALKOVER]) {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus, winningSide: 1 },
      matchUpId: first.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(carried()).toEqual(matchUpStatus);
  }
  expect(inconsistencies()).toEqual([]);
});

describe('cleared before the opponent arrives', () => {
  it.each([false, true])(
    'propagateExitStatus %s: the matchUp and the loser structure are as before',
    (propagateExitStatus) => {
      const { lone, emptySide } = aLoneOccupant(FEED_IN_CHAMPIONSHIP, propagateExitStatus);
      const before = JSON.stringify(all().map((m: any) => [m.matchUpId, m.matchUpStatus, m.winningSide ?? null]));

      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: WALKOVER, winningSide: emptySide },
        matchUpId: lone.matchUpId,
        propagateExitStatus,
        drawId,
      });
      expect(result.success).toEqual(true);
      result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } },
        matchUpId: lone.matchUpId,
        propagateExitStatus,
        drawId,
      });
      expect(result.success).toEqual(true);
      expect(JSON.stringify(all().map((m: any) => [m.matchUpId, m.matchUpStatus, m.winningSide ?? null]))).toEqual(
        before,
      );
      expect(inconsistencies()).toEqual([]);
    },
  );
});

/**
 * **A source feeding the VACANT side of a recorded exit is not held by it.** Recorded before the opponent
 * arrived, the walkover names only the participant already there; the source on the empty side decides only
 * who arrives to take it. `isActiveDownstream` read any recorded exit downstream as active (#5129, where the
 * source fed the EXITED participant and a flip would have moved the walkover onto someone else), so a
 * convergence written into the vacant side's source was refused after the draw had moved. Census arm seeds,
 * shrunk; each is refused ERR_INCOMPATIBLE_MATCHUP_STATUS after mutating without the refinement.
 */
const VACANT_SIDE_SOURCES = [
  {
    // FEED_IN_CHAMPIONSHIP 32/30
    config: {
      participantsCount: 30,
      propagateExitStatus: true,
      drawSize: 32,
      drawType: 'FEED_IN_CHAMPIONSHIP',
      seed: 9700092,
    },
    steps: [
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 5,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 7,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 6,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 4,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 8,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 3, roundPosition: 2, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 2 } },
      {
        structureName: 'Consolation',
        roundNumber: 4,
        roundPosition: 2,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 5,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
    ],
  },
  {
    // DOUBLE_ELIMINATION 32/31
    config: {
      participantsCount: 31,
      propagateExitStatus: true,
      drawSize: 32,
      drawType: 'DOUBLE_ELIMINATION',
      seed: 9700034,
    },
    steps: [
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 14,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 11,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 10,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 5,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 7,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 9,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 12, outcome: { winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 3,
        roundPosition: 3,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 4,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 3,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
      {
        structureName: 'Backdraw',
        roundNumber: 5,
        roundPosition: 1,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 13,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 2 },
      },
    ],
  },
];

it.each(VACANT_SIDE_SOURCES)('census arm seed $config.seed replays clean', ({ config, steps }) => {
  const replayId = `vacant-${config.seed}`;
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  setSubscriptions({});
  expect(prepareDraw(config, replayId)).toEqual(true);
  for (const step of steps) {
    const target = getDrawMatchUps(replayId).find((m: any) => key(m) === key(step));
    const observation = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId: replayId,
    });
    expect(observation.error && observation.mutated).toBeFalsy();
    expect(checkIntegrity(replayId, target.matchUpId)).toEqual([]);
  }
});
