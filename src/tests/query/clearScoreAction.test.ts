/**
 * CLEAR_SCORE — the action that says whether an existing outcome can be REMOVED.
 *
 * Clearing an outcome is submitted through the same `setMatchUpStatus` method as scoring it, with
 * an empty outcome. So `SCORE` covered two operations while only one of them was refusable:
 * measured across the exit-propagation agreement matrix, SCORING a decided matchUp succeeds
 * everywhere and only the CLEAR is refused, with `ERR_PROPAGATED_EXITS_DOWNSTREAM`. Nothing in
 * `validActions` expressed that, so a consumer discovered it by being told no.
 *
 * `CLEAR_SCORE` is emitted only when the clear will succeed, so its PRESENCE is the permission.
 * These tests assert BOTH directions — present ⇒ the clear is accepted, absent ⇒ it is refused —
 * because a one-directional check would pass just as well if the action were never emitted at all.
 */
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

const clearOutcome = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

const actionTypes = (drawId: string, matchUpId: string): string[] => {
  const { validActions }: any = tournamentEngine.matchUpActions({ matchUpId, drawId });
  return (validActions ?? []).map((action: any) => action.type);
};

describe('CLEAR_SCORE', () => {
  it('is offered for a completed matchUp, and the clear it advertises succeeds', () => {
    setSubscriptions({});
    const drawId = 'clear-score-basic';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    // the FINAL: a completed matchUp with nothing downstream depending on its result. Clearing an
    // earlier round is refused with ERR_INCOMPATIBLE_MATCHUP_STATUS because downstream rounds are
    // decided — which CLEAR_SCORE correctly reflects by being absent there (asserted below).
    const { matchUps }: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const completed = matchUps
      .filter((m: any) => m.winningSide)
      .toSorted((a: any, b: any) => b.roundNumber - a.roundNumber)[0];
    expect(completed).toBeDefined();

    expect(actionTypes(drawId, completed.matchUpId)).toContain(CLEAR_SCORE);

    // the action is not decorative: the mutation it describes is accepted
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: completed.matchUpId,
      outcome: clearOutcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  });

  it('is withheld on an earlier round whose clear the engine refuses', () => {
    setSubscriptions({});
    const drawId = 'clear-score-active-downstream';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const { matchUps }: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const firstRound = matchUps.find((m: any) => m.roundNumber === 1 && m.winningSide);
    expect(firstRound).toBeDefined();

    const types = actionTypes(drawId, firstRound.matchUpId);
    expect(types).not.toContain(CLEAR_SCORE);
    // CONTROL: SCORE is still offered here, so the absence is specifically about removability —
    // this is the asymmetry the action exists to express.
    expect(types).toContain(SCORE);

    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRound.matchUpId,
      outcome: clearOutcome,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  it('is NOT offered for a matchUp with no outcome to remove', () => {
    setSubscriptions({});
    const drawId = 'clear-score-unplayed';
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId, drawSize: 8 }], setState: true });

    const { matchUps }: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const unplayed = matchUps.find((m: any) => !m.winningSide && m.matchUpStatus === TO_BE_PLAYED);
    expect(unplayed).toBeDefined();

    const types = actionTypes(drawId, unplayed.matchUpId);
    expect(types).not.toContain(CLEAR_SCORE);
    // CONTROL: the matchUp is otherwise actionable, so absence is about removability and not
    // about the action list being empty for some unrelated reason.
    expect(types).toContain(SCORE);
  });

  it('is withheld exactly where the engine refuses the clear, and SCORE is still offered there', () => {
    setSubscriptions({});
    const drawId = 'clear-score-propagated';
    // seed 61 is the exit-propagation agreement matrix's DOUBLE_ELIMINATION 16/16 WALKOVER cell,
    // one of the 20 that were quarantined for this divergence
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 16, participantsCount: 16 }],
      nonRandom: 61,
      setState: true,
    });

    // drive the draw far enough for an exit to cascade downstream
    for (let i = 0; i < 12; i++) {
      const { matchUps }: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
      const next = matchUps
        .filter((m: any) => !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === TO_BE_PLAYED))
        .find((m: any) => (m.sides ?? []).filter((s: any) => s?.participantId).length === 2);
      if (!next) break;
      tournamentEngine.setMatchUpStatus({
        outcome: i % 3 === 2 ? { matchUpStatus: 'WALKOVER', winningSide: 1 } : { winningSide: 1 },
        matchUpId: next.matchUpId,
        propagateExitStatus: true,
        drawId,
      });
    }

    const { matchUps }: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const decided = matchUps.filter((m: any) => m.winningSide || (m.matchUpStatus && m.matchUpStatus !== TO_BE_PLAYED));
    expect(decided.length).toBeGreaterThan(0);

    const withheld: string[] = [];
    for (const candidate of decided) {
      const types = actionTypes(drawId, candidate.matchUpId);
      if (types.includes(CLEAR_SCORE)) continue;
      withheld.push(candidate.matchUpId);
      // where CLEAR_SCORE is withheld but SCORE is still offered, the engine must be the one
      // refusing the clear — that asymmetry is the whole point of the action existing
      if (!types.includes(SCORE)) continue;
      const probe: any = tournamentEngine.setMatchUpStatus({
        matchUpId: candidate.matchUpId,
        outcome: clearOutcome,
        drawId,
      });
      expect(probe.error).toBeDefined();
    }

    // CONTROL: a run where CLEAR_SCORE is never withheld would satisfy the loop vacuously
    expect(withheld.length).toBeGreaterThan(0);
  });
});
