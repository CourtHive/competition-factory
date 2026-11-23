import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * Unwinding a double exit must not throw when it reaches a feed round that holds nobody.
 *
 * `drawPositions` is OPTIONAL on a matchUp, and a feed round is where it is most often absent —
 * DOUBLE_ELIMINATION's Main final holds nothing until both sides arrive. `removeDoubleExit`
 * recurses onto it while unwinding and asks which of the next winner's positions it already holds;
 * a matchUp with no positions holds none, and `undefined` is precisely what the single consumer of
 * that value expects. Reading `.includes` off the absent array instead produced
 * `TypeError: Cannot read properties of undefined (reading 'includes')`.
 *
 * This is a CRASH rather than a refusal, which is why it ranks above the error-atomicity class it
 * was found alongside: 300 shapes in the `propagateExitStatus: false` population of the 480k sweep,
 * and it holds that population's three-step minimum reproduction — reproduced verbatim below.
 *
 * The engine catches it and returns it as an error (`handleCaughtError`), so a consumer sees a
 * failure rather than an exception — but the draw has already been written by then, which is the
 * `ERROR_IMPLIES_NO_MUTATION` shape.
 */
describe('unwinding a double exit through an empty feed round', () => {
  const drawId = 'feed-round-no-positions';

  const setup = () => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      // sweep seed 20385254 — `nonRandom` is load-bearing: it decides BYE placement, and the
      // recursion only reaches the empty final on this arrangement.
      drawProfiles: [{ participantsCount: 6, drawSize: 8, drawType: DOUBLE_ELIMINATION, drawId }],
      nonRandom: 20385254,
      setState: true,
    });
  };

  const byCoord = (structureName: string, roundNumber: number, roundPosition: number): any =>
    (tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? []).find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );

  it('re-scores a double walkover without throwing', () => {
    setup();

    // CONTROL: the draw exists and the Main final is the empty feed round the recursion reaches.
    const final = byCoord('Main', 4, 1);
    expect(final).toBeTruthy();
    // inContext derivation pads the array, so filter: what matters is that it holds no real
    // position. The stored matchUp the recursion reads has no `drawPositions` key at all.
    expect((final.drawPositions ?? []).filter(Boolean)).toEqual([]);

    const submissions = [
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 2,
        outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
    ];

    const offences: string[] = [];
    submissions.forEach((submission, index) => {
      const target = byCoord(submission.structureName, submission.roundNumber, submission.roundPosition);
      // CONTROL: a coordinate naming no matchUp would skip the step that triggers the recursion.
      expect(target, `submission ${index + 1} names no matchUp`).toBeTruthy();

      const before = hash(getDrawDefinition(drawId));
      let result: any;
      try {
        result = tournamentEngine.setMatchUpStatus({
          matchUpId: target.matchUpId,
          outcome: submission.outcome,
          drawId,
        });
      } catch (err: any) {
        offences.push(`submission ${index + 1} threw: ${err?.message}`);
        return;
      }
      // The engine catches internal throws and returns them; assert on the message so a
      // caught-and-returned TypeError is caught here too, not just an escaping one.
      if (typeof result?.error === 'string' && /Cannot read properties/.test(result.error)) {
        offences.push(`submission ${index + 1} returned a TypeError: ${result.error}`);
      }
      if (result?.error && hash(getDrawDefinition(drawId)) !== before) {
        offences.push(`submission ${index + 1} returned ${JSON.stringify(result.error)} over a changed draw`);
      }
    });

    expect(offences).toEqual([]);
  });

  it('leaves the final playable rather than corrupt', () => {
    setup();
    for (const [structureName, roundNumber, roundPosition, outcome] of [
      ['Main', 1, 3, { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main', 2, 2, { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }],
      ['Main', 1, 3, { winningSide: 2 }],
    ] as any[]) {
      const target = byCoord(structureName, roundNumber, roundPosition);
      if (target) tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome, drawId });
    }

    // Nothing undecided may carry a result — the residue an aborted unwind would leave behind.
    const residue = getDrawMatchUps(drawId).filter(
      (matchUp: any) =>
        (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED) &&
        (matchUp.winningSide || matchUp.score?.sets?.length),
    );
    expect(
      residue.map((matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`),
    ).toEqual([]);
  });
});
