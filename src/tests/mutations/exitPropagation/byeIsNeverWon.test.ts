import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, BYE } from '@Constants/matchUpStatusConstants';

/**
 * A BYE IS NEVER WON — not even when a caller hands the cascade a winningSide.
 *
 * `conditionallyAdvanceDrawPosition` already refuses to overwrite a BYE-held target's STATUS. The
 * winningSide beside it was left alone, so the matchUp came out reading `BYE` while also naming a
 * winner — and on this path that winner is the VACANT drawPosition, because
 * `handleLoserMatchUp` derives `walkoverWinningSide = 2 - drawPositions.indexOf(loserTarget)` and
 * hands it down regardless of what the target holds.
 *
 * The rule is the engine's own, stated in three places and enforced in none of them at the site
 * that writes the status: `getExitWinningSide` — *"A BYE draw position can never be the winning
 * side"* — `exitAwardable`, and the `doubleExitPropagateBye` docblock's *"a matchUp containing a
 * BYE may never carry a winningSide."*
 *
 * THE TRIGGER IS AN ORDINARY TD CORRECTION, which is what makes it worth a named test: score a
 * match, correct it to a real result, correct it back. Found by the 2026-09-20 sweep as its
 * most-reachable `BYE_WITH_WINNING_SIDE`, and hand-drivable in TMX with no policy or flag —
 * `propagateExitStatus` is false throughout.
 */
test('a BYE-held target takes no winningSide, however the cascade reaches it', () => {
  setSubscriptions({});
  const drawId = 'bye-never-won';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 8, participantsCount: 7, idPrefix: 'bnw', drawId }],
    nonRandom: 20020173,
    setState: true,
  });

  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  const score = (matchUpId: string, outcome: any) => {
    const result: any = tournamentEngine.setMatchUpStatus({ propagateExitStatus: false, matchUpId, outcome, drawId });
    expect(result.error, matchUpId).toBeUndefined();
  };

  score('bnw-1-4', { matchUpStatus: DOUBLE_WALKOVER });
  score('bnw-1-3', { matchUpStatus: DOUBLE_DEFAULT });
  // the correction, and then the correction back — neither is exotic
  score('bnw-1-4', { winningSide: 1 });
  score('bnw-1-4', { matchUpStatus: DOUBLE_WALKOVER });

  const playOff = matchUps().find((m: any) => m.structureName === 'Play Off' && m.roundNumber === 1);

  // CONTROL: the Play Off matchUp must actually be BYE-held, or this asserts nothing. The BYE is
  // one this cascade PLACED (`byeFromPropagation`), which is the whole path under test.
  expect(playOff, 'no Play Off matchUp').toBeTruthy();
  expect(playOff.matchUpStatus).toEqual(BYE);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const playOffStructure = drawDefinition.structures.find((s: any) => s.structureName === 'Play Off');
  const propagatedBye = (playOffStructure?.positionAssignments ?? []).find((a: any) => a.bye);
  expect(propagatedBye, 'expected a propagated BYE in the Play Off').toBeTruthy();

  // THE ASSERTION
  expect(playOff.winningSide).toBeUndefined();

  // and the reason it matters: the side the arithmetic would have awarded holds nobody
  for (const side of playOff.sides ?? []) {
    if (side.sideNumber === 1) expect(side.participantId, 'side 1 must be vacant here').toBeUndefined();
  }
});
