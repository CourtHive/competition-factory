const assert = require('node:assert/strict');

function exerciseQueryFootprints(factory) {
  const { tools, mocksEngine, tournamentEngine } = factory;
  assert.equal(typeof tools.getQueryFootprint, 'function');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 20261121,
    setState: true,
    eventProfiles: [
      {
        eventId: 'E1',
        drawProfiles: [
          { drawId: 'D1', drawSize: 4 },
          { drawId: 'D2', drawSize: 4 },
        ],
      },
      { eventId: 'E2', drawProfiles: [{ drawId: 'D3', drawSize: 4 }] },
    ],
  });
  const match = tournamentEngine.allTournamentMatchUps().matchUps.find((item) => item.drawId === 'D1');
  const params = { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId };
  const footprint = tools.getQueryFootprint({ methods: [{ method: 'matchUpActions', params }] });
  assert.equal(footprint.tournament, false);
  const partial = tools.reduceRecordToFootprint({ tournamentRecord, footprint });
  assert.deepEqual(
    partial.events.flatMap((event) => event.drawDefinitions ?? []).map((draw) => draw.drawId),
    ['D1', 'D2'],
  );
  tournamentEngine.setState(partial);
  tournamentEngine.loadedFootprint(footprint);
  assert.equal(tournamentEngine.matchUpActions(params).error, undefined);
  const insufficient = { ...footprint, shards: footprint.shards.filter((shard) => shard !== 'participants') };
  tournamentEngine.setState(tools.reduceRecordToFootprint({ tournamentRecord, footprint: insufficient }));
  tournamentEngine.loadedFootprint(insufficient);
  assert.equal(tournamentEngine.matchUpActions(params).error?.code, 'ERR_FOOTPRINT_NOT_LOADED');
  tournamentEngine.reset();
}

module.exports = { exerciseQueryFootprints };
