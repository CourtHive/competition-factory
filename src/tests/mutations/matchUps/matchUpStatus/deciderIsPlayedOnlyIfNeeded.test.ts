import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A DECIDER IS PLAYED ONLY IF IT IS NEEDED.
 *
 * CA, 2026-09-29: *"set it to a DEAD_RUBBER when it is unnecessary so that clients don't see
 * TO_BE_PLAYED matchUps; changing the winningSide of the final can clear the DEAD_RUBBER if the
 * decider becomes necessary. If someone wanted to clear the DEAD_RUBBER and play the decider 'just
 * for fun', there's no reason to prevent that."* And of a decider played before its final changed:
 * *"it should be destroyed."*
 *
 * Each clause is its own test, because each can fail alone. DOUBLE_ELIMINATION 8/8, `nonRandom: 7001`:
 * the Main final is `Main|4|1`, side 1 the undefeated finalist and side 2 the Backdraw champion.
 */

const DRAW_ID = 'decider';
const STRAIGHT_SETS = {
  sets: [
    { side1Score: 6, side2Score: 3, setNumber: 1, winningSide: 1 },
    { side1Score: 6, side2Score: 3, setNumber: 2, winningSide: 1 },
  ],
};
const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const final = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Main' && matchUp.roundNumber === 4);
const decider = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Decider');
const occupants = (matchUp: any) => (matchUp.sides ?? []).map((side: any) => side.participantId);

function score(matchUp: any, outcome: any, options: any = {}) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    drawId: DRAW_ID,
    outcome,
    ...options,
  });
  expect(result.error, `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`).toBeUndefined();
}

/** play everything up to the final, then the final itself */
function playToFinal(finalWinningSide: number) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId: DRAW_ID }],
    nonRandom: 7001,
    setState: true,
  });

  for (let guard = 0; guard < 50; guard++) {
    const next = allMatchUps()
      .filter(
        (matchUp) =>
          matchUp.structureName !== 'Decider' &&
          matchUp.matchUpStatus === TO_BE_PLAYED &&
          occupants(matchUp).filter(Boolean).length === 2,
      )
      .sort((a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition)[0];
    if (!next) break;
    const isFinal = next.matchUpId === final().matchUpId;
    score(next, { winningSide: isFinal ? finalWinningSide : 1 });
  }

  // CONTROL: the final was reached and decided, by the side asked for, between two participants
  expect(final().winningSide).toEqual(finalWinningSide);
  expect(occupants(final()).filter(Boolean).length).toEqual(2);
}

const losses = (participantId: string) =>
  allMatchUps().filter(
    (matchUp) =>
      matchUp.structureName !== 'Decider' &&
      matchUp.winningSide &&
      (matchUp.sides ?? []).some(
        (side: any) => side.participantId === participantId && side.sideNumber !== matchUp.winningSide,
      ),
  ).length;

it('is a DEAD_RUBBER when the undefeated finalist wins the final', () => {
  playToFinal(1);
  const [winnerId, loserId] = occupants(final());

  // CONTROL: this is the case the rule is about — one finalist never lost, the other has lost twice
  expect(losses(winnerId)).toEqual(0);
  expect(losses(loserId)).toEqual(2);

  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  expect(decider().winningSide).toBeUndefined();
  // they are still seated there: the decider is not needed, it has not vanished
  expect(occupants(decider())).toEqual([winnerId, loserId]);
});

it('is TO_BE_PLAYED when the Backdraw champion wins the final', () => {
  playToFinal(2);
  const [undefeatedId, championId] = occupants(final());

  // CONTROL: both have now lost exactly once
  expect(losses(undefeatedId)).toEqual(1);
  expect(losses(championId)).toEqual(1);

  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(decider())).toEqual([championId, undefeatedId]);
});

it('clears the DEAD_RUBBER when the final is changed and the decider becomes necessary', () => {
  playToFinal(1);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  const [undefeatedId, championId] = occupants(final());

  score(final(), { winningSide: 2 }, { allowChangePropagation: true });

  expect(final().winningSide).toEqual(2);
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  // and the pair are seated as the final now has them: its winner first
  expect(occupants(decider())).toEqual([championId, undefeatedId]);
});

it('becomes a DEAD_RUBBER when the final is changed and the decider stops being necessary', () => {
  playToFinal(2);
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  const [undefeatedId, championId] = occupants(final());

  score(final(), { winningSide: 1 }, { allowChangePropagation: true });

  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  expect(occupants(decider())).toEqual([undefeatedId, championId]);
});

it('destroys a decider result when the final it followed from is changed', () => {
  playToFinal(2);
  score(decider(), { score: STRAIGHT_SETS, matchUpStatus: COMPLETED, winningSide: 1 });
  // CONTROL: there is a result to destroy
  expect(decider().winningSide).toEqual(1);
  expect(decider().score?.sets?.length).toEqual(2);

  score(final(), { winningSide: 1 }, { allowChangePropagation: true });

  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  expect(decider().winningSide).toBeUndefined();
  expect(decider().score?.sets ?? []).toEqual([]);
});

it('lets a DEAD_RUBBER be cleared and the decider played anyway', () => {
  playToFinal(1);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);

  score(decider(), { matchUpStatus: TO_BE_PLAYED, winningSide: undefined });
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);

  score(decider(), { winningSide: 2 });
  expect(decider().matchUpStatus).toEqual(COMPLETED);
  expect(decider().winningSide).toEqual(2);

  // and scoring something ELSE afterwards does not take it back: only a change to the final does
  const other = allMatchUps().find((matchUp) => matchUp.structureName === 'Backdraw' && matchUp.roundNumber === 1);
  score(other, { winningSide: 1, score: STRAIGHT_SETS });
  expect(decider().matchUpStatus).toEqual(COMPLETED);
  expect(decider().winningSide).toEqual(2);
});

it('returns the decider to TO_BE_PLAYED when the final is cleared', () => {
  playToFinal(1);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);

  score(final(), { matchUpStatus: TO_BE_PLAYED, winningSide: undefined });

  expect(final().winningSide).toBeUndefined();
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(decider()).filter(Boolean)).toEqual([]);
});
