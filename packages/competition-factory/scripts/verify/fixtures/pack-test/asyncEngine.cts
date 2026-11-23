import { competitionEngineAsync } from 'tods-competition-factory';
import type { AsyncFactoryEngine } from 'tods-competition-factory';

const engine: AsyncFactoryEngine = competitionEngineAsync;
const result: Promise<unknown> = engine.getCompetitionFormat();
const state = engine.getState().tournamentRecords;
// @ts-expect-error The require condition must also expose Promise-returning methods.
engine.getCompetitionFormat().competitionFormat;
void [result, state];
