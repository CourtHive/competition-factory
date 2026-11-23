import { queryTournamentRecords } from './functions/queryTournamentRecords';
import { checkEngineError } from '@Server/common/errors/engineError';
import { executionQueue as eq } from './functions/executionQueue';
import { recordStorage } from '@Server/data/fileSystem';
import { askEngine } from '@Assemblies/engines/ask';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FactoryService {
  getVersion(): any {
    const version = askEngine.version();
    return { version };
  }

  async executionQueue(params) {
    const result = await eq(params);
    checkEngineError(result);
    return result;
  }

  async fetchTournamentRecords(params) {
    return await recordStorage.fetchTournamentRecords(params);
  }

  async generateTournamentRecord(params) {
    return recordStorage.generateTournamentRecord(params);
  }

  async queryTournamentRecords(params) {
    return await queryTournamentRecords(params);
  }

  async removeTournamentRecords(params) {
    return await recordStorage.removeTournamentRecords(params);
  }

  async saveTournamentRecords(params) {
    return await recordStorage.saveTournamentRecords(params);
  }
}
