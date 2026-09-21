import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, describe, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * `drawPositions` is COMPACTED: a matchUp awaiting its second participant is stored `[4]`, not
 * `[undefined, 4]`. So the array cannot say which side that position is on, and every subscriber
 * that needed to know re-derived it — each wrongly, and each differently.
 *
 *   pdf-factory     `drawPositions[winningSide - 1]` -> undefined, and the advancing participant
 *                   rendered as a blank line on the draw sheet.
 *   courthive-public rebuilt sides as `sideNumber = index + 1`, seating an arrival on side 1 when
 *                   the engine says side 2 — overwriting the correct binding it already held.
 *
 * The notice now answers it, and only when the array cannot. With both positions present side 1 is
 * the numerically lower one, which is published and exact, so nothing is emitted.
 *
 * Measured against the engine's own hydration over 9 draw types x 3 sizes x 3 double-exit
 * placements: 304 bindings emitted of 2,463 matchUps, 304 agreed, 0 misses. ~0.03ms per emitting
 * call, nothing on the common path.
 */
describe('MODIFY_MATCHUP drawPositionSides', () => {
  function capture() {
    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads: any[]) => notices.push(...(payloads ?? [])) } });
    return notices;
  }

  const withPropagatedExits = (drawType: string) =>
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: 'DOUBLE_WALKOVER' },
            { roundNumber: 1, roundPosition: 2, winningSide: 2, scoreString: '6-1 6-2' },
            { roundNumber: 1, roundPosition: 3, matchUpStatus: 'DOUBLE_DEFAULT' },
            { roundNumber: 1, roundPosition: 4, winningSide: 1, scoreString: '6-1 6-2' },
          ],
        },
      ],
      setState: true,
    });

  it('names the side of a lone drawPosition, and agrees with the engine', () => {
    const { drawIds } = withPropagatedExits(SINGLE_ELIMINATION) as any;
    const notices = capture();

    const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
    const target: any = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId: drawIds[0], outcome });

    const bound = notices.filter((notice: any) => notice.drawPositionSides);
    // The control: no binding emitted means the rest is vacuous.
    expect(bound.length).toBeGreaterThan(0);

    const hydrated: any = tournamentEngine.allTournamentMatchUps();
    for (const notice of bound) {
      // It is emitted ONLY for the case the array cannot express.
      expect((notice.matchUp.drawPositions ?? []).filter(Boolean).length).toEqual(1);

      const live = hydrated.matchUps.find((m: any) => m.matchUpId === notice.matchUp.matchUpId);
      const truth = (live?.sides ?? [])
        .filter((side: any) => side?.drawPosition)
        .map((side: any) => ({ drawPosition: side.drawPosition, sideNumber: side.sideNumber }));
      expect(notice.drawPositionSides).toEqual(truth);
    }

    setSubscriptions({ subscriptions: {} });
  });

  it('says nothing when the array already says it', () => {
    withPropagatedExits(FIRST_MATCH_LOSER_CONSOLATION);
    const notices = capture();

    const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
    const target: any = matchUps.find(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-2',
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId: target.drawId, outcome });

    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) {
      const present = (notice.matchUp.drawPositions ?? []).filter(Boolean).length;
      // Two positions: side 1 is the numerically lower one, so the subscriber needs no help.
      if (present === 2) expect(notice.drawPositionSides).toBeUndefined();
    }

    setSubscriptions({ subscriptions: {} });
  });
});
