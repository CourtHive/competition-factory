// The subpath's CommonJS declarations, under Node's own resolution and with no DOM lib.
import entry = require('tods-competition-factory/score-entry-state');

const model: entry.ScoreEntryModel = entry.createScoreEntryModel({ matchUpFormat: 'SET1-S:TB10' });
const sets: entry.ScoreEntrySet[] = entry.enteredSets(model);
export const read = sets.length;
