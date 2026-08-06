import { tournamentEngineAsync, competitionEngineAsync } from '@Engines/asyncEngine';
import { setStateProvider, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import asyncGlobalState from '../asyncEngine/asyncGlobalState';

/**
 * Example of how a server consumer uses asyncGlobalState.
 *
 * Engine state lives in the async context established by `runWithInstanceState`, so each
 * request/mutation gets its own `tournamentRecords`, `subscriptions` and `notices`.
 *
 * This test carried `// NOTE: won't run on vitest > 0.27.3` and was skipped for years. That was a
 * misdiagnosis — vitest was never the problem. It had rotted in three independent ways: the engines
 * and mocksEngine were imported from `@Global/state/globalState`, which does not export them;
 * nothing established an instance context; and the assertions had drifted from current behaviour
 * (`setTournamentId()` with no argument now clears the id and succeeds). See #4564.
 */

const ssp = setStateProvider(asyncGlobalState);

it('can use the async state provider end to end', async () => {
  expect(ssp.success).toEqual(true);

  await asyncGlobalState.runWithInstanceState(async () => {
    const allMatchUps = [];
    const auditNotices = [];
    const allParticipants = [];
    const modifiedMatchUps = [];
    const allDeletedMatchUpIds = [];

    // no-argument setTournamentId clears the active id
    let result = await tournamentEngineAsync.setTournamentId();
    expect(result.success).toEqual(true);

    result = await competitionEngineAsync.setTournamentRecord();
    expect(result.error).not.toBeUndefined();

    result = await competitionEngineAsync.reset();
    expect(result.success).toEqual(true);

    result = await tournamentEngineAsync.version();
    expect(result).not.toBeUndefined();

    result = await competitionEngineAsync.removeTournamentRecord();
    expect(result.error).not.toBeUndefined();

    result = await competitionEngineAsync.removeTournamentRecord('bogusId');
    expect(result.error).not.toBeUndefined();

    const subscriptions = {
      audit: (notices) => auditNotices.push(...notices),
      addMatchUps: (added) => added.forEach(({ matchUps }) => allMatchUps.push(...matchUps)),
      modifyMatchUp: (modified) => modified.forEach(({ matchUp }) => modifiedMatchUps.push(matchUp)),
      deletedMatchUpIds: (deleted) => deleted.forEach(({ matchUpIds }) => allDeletedMatchUpIds.push(...matchUpIds)),
      addParticipants: (added) => added.forEach(({ participants }) => allParticipants.push(...participants)),
    };
    setSubscriptions({ subscriptions });

    result = await tournamentEngineAsync.newTournamentRecord();
    expect(result.success).toEqual(true);
    expect(result.tournamentId).not.toBeUndefined();

    // getState resolves to { tournamentId, tournamentRecords } — there is no singular
    // `tournamentRecord` on the async engine's state
    const state = await tournamentEngineAsync.getState();
    let tournamentRecord = state.tournamentRecords[state.tournamentId];
    expect(tournamentRecord).not.toBeUndefined();

    result = await tournamentEngineAsync.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    let drawId, eventId;
    const participantsCount = 37;
    const drawSize = 8;
    ({
      tournamentRecord,
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount },
      drawProfiles: [{ drawSize }],
    }));

    expect(allMatchUps.length).toEqual(drawSize - 1);
    expect(allParticipants.length).toEqual(participantsCount);

    result = await competitionEngineAsync.setTournamentRecord(tournamentRecord);
    expect(result.success).toEqual(true);

    result = await tournamentEngineAsync.setTournamentId(tournamentRecord.tournamentId);
    expect(result.success).toEqual(true);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '7-5 7-5',
      winningSide: 1,
    });

    result = await tournamentEngineAsync.setMatchUpStatus({
      matchUpId: allMatchUps[0].matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(modifiedMatchUps.length).toBeGreaterThan(0);

    // the draw now has a scored matchUp; deletion requires an explicit force (SCORES_PRESENT guard)
    result = await tournamentEngineAsync.deleteDrawDefinitions({ drawIds: [drawId], eventId, force: true });
    expect(result.success).toEqual(true);
    expect(auditNotices.length).toEqual(1);
    expect(allDeletedMatchUpIds.length).toEqual(drawSize - 1);

    const { tournamentRecords } = await competitionEngineAsync.getState();
    expect(Object.keys(tournamentRecords).length).toBeGreaterThan(0);

    result = setSubscriptions('not an object');
    expect(result.error).not.toBeUndefined();
  });
});
