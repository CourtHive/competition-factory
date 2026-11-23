import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  TO_BE_PLAYED,
  DEFAULTED,
  WALKOVER,
  RETIRED,
} from '@Constants/matchUpStatusConstants';

/**
 * An error must never be returned over a draw that was already changed.
 *
 * `directParticipants` commits the source matchUp — status, winningSide, score — as its FIRST
 * statement, and only then walks the links to place participants. Every guard that can refuse lives
 * in that placement step, so any refusal raised there arrives over a mutated draw. The harness
 * reports it as `ERROR_IMPLIES_NO_MUTATION`, and it is the largest defect class in the engine.
 *
 * The fix is not to predict the refusal but to stop creating the state that causes it. Both guards
 * were refusing truthfully about a draw that should never have looked that way: a drawPosition
 * holding NOBODY is advanced as a reservation, later becomes a BYE, and then occupies a slot a real
 * participant has earned. See `yieldSquattingPropagatedBye` in `assignMatchUpDrawPosition` and the
 * BYE exemption in `clearDrawPosition`.
 *
 * ## These cases are generated, not stored
 *
 * Each is a `mocksEngine` draw plus the handful of `setMatchUpStatus` submissions that produce the
 * state, reduced by the exit-propagation sweep's shrinker from 30 random steps to the few that
 * matter. `nonRandom` is load-bearing: BYE placement is decided at generation, and these cases turn
 * on it. `participantsCount` is below `drawSize` throughout — a full draw has no BYEs and none of
 * this can arise, so a case run at `participantsCount === drawSize` would pass either way.
 */
describe('an error is never returned over a mutated draw', () => {
  type Submission = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };

  const CASES: {
    name: string;
    drawType: string;
    drawSize: number;
    participantsCount: number;
    nonRandom: number;
    propagateExitStatus: boolean;
    submissions: Submission[];
  }[] = [
    {
      // census seed 9000037 — a placeholder BYE let its opponent advance and play; a winner flip
      // then made a real loser eligible for that slot and the clear was refused as "active".
      name: 'first-match consolation — a slot held by a played-through BYE is reclaimed',
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 8,
      participantsCount: 5,
      nonRandom: 9000037,
      propagateExitStatus: false,
      submissions: [
        {
          structureName: 'Main',
          roundNumber: 2,
          roundPosition: 1,
          outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
        },
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 3,
          outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
        },
        { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 2 } },
        { structureName: 'Consolation', roundNumber: 3, roundPosition: 1, outcome: { winningSide: 2 } },
        {
          structureName: 'Main',
          roundNumber: 2,
          roundPosition: 2,
          outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
        },
      ],
    },
    {
      // census seed 9100212 — the same shape at a different size and seed.
      name: 'first-match consolation — a re-scored double default reclaims its slot',
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 8,
      participantsCount: 6,
      nonRandom: 9100212,
      propagateExitStatus: false,
      submissions: [
        { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
        { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { winningSide: 2 } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        { structureName: 'Consolation', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 1 } },
      ],
    },
    {
      // census seed 9100511 — DOUBLE_ELIMINATION, where the reservation is created by the
      // same-structure branch of doubleExitAdvancement.
      name: 'double elimination — a reserved backdraw position yields to the real winner',
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 8,
      nonRandom: 9100511,
      propagateExitStatus: false,
      submissions: [
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 3,
          outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
        },
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 4,
          outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
        },
        { structureName: 'Backdraw', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { structureName: 'Backdraw', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 2 } },
      ],
    },
  ];

  const drawMatchUps = (drawId: string): any[] =>
    tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

  it.each(CASES)('$name', ({ drawType, drawSize, participantsCount, nonRandom, propagateExitStatus, submissions }) => {
    setSubscriptions({});
    const drawId = `squatting-bye-${nonRandom}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
      nonRandom,
      setState: true,
    });

    // CONTROL: the draw must exist, or every assertion below is about nothing.
    expect(drawMatchUps(drawId).length).toBeGreaterThan(0);

    const offences: string[] = [];
    let applied = 0;
    submissions.forEach((submission, index) => {
      const target = drawMatchUps(drawId).find(
        (matchUp: any) =>
          matchUp.structureName === submission.structureName &&
          matchUp.roundNumber === submission.roundNumber &&
          matchUp.roundPosition === submission.roundPosition,
      );
      // CONTROL: a coordinate that names no matchUp would silently skip the submission that
      // produces the state, and the case would pass by doing nothing.
      expect(target, `submission ${index + 1} names no matchUp`).toBeTruthy();

      const before = hash(getDrawDefinition(drawId));
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: target.matchUpId,
        outcome: submission.outcome,
        propagateExitStatus,
        drawId,
      });
      const after = hash(getDrawDefinition(drawId));

      applied++;
      // A refusal is allowed. A refusal that WROTE is the defect.
      if (result.error && after !== before) {
        offences.push(`submission ${index + 1} returned ${result.error.code} over a changed draw`);
      }
    });

    expect(applied).toEqual(submissions.length); // control: every submission was attempted
    expect(offences).toEqual([]);
  });

  it('a BYE reclaimed from a matchUp it never earned leaves no result behind', () => {
    setSubscriptions({});
    const drawId = 'squatting-bye-residue';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount: 6, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
      nonRandom: 9100212,
      setState: true,
    });

    for (const submission of CASES[1].submissions) {
      const target = drawMatchUps(drawId).find(
        (matchUp: any) =>
          matchUp.structureName === submission.structureName &&
          matchUp.roundNumber === submission.roundNumber &&
          matchUp.roundPosition === submission.roundPosition,
      );
      if (!target) continue;
      tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome: submission.outcome, drawId });
    }

    // Whatever the reclaim released must not still record a result. A matchUp that lost a
    // participant is undecided under every status the release can produce.
    const residue = drawMatchUps(drawId).filter(
      (matchUp: any) =>
        (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED) &&
        (matchUp.winningSide || matchUp.score?.sets?.length),
    );
    expect(
      residue.map((matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`),
    ).toEqual([]);
  });
});
