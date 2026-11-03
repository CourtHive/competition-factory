import { asyncEngine, competitionEngineAsync, tournamentEngineAsync } from '../../index';

// Never executed. The lint regression loads this as a real typed consumer file.
export async function asyncConsumerLintFixture(): Promise<void> {
  competitionEngineAsync.addEvent({ event: { eventName: 'Example' } }); // floating
  tournamentEngineAsync.getCompetitionFormat(); // floating
  tournamentEngineAsync.calculateCapacityStats({}); // floating
  asyncEngine(true).getEvents(); // floating
  competitionEngineAsync.execute({ method: 'getEvents' }); // floating
  competitionEngineAsync.executionQueue([]); // floating
  competitionEngineAsync.waitFor('addMatchUps'); // floating

  competitionEngineAsync.getState();
  competitionEngineAsync.importMethods({});
  competitionEngineAsync.on('addMatchUps', () => undefined);
  await tournamentEngineAsync.getEvents();
  void tournamentEngineAsync.getEvents();
}
