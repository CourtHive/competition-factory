// Shared by the CJS and ESM runtime smokes of `tods-competition-factory/score-entry-state`: given the module, hold two
// score states at once, with no DOM and no engine, and prove neither sees the other.
// Exported as a function of the module so each format loads it its own way.
function exerciseScoreStates(entry) {
  const fail = (message) => {
    throw new Error(`score-entry-state: ${message}`);
  };
  if (typeof globalThis.document !== 'undefined' || typeof globalThis.window !== 'undefined')
    fail('this smoke must run with no DOM');

  const G = (setIndex, side) => ({ setIndex, side, kind: 'games' });
  const blank = entry.createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7' });
  const frozen = JSON.stringify(blank);

  let first = entry.typeDigit(blank, { cell: G(0, 1), digit: 4, complement: true });
  first = entry.typeDigit(first, { cell: G(1, 1), digit: 3, complement: true });
  let second = entry.createScoreEntryModel({ matchUpFormat: 'SET1-S:TB10' });
  second = entry.chooseEnding(second, { kind: 'side', sideNumber: 2, status: 'WALKOVER' });

  if (JSON.stringify(blank) !== frozen) fail('a transition wrote into the score state it was given');
  if (entry.scoreString(first) !== '4-6 3-6') fail(`first score state reads ${entry.scoreString(first)}`);
  if (entry.winningSide(first) !== 2 || entry.matchUpStatus(first) !== 'COMPLETED')
    fail('first score state is not decided');
  if (entry.hasEntry(second) || entry.winningSide(second) !== 1) fail('second score state saw the first');
  if (entry.typeDigit(first, { cell: G(5, 1), digit: 1 }) !== first) fail('a refused transition must return its input');

  const view = { model: first };
  const gate = entry.clearGate({ openedOnRecordedOutcome: false, cleared: false, holdsEntry: entry.holdsEntry(view) });
  const outcome = entry.toEngineOutcome({ ...entry.submission(view, gate, {}), sets: entry.enteredSets(first) });
  if (outcome.matchUpStatus !== 'COMPLETED' || outcome.winningSide !== 2 || outcome.score.sets.length !== 2)
    fail(`outcome ${JSON.stringify(outcome)}`);
  const clear = entry.toEngineOutcome({ cleared: true });
  if (JSON.stringify(clear) !== '{"score":{"sets":[]},"clearStatusCodes":true}') fail('clear outcome');
  // The format editor and free-score adapter consume these narrow operations in both module formats.
  const code = 'SET3-S:6NOAD/TB7-F:TB10';
  const format = entry.parseMatchUpFormat(code);
  if (entry.stringifyMatchUpFormat(format) !== code) fail('format editor codec');
  if (!entry.finalSetGoverns(format, 3, true)) fail('deciding-set format');
  if (typeof entry.aggregateDeciderSetNumber !== 'function') fail('aggregate decider export');
  if (!entry.checkSetIsComplete({ set: { side1Score: 6, side2Score: 4 }, matchUpScoringFormat: format }))
    fail('canonical set completion');
  const retained = entry.retainScoreForFormat({
    sets: [{ setNumber: 1, side1Score: 6, side2Score: 4 }],
    previousMatchUpFormat: 'SET3-S:6/TB7',
    matchUpFormat: code,
  });
  if (retained.sets.length !== 1 || retained.discarded.length) fail('format retention');
  return Object.keys(entry).length;
}

module.exports = { exerciseScoreStates };
