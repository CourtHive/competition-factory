import { setStateProvider, setSubscriptions } from '@Global/state/globalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { DELETED_DRAW_IDS } from '@Constants/topicConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

it('can set state provider', () => {
  let result: any = setStateProvider(syncGlobalState);
  expect(result.success).toEqual(true);

  try {
    result = setStateProvider();
  } catch (err) {
    expect(err).not.toBeUndefined();
  }
  try {
    result = setStateProvider({});
  } catch (err) {
    expect(err).not.toBeUndefined();
  }

  const allParticipants: any[] = [];

  const subscriptions = {
    addParticipants: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ participants }) => {
          allParticipants.push(...participants);
        });
      }
    },
  };

  result = setSubscriptions({ subscriptions });
  expect(result.success).toEqual(true);

  const { tournamentId } = tournamentEngine.newTournamentRecord();
  const participant = {
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  result = tournamentEngine.setState();
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.removeTournamentRecord();
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.addParticipant({ participant });
  expect(result.success).toEqual(true);
  expect(allParticipants.length).toEqual(1);

  tournamentEngine.removeTournamentRecord(tournamentId);
});

test('state provider implementation of handleCaughtError', () => {
  let tournamentRecordsCount = 0;
  const errorInstances: any[] = [];

  function handleCaughtError({ engineName, methodName, params, err }) {
    let error;
    if (typeof err === 'string') {
      error = err.toUpperCase();
    } else if (err instanceof Error) {
      error = err.message;
    }

    const tournamentId = syncGlobalState.getTournamentId();
    const tournamentRecord = syncGlobalState.getTournamentRecord(tournamentId);
    if (tournamentRecord?.tournamentId === tournamentId) {
      tournamentRecordsCount += 1;
    }

    errorInstances.push({
      params: Object.keys(params),
      tournamentId,
      engineName,
      methodName,
      error,
    });
  }

  const addNotice = ({ topic }) => {
    if (topic === DELETED_DRAW_IDS) throw new Error('Global state provider error');
  };

  const result: any = setStateProvider({
    ...syncGlobalState,
    handleCaughtError,
    addNotice,
  });
  expect(result.success).toEqual(true);

  expect(tournamentRecordsCount).toEqual(0);
  expect(errorInstances.length).toEqual(0);

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'tournamentId' },
    drawProfiles: [{ drawSize: 4 }],
  });
  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.deleteDrawDefinitions({ drawIds: [drawId] });

  expect(tournamentRecordsCount).toEqual(1);
  expect(errorInstances).toEqual([
    {
      tournamentId: 'tournamentId',
      engineName: 'engine',
      methodName: 'deleteDrawDefinitions',
      params: ['drawIds', 'activeTournamentId'],
      error: 'Global state provider error',
    },
  ]);
});
