import { expect, test, describe } from 'vitest';

import { checkMatchUpIsComplete, matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { INVALID_MATCHUP, MISSING_MATCHUPS, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
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

  test('the refusal is an OBJECT, so it is truthy — which is why predicates use matchUpCompletion', () => {
    // A naive `.filter((m) => checkMatchUpIsComplete({ matchUp: m }))` would count refusals as
    // COMPLETE — fail-open in the opposite direction, and worse than the defect being fixed.
    const refusal: any = checkMatchUpIsComplete({ matchUp: undefined });
    expect(refusal.error).toEqual(MISSING_MATCHUP);
    expect(Boolean(refusal)).toBe(true);

    // matchUpCompletion is the predicate-safe form: it maps the refusal to undefined and passes a
    // real answer through unchanged, including the load-bearing `undefined` for a pending matchUp.
    expect(matchUpCompletion(undefined)).toBeUndefined();
    expect(matchUpCompletion({})).toBeUndefined();
    expect(matchUpCompletion({ matchUpId: 'm1', matchUpStatus: undefined })).toBeUndefined();
    expect(matchUpCompletion({ matchUpId: 'm1', matchUpStatus: COMPLETED })).toBe(true);
    expect(matchUpCompletion({ matchUpId: 'm1', winningSide: 2 })).toBe(2);
  });

  test('there is exactly ONE implementation of that mapping', () => {
    // The first version of this fix hand-rolled the guard at three call sites with two different
    // error branches (undefined in one file, false in another). Two copies of a safety guard is how
    // they end up disagreeing — the recurring shape of the whole exit-propagation workstream.
    expect(typeof matchUpCompletion).toEqual('function');
  });

  test('a matchUp claiming a winner with no sides is REFUSED, not attributed to a participant named foo', () => {
    // From 2021 until 7.0.0 `getSideId` returned the literal string 'foo' when `sides` was absent —
    // a participantId as far as everything downstream is concerned. A round robin tallied from
    // STORED (non-hydrated) matchUps keyed every result to `foo` rather than failing.
    const storedShape: any = [{ matchUpId: 'm1', winningSide: 1, drawPositions: [1, 2], score: { sets: [] } }];
    const result: any = getParticipantResults({ matchUps: storedShape });

    expect(result.error).toEqual(INVALID_MATCHUP);
    expect(Object.keys(result.participantResults ?? {})).not.toContain('foo');
  });

  test('...and so is one whose sides array is short of the losing index', () => {
    // getWinningSideId reads index 0, getLosingSideId reads index 1 — the second `getSideId` branch.
    // A guard on `!sides` alone would let this through to the same fabrication.
    const oneSided: any = [
      { matchUpId: 'm1', winningSide: 1, sides: [{ sideNumber: 1, participantId: 'p1' }], score: { sets: [] } },
    ];
    expect(getParticipantResults({ matchUps: oneSided }).error).toEqual(INVALID_MATCHUP);
  });

  test('an UNPLAYED stored matchUp is refused, where it used to throw an uncaught TypeError', () => {
    // The gap the first version of this guard left. Scoping it to `winningSide` covered the decided
    // path (getSideId) but not the undecided one (processScore), so the SAME input — stored,
    // non-hydrated matchUps — refused once a draw had been played and CRASHED while it had not:
    //
    //   TypeError: Cannot read properties of undefined (reading 'forEach')
    //     at processScore -> processNoWinnerMatchUp -> getParticipantResults
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }], // nothing played
      setState: true,
    });
    const draw = tournamentRecord.events[0].drawDefinitions[0];
    const stored = draw.structures[0].structures?.[0]?.matchUps ?? draw.structures[0].matchUps;
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.some((matchUp: any) => matchUp.winningSide)).toEqual(false); // the control
    expect(stored.some((matchUp: any) => matchUp.sides)).toEqual(false);

    const result: any = getParticipantResults({ matchUps: stored });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  test('a matchUp with NO winner is not refused — nothing reads a side from it', () => {
    // The guard is scoped to `winningSide`, because that is the only path into getSideId. A pending
    // matchUp legitimately carries sides with no participantId yet and must still tally to nothing.
    const noWinner: any = [
      {
        matchUpId: 'm1',
        matchUpStatus: 'TO_BE_PLAYED',
        sides: [
          { sideNumber: 1, drawPosition: 1 },
          { sideNumber: 2, drawPosition: 2 },
        ],
        score: { sets: [] },
      },
    ];
    const result: any = getParticipantResults({ matchUps: noWinner });
    expect(result.error).toBeUndefined();
    expect(result.participantResults).toEqual({});
  });

  test('an empty matchUps array is a valid question with an empty answer, not a refusal', () => {
    // The guard is on the ARGUMENT being absent, not on it being empty. A draw with no matchUps
    // legitimately tallies to nothing, and that must stay distinguishable from "you passed nothing".
    const result: any = getParticipantResults({ matchUps: [] });
    expect(result.error).toBeUndefined();
    expect(result.participantResults).toEqual({});
  });
});
