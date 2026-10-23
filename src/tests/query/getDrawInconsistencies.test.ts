import { WINNING_SIDE_ADVANCEMENT_MISMATCH } from '@Query/drawDefinition/getStructureInconsistencies';
import { getTargetLink } from '@Query/drawDefinition/linkGetter';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';
import {
  getDrawInconsistencies,
  DANGLING_LINK,
  INVALID_LINK,
  LINK_MISSING_SOURCE_ROUND,
  SCAN_ERROR,
} from '@Query/drawDefinition/getDrawInconsistencies';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  LOSER,
  DRAW,
} from '@Constants/drawDefinitionConstants';

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
    drawProfiles: [{ drawId, drawSize: drawSize as number, drawType: drawType as string }],
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
  expect(dangling.scope).toEqual(DRAW);
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

// the link checks, each on a draw generated well-formed and then corrupted (CA, 2026-10-22: none asserted
// LINK_MISSING_SOURCE_ROUND until now)
function linkedDraw(drawId: string) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: drawId }],
    setState: true,
  });
  return tournamentEngine.getEvent({ drawId }).drawDefinition;
}

const issueTypes = (result) => result.inconsistencies.map(({ issueType }) => issueType);

test('reports a WINNER or LOSER link with no source round as LINK_MISSING_SOURCE_ROUND', () => {
  const drawDefinition = linkedDraw('draw-missing-round');
  const link = drawDefinition.links.find(({ linkType }) => linkType === LOSER);
  for (const corruption of [
    () => Reflect.deleteProperty(link.source, 'roundNumber'),
    () => (link.source.roundNumber = 0),
  ]) {
    corruption();
    const result: any = getDrawInconsistencies({ drawDefinition });
    expect(result.valid).toEqual(false);
    const missing = result.inconsistencies.find(({ issueType }) => issueType === LINK_MISSING_SOURCE_ROUND);
    expect(missing).toMatchObject({
      sourceStructureId: link.source.structureId,
      targetStructureId: link.target.structureId,
      structureId: link.source.structureId,
      severity: 'error',
      linkType: LOSER,
      scope: DRAW,
    });
  }
});

test('a link that is both dangling and missing its source round is reported once, as DANGLING_LINK', () => {
  const drawDefinition = linkedDraw('draw-dangling-and-missing');
  const link = drawDefinition.links[0];
  Reflect.deleteProperty(link.source, 'roundNumber');
  link.target.structureId = 'no-such-structure';
  const result: any = getDrawInconsistencies({ drawDefinition });
  expect(issueTypes(result).filter((issueType) => issueType !== SCAN_ERROR)).toEqual([DANGLING_LINK]);
});

test('an entry of links that is not an object is reported as INVALID_LINK, and the scan reads the rest', () => {
  const drawDefinition = linkedDraw('draw-null-link');
  const loserLink = drawDefinition.links.find(({ linkType }) => linkType === LOSER);
  Reflect.deleteProperty(loserLink.source, 'roundNumber');
  drawDefinition.links.push(null, 7);

  const result: any = getDrawInconsistencies({ drawDefinition });
  expect(result.valid).toEqual(false);
  // reported, never thrown: no SCAN_ERROR, and the malformed link beside it is still found
  expect(issueTypes(result).sort()).toEqual([INVALID_LINK, INVALID_LINK, LINK_MISSING_SOURCE_ROUND]);
  const invalid = result.inconsistencies.filter(({ issueType }) => issueType === INVALID_LINK);
  expect(invalid.map(({ linkIndex, message }) => [linkIndex, message])).toEqual([
    [2, 'links[2] is not a link (null)'],
    [3, 'links[3] is not a link (number)'],
  ]);
  // the draw handed in is not changed by the scan
  expect(drawDefinition.links.length).toEqual(4);
});

test('getTargetLink passes over an entry that is not an object, and answers a malformed link with an error', () => {
  const drawDefinition = linkedDraw('draw-target-link');
  const [first, second] = drawDefinition.links;
  const source: any[] = [null, 'x', first];
  expect(getTargetLink({ source, linkType: LOSER })).toBe(first);
  Reflect.deleteProperty(second.source, 'roundNumber');
  const result: any = getTargetLink({
    source: [undefined, second] as any[],
    linkType: LOSER,
    linkCondition: second.linkCondition,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(getTargetLink({ source: [null] as any[], linkType: LOSER })).toBeUndefined();
});
