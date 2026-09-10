import { expect, test, describe } from 'vitest';

import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import { checkMatchUpIsComplete } from '@Query/matchUp/checkMatchUpIsComplete';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { MISSING_MATCHUPS, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Both of these are on the engine, and both took an OBJECT param the engine does not resolve.
 * `paramsMiddleware` turns `drawId` into a `drawDefinition` and stops — it does not turn `matchUpId`
 * into a matchUp, nor `drawId` into matchUps.
 *
 * So the engine-idiomatic call supplied nothing, and both answered anyway: `false` for a COMPLETED
 * matchUp, and an empty tally for a fully-played draw. No error, no `undefined` to guard, and in
 * both cases the wrong answer is the safe-looking one.
 *
 * These assert the refusal. They are written through `tournamentEngine` on purpose — the module-path
 * suites stayed green through the whole defect.
 */
describe('engine methods refuse rather than answer when their object param is absent', () => {
  test('checkMatchUpIsComplete: the engine-idiomatic call refuses, the correct call still answers', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
      setState: true,
    });
    const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const matchUp = matchUps.find((m: any) => m.matchUpStatus === COMPLETED);
    expect(matchUp).toBeDefined();

    // the correct call — unchanged
    expect(tournamentEngine.checkMatchUpIsComplete({ matchUp })).toBe(true);

    // what a consumer would naturally write. Was `false` for this COMPLETED matchUp.
    const byIds: any = tournamentEngine.checkMatchUpIsComplete({ matchUpId: matchUp.matchUpId, drawId });
    expect(byIds.error).toEqual(MISSING_MATCHUP);
  });

  test('getParticipantResults: the engine-idiomatic call refuses, the correct call still tallies', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
      setState: true,
    });
    const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // the correct call — in-context matchUps, results attributed through sides[].participantId
    const correct: any = tournamentEngine.getParticipantResults({ matchUps });
    expect(Object.keys(correct.participantResults).length).toBeGreaterThan(0);

    // was `{ participantResults: {} }` — an empty tally for a played draw
    const byId: any = tournamentEngine.getParticipantResults({ drawId });
    expect(byId.error).toEqual(MISSING_MATCHUPS);
  });

  test('the refusal is an OBJECT, so it is truthy — the trap the internal callers had to guard', () => {
    // Documents why every internal call site filters the entry before calling: a naive
    // `.filter((m) => checkMatchUpIsComplete({ matchUp: m }))` would now count refusals as complete.
    const refusal: any = checkMatchUpIsComplete({ matchUp: undefined });
    expect(refusal.error).toEqual(MISSING_MATCHUP);
    expect(Boolean(refusal)).toBe(true);
  });

  test('an empty matchUps array is a valid question with an empty answer, not a refusal', () => {
    // The guard is on the ARGUMENT being absent, not on it being empty. A draw with no matchUps
    // legitimately tallies to nothing, and that must stay distinguishable from "you passed nothing".
    const result: any = getParticipantResults({ matchUps: [] });
    expect(result.error).toBeUndefined();
    expect(result.participantResults).toEqual({});
  });
});
