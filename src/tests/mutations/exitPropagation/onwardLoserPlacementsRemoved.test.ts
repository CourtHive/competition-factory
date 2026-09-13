import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPASS, FEED_IN_CHAMPIONSHIP, OLYMPIC } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Removing a directed loser follows the feed chain as far as the chain is INERT for them.
 *
 * `removeDirectedLoser` empties the participant's assignment in the structure they were fed INTO —
 * correct, but exactly ONE link deep. A participant who then lost in that structure has already been
 * fed onward, and that placement is orphaned: they cannot have lost a matchUp in a structure they
 * are no longer in.
 *
 * Only a draw whose LOSER-link target is itself a LOSER-link SOURCE can produce one. Measured across
 * all ten sweep draw types at drawSizes 8/16/32, that is COMPASS (East->West->South, East->North)
 * and OLYMPIC (East->West->South) and no other — which is why eight draw types exercising this code
 * constantly could never expose it, and why every case below is a COMPASS or an OLYMPIC.
 *
 * The orphan is not merely untidy. Its slot stays occupied, so the next arrival's COMPUTED
 * drawPosition is blocked, and `placeLoser` puts that arrival in the OTHER slot of the target matchUp
 * — the one belonging to a different source matchUp. The corruption is silent where it happens and
 * surfaces later, on a third matchUp, as `DRAW_POSITION_OCCUPIED` returned after the source status
 * was already written. Recorded on seed 9000249 before the fix:
 *
 *     step  5  West r1p4 loser=A  computed=4 avail=[4]  -> South 4
 *     step 16  East r1p8 re-scored; its loser becomes B, and A leaves West but NOT South
 *     step 17  West r1p4 loser=B  computed=4 avail=[3]  -> South 3   <- the wrong seat
 *     step 20  West r1p3 loser=C  computed=3 avail=[]   -> DRAW_POSITION_OCCUPIED
 *
 * WHY A DEEPER UNWIND IS SAFE HERE. `setMatchUpState` reaches this code only after
 * `isActiveDownstream` — which recurses across links without bound — has reported nothing active
 * below, so one link was sufficient BY CONSTRUCTION whenever that guard was right. The walk needs no
 * re-propagation pass to pair with it because there is nothing live to re-propagate. A blanket
 * cascade was built first and measured worse: a re-score removes and re-directs within the same
 * mutation, and removing everything downstream destroys state the re-direction never restores.
 *
 * The scope is what makes it safe. A placement is released only when every matchUp holding it is
 * undecided, or records an exit whose provenance shows THIS participant's side was CARRIED there —
 * a propagated exit whose `winningSide` was written before any participant arrived, so withdrawing
 * the occupant returns it to the pending exit it was. Of 22 decided placements holding a stranded
 * participant over the 600-seed window, 21 are that shape.
 *
 * Frozen-schedule census at `dev` `d2536df39`: **31 -> 27, four seeds closed, zero new**, and
 * `ERR_OCCUPIED_DRAW_POSITION` reaches zero. Per-seed isolated against `dev`: 38 -> 24.
 *
 * Each case is a sweep reproduction, shrunk, verified to reproduce STANDALONE with the same error
 * code, and verified to DISCRIMINATE — RED on `dev`, green here. Two of the four seeds the census
 * closes were shrunk and DISCARDED rather than kept as decoration: 9000042's shrink raises a
 * different error standalone than it does in the window, and 9000477's fails on both trees. A
 * shrinker preserves only the PROPERTY, so a shrunk case earns its place only once it has been shown
 * to turn.
 */

const DRAW_ID = 'onward-loser-placements';

function target({ structureName, roundNumber, roundPosition }: any) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );
}

it.each([
  {
    scenario: 'a West loser arriving after its slot-mate left the feeder in an OLYMPIC of 16',
    drawType: OLYMPIC,
    participantsCount: 16,
    drawSize: 16,
    propagateExitStatus: true,
    seed: 9000249,
    steps: [
      { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'West', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
    ],
  },
  {
    scenario: 'a re-scored East walkover orphaning a South placement in a COMPASS of 8',
    drawType: COMPASS,
    participantsCount: 8,
    drawSize: 8,
    propagateExitStatus: true,
    seed: 9000384,
    steps: [
      { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'West', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } },
    ],
  },
])('$scenario is not refused by an orphaned occupant', (testCase) => {
  const { participantsCount, propagateExitStatus, drawType, drawSize, seed, steps } = testCase;

  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId: DRAW_ID }],
    nonRandom: seed,
    setState: true,
  });

  for (const [index, step] of steps.entries()) {
    const matchUp = target(step);
    expect(matchUp?.matchUpId, `step ${index + 1} target missing`).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId: DRAW_ID,
    });
    expect(
      result.error?.code,
      `step ${index + 1} (${step.structureName} r${step.roundNumber}p${step.roundPosition})`,
    ).toBeUndefined();
  }

  // CONTROL, not the regression assertion: the committed oracle must stay clean, so the fix cannot
  // buy the placement back with a worse draw.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});

it('leaves a participant who EARNED a result downstream in place', () => {
  // The boundary. Releasing an occupant who actually played where they sit would leave a recorded
  // result unresolvable — measured as `WINNER_NOT_ADVANCED` when an earlier, looser version of this
  // rule released them. Only a CARRIED exit, or an undecided matchUp, is inert for its occupant.
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType: COMPASS, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });

  const play = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) => {
    const matchUp = target({ structureName, roundNumber, roundPosition });
    return tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    }) as any;
  };

  expect(play('East', 1, 1, { winningSide: 1 }).error).toBeUndefined();
  expect(play('East', 1, 2, { winningSide: 1 }).error).toBeUndefined();
  // a genuine, contested West result — its loser is fed onward into South
  expect(play('West', 1, 1, { winningSide: 1 }).error).toBeUndefined();

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const structures: any[] = drawDefinition.structures ?? [];
  const south = structures.find((structure: any) => structure.structureName === 'South');
  const southOccupants = (south?.positionAssignments ?? [])
    .map((assignment: any) => assignment.participantId)
    .filter(Boolean);

  // the control: without an occupant in South this asserts nothing
  expect(southOccupants.length).toBeGreaterThan(0);

  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});

it('is inert in a draw with no chained loser link', () => {
  // FEED_IN_CHAMPIONSHIP unwinds completely in one link, so no orphan can exist in it. The walk must
  // be genuinely inert here rather than merely harmless.
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });

  const steps = [
    { roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } },
    { roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    { roundNumber: 1, roundPosition: 1, outcome: { winningSide: 2 } },
    { roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
  ];
  for (const [index, step] of steps.entries()) {
    const matchUp = target({ structureName: 'Main', ...step });
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus: true,
      drawId: DRAW_ID,
    });
    expect(result.error?.code, `step ${index + 1}`).toBeUndefined();
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const consolation = (drawDefinition.structures ?? []).find(
    (structure: any) => structure.structureName === 'Consolation',
  );
  const occupants = (consolation?.positionAssignments ?? [])
    .map((assignment: any) => assignment.participantId)
    .filter(Boolean);

  // the control: the re-score above must actually have fed the consolation
  expect(occupants.length).toBeGreaterThan(0);

  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});
