import { WINNING_SIDE_ADVANCEMENT_MISMATCH } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawInconsistencies, DANGLING_LINK } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

// Corpus sweep — the primary defence against false positives. No legitimately-generated,
// fully-completed draw may report anything, across draw types that carry cross-structure links.
test.for([
  [SINGLE_ELIMINATION, 8],
  [SINGLE_ELIMINATION, 32],
  [FIRST_MATCH_LOSER_CONSOLATION, 8],
  [FIRST_MATCH_LOSER_CONSOLATION, 16],
  [FIRST_MATCH_LOSER_CONSOLATION, 32],
  [COMPASS, 16],
  [COMPASS, 32],
  [ROUND_ROBIN_WITH_PLAYOFF, 16],
])('corpus sweep: %s drawSize %d completes with zero draw inconsistencies', ([drawType, drawSize]) => {
  setSubscriptions({});
  const drawId = `draw-sweep-${drawType}-${drawSize}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
});

test('fan-out preserves the leaf propagated-exit guard (upstream double-walkover stays valid)', () => {
  // §3: a main-draw DOUBLE_WALKOVER feeds an empty loser slot into consolation, which the engine
  // legitimately resolves to a propagated WALKOVER. The leaf excludes it; the draw layer must not
  // reintroduce a false positive when fanning out.
  setSubscriptions({});
  const drawId = 'draw-producedExit';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'pe',
        outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
});

test('detects a dangling link pointing at a structure not in the draw (without crashing the scan)', () => {
  setSubscriptions({});
  const drawId = 'draw-dangling';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'dl' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  drawDefinition.links[0].target.structureId = 'no-such-structure';

  const result: any = getDrawInconsistencies({ drawDefinition });
  expect(result.valid).toEqual(false);
  const dangling = result.inconsistencies.find((i) => i.issueType === DANGLING_LINK);
  expect(dangling).toBeTruthy();
  expect(dangling.severity).toEqual('error');
  expect(dangling.scope).toEqual('DRAW');
  expect(dangling.targetStructureId).toEqual('no-such-structure');
});

test('fans out structure-level inconsistencies with drawId + fingerprint stamped', () => {
  setSubscriptions({});
  const drawId = 'draw-fanout';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'fo' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const r1 = structure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1 && m.winningSide);
  r1.winningSide = r1.winningSide === 1 ? 2 : 1;

  const result: any = getDrawInconsistencies({ drawDefinition });
  const mismatch = result.inconsistencies.find((i) => i.matchUpId === r1.matchUpId);
  expect(mismatch?.issueType).toEqual(WINNING_SIDE_ADVANCEMENT_MISMATCH);
  // structure-scoped issue keeps its scope but is stamped with draw provenance + fingerprint
  expect(mismatch.scope).toEqual('STRUCTURE');
  expect(mismatch.drawId).toEqual(drawId);
  expect(typeof mismatch.fingerprint).toEqual('string');
});
