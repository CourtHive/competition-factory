import { generateTournamentRecord } from './generateTournamentRecord';
import { removeTournamentRecords } from './removeTournamentRecords';
import { fetchTournamentRecords } from './fetchTournamentRecords';
import { saveTournamentRecords } from './saveTournamentRecords';
import { findTournamentRecord } from './findTournamentRecord';

export const recordStorage = {
  generateTournamentRecord,
  removeTournamentRecords,
  fetchTournamentRecords,
  saveTournamentRecords,
  findTournamentRecord,
};

export default recordStorage;
