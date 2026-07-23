import * as queryGovernor from '@Assemblies/governors/queryGovernor';
import * as readModel from '@Query/readModel';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// cast() must be reachable both on the engine (client: it injects the loaded
// tournamentRecord) and via queryGovernor with an explicit record (the server /
// rebuild-pipeline call pattern).
describe('cast governor/engine exposure', () => {
  it('is callable on the engine and through queryGovernor with matching rows', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 't1' },
      drawProfiles: [{ drawSize: 4, eventName: 'E1' }],
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);

    // engine path: tournamentRecord injected from loaded state
    const viaEngine = tournamentEngine.cast();
    expect(viaEngine.rows.tournaments[0].tournament_id).toEqual('t1');
    expect(viaEngine.rows.match_ups.length).toBeGreaterThan(0);

    // governor path with an explicit record (how the server / rebuild calls it)
    const { tournamentRecord: record } = tournamentEngine.getTournament();
    const viaGovernor = queryGovernor.cast({ tournamentRecord: record });
    expect(viaGovernor.rows.match_ups.length).toEqual(viaEngine.rows.match_ups.length);
    expect(viaGovernor.rows.match_up_competitors.length).toEqual(viaEngine.rows.match_up_competitors.length);
  });

  it('exposes the read-model builder toolkit for the incremental producer to share', () => {
    for (const fn of [
      readModel.cast,
      readModel.matchUpRowSet,
      readModel.matchUpResultRow,
      readModel.tournamentRow,
      readModel.venueRow,
      readModel.entryRows,
      readModel.rubberTieValue,
      readModel.resolveMatchUpPublishState,
      readModel.resolvePersonLink,
      readModel.isFactoryUuid,
    ]) {
      expect(typeof fn).toEqual('function');
    }
  });
});
