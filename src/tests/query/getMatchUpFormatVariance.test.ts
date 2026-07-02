import { getMatchUpFormatVariance } from '@Query/drawDefinition/getMatchUpFormatVariance';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION, CONSOLATION } from '@Constants/drawDefinitionConstants';

const BASELINE = 'SET3-S:6/TB7';
const SHORTENED = 'SET1-S:6/TB7';
const FINAL_TB = 'SET3-S:6/TB7-F:TB10'; // deciding set played as a 10-point match tiebreak

test('a draw with a single uniform matchUpFormat reports no variance', () => {
  setSubscriptions({});
  const drawId = 'uniform';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: SINGLE_ELIMINATION, matchUpFormat: BASELINE }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const result: any = getMatchUpFormatVariance({ drawDefinition });
  expect(result.hasVariance).toEqual(false);
  expect(result.variance.structures).toEqual([]);
  expect(result.variance.crossStructureVariance).toEqual(false);
});

test('a mid-structure round that departs from the format and reverts is flagged (weather signal)', () => {
  setSubscriptions({});
  const drawId = 'weather';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: SINGLE_ELIMINATION, matchUpFormat: BASELINE, idPrefix: 'w' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  // storm shortened round 2 only; rounds 1, 3, 4 stay on the baseline
  structure.matchUps.filter((m) => m.roundNumber === 2).forEach((m) => (m.matchUpFormat = SHORTENED));

  const result: any = getMatchUpFormatVariance({ drawDefinition });
  expect(result.hasVariance).toEqual(true);
  const sv = result.variance.structures.find((s) => s.structureId === structure.structureId);
  expect(sv.baselineFormat).toEqual(BASELINE);
  expect(sv.distinctFormats.sort()).toEqual([SHORTENED, BASELINE].sort());
  expect(sv.withinStructureVariance).toEqual(true);
  expect(sv.revertPattern).toEqual(true);
  const round2 = sv.rounds.find((r) => r.roundNumber === 2);
  expect(round2.differsFromBaseline).toEqual(true);
  expect(round2.formats).toEqual([SHORTENED]);
  const round3 = sv.rounds.find((r) => r.roundNumber === 3);
  expect(round3.differsFromBaseline).toEqual(false);
});

test('a mid-structure switch to a match-tiebreak final set is material (duration-changing)', () => {
  // SET3-S:6/TB7 -> SET3-S:6/TB7-F:TB10 keeps best-of-3 and 6-game sets, but makes the deciding
  // set a 10-point tiebreak — shorter if the match goes the distance. That is a real format change.
  setSubscriptions({});
  const drawId = 'finalTb';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: SINGLE_ELIMINATION, matchUpFormat: BASELINE, idPrefix: 'ft' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  structure.matchUps.filter((m) => m.roundNumber === 2).forEach((m) => (m.matchUpFormat = FINAL_TB));

  const result: any = getMatchUpFormatVariance({ drawDefinition });
  expect(result.hasVariance).toEqual(true);
  const sv = result.variance.structures.find((s) => s.structureId === structure.structureId);
  expect(sv.distinctFormats.sort()).toEqual([FINAL_TB, BASELINE].sort());
  expect(sv.rounds.find((r) => r.roundNumber === 2).differsFromBaseline).toEqual(true);
  expect(sv.revertPattern).toEqual(true);
});

test('cross-structure format difference (consolation shorter) is informational, not within-structure variance', () => {
  setSubscriptions({});
  const drawId = 'consolation';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION, matchUpFormat: BASELINE }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  // the consolation structure deliberately plays a shorter format (uniformly) — stored as a
  // matchUp-level format on every consolation matchUp
  const consolation = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
  consolation.matchUps.forEach((m) => (m.matchUpFormat = SHORTENED));

  const result: any = getMatchUpFormatVariance({ drawDefinition });
  // each structure is internally uniform, so nothing is flagged as within-structure variance
  expect(result.hasVariance).toEqual(false);
  expect(result.variance.structures).toEqual([]);
  // but the cross-structure difference is surfaced informationally
  expect(result.variance.crossStructureVariance).toEqual(true);
  expect(result.variance.crossStructureFormats.sort()).toEqual([SHORTENED, BASELINE].sort());
});

test('structureId scopes within-structure analysis to a single structure', () => {
  setSubscriptions({});
  const drawId = 'scoped';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION, matchUpFormat: BASELINE }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const main = drawDefinition.structures[0];
  main.matchUps.filter((m) => m.roundNumber === 2).forEach((m) => (m.matchUpFormat = SHORTENED));
  const consolation = drawDefinition.structures.find((s) => s.stage === CONSOLATION);

  const scopedToConsolation: any = getMatchUpFormatVariance({ drawDefinition, structureId: consolation.structureId });
  expect(scopedToConsolation.variance.structures).toEqual([]); // the varying structure is MAIN, excluded

  const scopedToMain: any = getMatchUpFormatVariance({ drawDefinition, structureId: main.structureId });
  expect(scopedToMain.variance.structures.length).toEqual(1);
  expect(scopedToMain.variance.structures[0].structureId).toEqual(main.structureId);
});
