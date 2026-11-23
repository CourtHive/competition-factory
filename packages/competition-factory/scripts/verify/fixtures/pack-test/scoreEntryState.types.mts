// The subpath's ESM declarations, under Node's own resolution and with no DOM lib.
import { createScoreEntryModel, scoreEntryIssue, toEngineOutcome } from 'tods-competition-factory/score-entry-state';
import type { EngineOutcome, ScoreEntryIssue, ScoreEntryModel } from 'tods-competition-factory/score-entry-state';

const model: ScoreEntryModel = createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7' });
const issue: ScoreEntryIssue | undefined = scoreEntryIssue(model);
const outcome: EngineOutcome = toEngineOutcome({ cleared: true });
export const read = [issue?.code, outcome.score.sets.length] as const;
