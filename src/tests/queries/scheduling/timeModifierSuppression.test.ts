import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FOLLOWED_BY } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * A `FOLLOWED_BY` / `AFTER_REST` / `NOT_BEFORE` annotation is a promise about
 * *when a matchUp may begin*. Once that is settled the annotation is not merely
 * redundant — on a published order of play it is misinformation, telling a player
 * and a referee that a match is waiting on something that has already happened.
 *
 * It is **suppressed at hydration, never cleared**. The stored value is the
 * operator's stated intent and stays where they put it, which is what lets the
 * reverse case work without a rule of its own: remove the score and the
 * annotation is simply visible again, because the condition that hid it lapsed.
 */

const START_DATE = '2026-06-15';

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    setState: true,
    startDate: START_DATE,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((m: any) => m.roundNumber === 1);
  const { matchUpId, drawId } = matchUp;

  tournamentEngine.addMatchUpScheduleItems({
    matchUpId,
    drawId,
    schedule: { scheduledDate: START_DATE, scheduledTime: '10:00', timeModifiers: [FOLLOWED_BY] },
  });

  return { matchUpId, drawId };
}

/** The hydrated view — what every consumer and every notice subscriber sees. */
function hydratedModifiers(matchUpId: string) {
  const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId, inContext: true });
  return matchUp?.schedule?.timeModifiers;
}

/**
 * The value as it sits in the record, reached without going through hydration.
 *
 * `findMatchUp` hydrates even without `inContext`, so it reports the suppressed
 * view and cannot answer "is it still there?". Walking the drawDefinition is the
 * only read that can distinguish suppressed from deleted — which is the entire
 * claim being made here.
 */
function storedModifiers(matchUpId: string, drawId: string) {
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
  const structures = drawDefinition?.structures ?? [];
  for (const structure of structures) {
    const found = (structure.matchUps ?? []).find((m: any) => m.matchUpId === matchUpId);
    if (found) return found.schedule?.timeModifiers;
  }
  return undefined;
}

/**
 * Complete the matchUp with a score its format accepts.
 *
 * `6-1` alone is rejected as invalid for the default format, and a rejected
 * mutation leaves the matchUp TO_BE_PLAYED — which would let a suppression
 * assertion pass for the wrong reason. The result is asserted, not assumed.
 */
function complete(matchUpId: string, drawId: string) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    matchUpStatus: COMPLETED,
    winningSide: 1,
  });
  const result: any = tournamentEngine.setMatchUpStatus({ outcome, matchUpId, drawId });
  expect(result).toMatchObject(SUCCESS);
}

describe('timeModifiers survive until the start is settled', () => {
  it('hydrates the annotation while the matchUp has not begun', () => {
    const { matchUpId } = setup();
    expect(hydratedModifiers(matchUpId)).toEqual([FOLLOWED_BY]);
  });

  it('suppresses once the matchUp is called to court', () => {
    const { matchUpId, drawId } = setup();
    // `addMatchUpScheduleItems` reports success and silently ignores calledAt —
    // `setMatchUpCalledAt` is the mutation that actually writes it.
    const result: any = tournamentEngine.setMatchUpCalledAt({
      calledAt: '2026-06-15T14:00:00.000Z',
      matchUpId,
      drawId,
    });
    expect(result).toMatchObject(SUCCESS);
    expect(hydratedModifiers(matchUpId)).toBeUndefined();
  });

  it('suppresses on a PARTIAL score — the state a live match sits in for an hour', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId,
      drawId,
      outcome: { score: { sets: [{ side1Score: 3, side2Score: 2 }] } },
    });
    expect(result).toMatchObject(SUCCESS);
    // Still TO_BE_PLAYED — this is the live-match state, not a completed one.
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId, drawId });
    expect(matchUp.winningSide).toBeUndefined();
    expect(hydratedModifiers(matchUpId)).toBeUndefined();
  });

  it('suppresses on a completed score', () => {
    const { matchUpId, drawId } = setup();
    complete(matchUpId, drawId);
    expect(hydratedModifiers(matchUpId)).toBeUndefined();
  });

  it('suppresses on a walkover — resolved is resolved, even with nobody on court', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId,
      drawId,
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    });
    expect(result).toMatchObject(SUCCESS);
    expect(hydratedModifiers(matchUpId)).toBeUndefined();
  });
});

describe('suppression is a view, not a deletion', () => {
  it('leaves the stored value untouched, so the write path still sees the intent', () => {
    const { matchUpId, drawId } = setup();
    complete(matchUpId, drawId);

    expect(hydratedModifiers(matchUpId)).toBeUndefined();
    expect(storedModifiers(matchUpId, drawId)).toEqual([FOLLOWED_BY]);
  });

  it('shows the annotation again when the score is removed — no rule of its own', () => {
    const { matchUpId, drawId } = setup();
    complete(matchUpId, drawId);
    expect(hydratedModifiers(matchUpId)).toBeUndefined();

    const reset: any = tournamentEngine.setMatchUpStatus({
      matchUpId,
      drawId,
      outcome: { score: undefined, winningSide: undefined, matchUpStatus: TO_BE_PLAYED },
    });
    expect(reset).toMatchObject(SUCCESS);
    expect(hydratedModifiers(matchUpId)).toEqual([FOLLOWED_BY]);
  });
});
