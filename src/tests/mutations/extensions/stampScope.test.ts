import tournamentSchema from '@Global/schema/tournament.schema.json';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { STAMP_SCOPE_MODIFIED, STAMP_SCOPE_TOURNAMENT } from '@Constants/stampScopeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(ajv);
const validate = ajv.compile(tournamentSchema);

const outcome = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 2, winningSide: 1 },
    ],
  },
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
};

function load() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        eventId: 'E1',
        drawProfiles: [
          { drawId: 'D1', drawSize: 8 },
          { drawId: 'D2', drawSize: 8 },
        ],
      },
    ],
    participantsProfile: { participantsCount: 32 },
    nonRandom: 1,
  });
  // a record as stored: with no factory stamp of its own yet
  delete tournamentRecord.factory;
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: ['D1'] } });
  return { matchUpId: matchUps.find((m: any) => m.roundNumber === 1).matchUpId };
}

const state = () => {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const draws = Object.fromEntries(tournamentRecord.events[0].drawDefinitions.map((d: any) => [d.drawId, d]));
  return { tournamentRecord, draws };
};

describe('stampScope', () => {
  it('stamps the tournament by default, whatever changed, and no draw', () => {
    expect(tournamentEngine.getStampScope()).toEqual(STAMP_SCOPE_TOURNAMENT);
    const { matchUpId } = load();
    const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'D1', matchUpId, outcome });
    expect(result.success).toEqual(true);
    const { tournamentRecord, draws } = state();
    expect(tournamentRecord.factory.version).toEqual(factoryVersion());
    expect(draws.D1.factory).toBeUndefined();
    expect(draws.D2.factory).toBeUndefined();
  });

  it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2])(
    "'modified' stamps only the draw a score entry changed (%s)",
    (pipeline) => {
      let result: any = tournamentEngine.stampScope(STAMP_SCOPE_MODIFIED);
      expect(result.success).toEqual(true);
      tournamentEngine.outcomePipeline(pipeline);
      const { matchUpId } = load();

      result = tournamentEngine.setMatchUpStatus({ drawId: 'D1', matchUpId, outcome });
      expect(result.success).toEqual(true);
      const { tournamentRecord, draws } = state();
      expect(draws.D1.factory.version).toEqual(factoryVersion());
      expect(typeof draws.D1.factory.timeStamp).toEqual('number');
      expect(draws.D2.factory).toBeUndefined();
      expect(tournamentRecord.factory).toBeUndefined();

      const valid = validate(tournamentRecord);
      expect({ valid, errors: ajv.errorsText(validate.errors) }).toEqual({ valid: true, errors: 'No errors' });

      tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
      tournamentEngine.stampScope();
    },
  );

  it("'modified' stamps the tournament for a change outside its draws, and both for a queue that makes both", () => {
    tournamentEngine.stampScope(STAMP_SCOPE_MODIFIED);
    const { matchUpId } = load();

    let result: any = tournamentEngine.setTournamentName({ tournamentName: 'Renamed' });
    expect(result.success).toEqual(true);
    let { tournamentRecord, draws } = state();
    expect(tournamentRecord.factory.version).toEqual(factoryVersion());
    expect(draws.D1.factory).toBeUndefined();

    load();
    result = tournamentEngine.executionQueue([
      { method: 'setMatchUpStatus', params: { drawId: 'D1', matchUpId, outcome } },
      { method: 'setTournamentName', params: { tournamentName: 'Renamed' } },
    ]);
    expect(result.success).toEqual(true);
    ({ tournamentRecord, draws } = state());
    expect(tournamentRecord.factory.version).toEqual(factoryVersion());
    expect(draws.D1.factory.version).toEqual(factoryVersion());
    expect(draws.D2.factory).toBeUndefined();

    tournamentEngine.stampScope();
  });

  it('refuses an unknown scope, and returns to the tournament with none', () => {
    let result: any = tournamentEngine.stampScope('everything' as any);
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.stampScope(STAMP_SCOPE_MODIFIED);
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getStampScope()).toEqual(STAMP_SCOPE_MODIFIED);
    result = tournamentEngine.stampScope();
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getStampScope()).toEqual(STAMP_SCOPE_TOURNAMENT);
  });
});
