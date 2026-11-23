import { tournamentEngine, tournamentEngineAsync } from '../index';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

afterEach(() => setStateProvider(syncGlobalState));

it('reads, builds and inspects only the calling request across overlapping provider scopes', async () => {
  setStateProvider(asyncGlobalState);

  const request = (id: string, topic: 'modifyMatchUp' | 'modifyDrawDefinition') =>
    asyncGlobalState.runWithInstanceState(async () => {
      tournamentEngine.setState({ tournamentId: id, tournamentName: id });
      setSubscriptions({ subscriptions: { [topic]: () => undefined } });
      const event = tournamentEngine.build.event({ eventName: id }).singles();
      const competitor = tournamentEngine.build.participant().individual({ givenName: id, familyName: 'Player' });

      // Both requests have installed a record and staged their own builders before either queue runs.
      await Promise.resolve();
      expect(tournamentEngine.q.tournament()?.tournamentId).toBe(id);
      expect(tournamentEngine.q.events()).toEqual([]);
      const addedEvent = event.create();
      const addedParticipant = competitor.create();
      expect(addedEvent.success).toBe(true);
      expect(addedParticipant.success).toBe(true);

      // Both queues have finished before either request checks its visible records and topics.
      await Promise.resolve();
      expect(tournamentEngine.q.events().map((entry) => entry.eventId)).toEqual([addedEvent.eventId]);
      expect(tournamentEngine.q.participants().map((entry) => entry.participantId)).toEqual([
        addedParticipant.participantId,
      ]);
      const inspection = tournamentEngineAsync.inspect();
      expect(inspection.loaded).toMatchObject({
        currentTournamentId: id,
        tournamentIds: [id],
        counts: { tournaments: 1, events: 1, participants: 1 },
      });
      expect(inspection.subscriptions.topics).toContain(topic);
      expect(inspection.subscriptions.topics).not.toContain(
        topic === 'modifyMatchUp' ? 'modifyDrawDefinition' : 'modifyMatchUp',
      );
    });

  await Promise.all([request('first', 'modifyMatchUp'), request('second', 'modifyDrawDefinition')]);
});
