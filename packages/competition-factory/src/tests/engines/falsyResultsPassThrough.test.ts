import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setStateProvider } from '@Global/state/globalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import { expect, it } from 'vitest';

// A method that answers with nothing (undefined or null) is answered with nothing. Both engines turned it into `{}`,
// which is truthy: `if (engine.checkMatchUpIsComplete({ matchUp }))` read an unfinished matchUp as complete, and a
// signed-out participant's sign-in status looked like a value.
it('the sync engine returns a method’s undefined result as undefined, not {}', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  tournamentEngine.setState(tournamentRecord);

  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.roundNumber === 2);
  expect(matchUp.winningSide).toBeUndefined();
  expect(tournamentEngine.checkMatchUpIsComplete({ matchUp })).toBeFalsy();

  const { participantId } = tournamentEngine.getParticipants().participants[0];
  expect(tournamentEngine.getParticipantSignInStatus({ participantId })).toBeUndefined();
});

it('the async engine returns a method’s undefined result as undefined, not {}', async () => {
  setStateProvider(asyncGlobalState);
  try {
    const answered = await asyncGlobalState.runWithInstanceState(async () => {
      asyncEngine.importMethods({ answersNothing: async () => undefined });
      await asyncEngine.setState([{ tournamentId: 'falsy-results', tournamentName: 'falsy-results' }]);
      return asyncEngine.answersNothing();
    });
    expect(answered).toBeUndefined();
  } finally {
    setStateProvider(syncGlobalState);
  }
});
