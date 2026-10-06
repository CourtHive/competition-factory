import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  LOSER,
  SINGLE_ELIMINATION,
  WINNER,
} from '@Constants/drawDefinitionConstants';

/**
 * A MALFORMED ROUND LINK IS AN ERROR (CA, 2026-10-06, decision 1 of FACTORY_LATENT_BUG_FIXES).
 *
 * A WINNER or LOSER link with no `source.roundNumber` cannot say which round it directs. `getTargetLink` answered
 * it with an `INVALID_VALUES` error in place of the link, `positionTargets` passed that on as a target link, and
 * `getTargetMatchUp` read `.target` off it and threw a TypeError: every engine call that directed a participant
 * along it failed with "Cannot read properties of undefined (reading 'structureId')". `positionTargets` now
 * returns the error, and every caller returns it. A draw that simply has no such link is unaffected.
 *
 * Each draw is generated well-formed and one stored link is then corrupted by deleting its `source.roundNumber`.
 */

const set = { side1Score: 6, side2Score: 3, winningSide: 1 };
const outcome = { winningSide: 1, score: { sets: [set, { ...set, setNumber: 2 }] } };

function corruptedDraw({
  structureName,
  linkType,
  drawType,
}: {
  structureName?: string;
  linkType: string;
  drawType: string;
}) {
  setSubscriptions({});
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawType }], setState: false });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const sourceStructureId = drawDefinition.structures.find(
    (structure) => !structureName || structure.structureName === structureName,
  ).structureId;
  const link = drawDefinition.links.find(
    (candidate) => candidate.linkType === linkType && candidate.source.structureId === sourceStructureId,
  );
  expect(link).toBeDefined();
  Reflect.deleteProperty(link.source, 'roundNumber');
  tournamentEngine.setState(tournamentRecord);
  return { drawId, sourceStructureId };
}

const matchUpIn = (drawId: string, structureId: string, roundNumber = 1, roundPosition = 1) =>
  tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], structureIds: [structureId] } })
    .matchUps.find((m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

const expectLinkError = (result: any) => {
  expect(result.success).toBeUndefined();
  expect(result.error?.code).toEqual(INVALID_VALUES.code);
};

it.each([
  [FIRST_MATCH_LOSER_CONSOLATION, LOSER, undefined],
  [FEED_IN_CHAMPIONSHIP, LOSER, undefined],
  [DOUBLE_ELIMINATION, WINNER, 'Backdraw'],
])('positionTargets returns the error for a %s %s link with no source round, naming it', (drawType, linkType, name) => {
  const { drawId, sourceStructureId } = corruptedDraw({ drawType, linkType, structureName: name });
  const drawDefinition = getDrawDefinition(drawId);
  const inContextDrawMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { drawIds: [drawId] },
    inContext: true,
  }).matchUps;
  const matchUp = matchUpIn(drawId, sourceStructureId);

  let result: any;
  expect(() => {
    result = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  }).not.toThrow();
  expectLinkError(result);
  expect(result.targetLinks).toBeUndefined();
  expect(result.context).toMatchObject({ matchUpId: matchUp.matchUpId, structureId: sourceStructureId, linkType });
});

it('scoring across a malformed LOSER link is refused, and the draw is unchanged', () => {
  const { drawId, sourceStructureId } = corruptedDraw({ drawType: FIRST_MATCH_LOSER_CONSOLATION, linkType: LOSER });
  const matchUpId = matchUpIn(drawId, sourceStructureId).matchUpId;
  const before = hash(getDrawDefinition(drawId));

  let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  expectLinkError(result);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);

  result = tournamentEngine.executionQueue(
    [{ method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } }],
    true,
  );
  expectLinkError(result);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
});

it('scoring across a malformed WINNER link is refused', () => {
  const { drawId, sourceStructureId } = corruptedDraw({
    drawType: DOUBLE_ELIMINATION,
    structureName: 'Backdraw',
    linkType: WINNER,
  });
  const backdrawMatchUp = matchUpIn(drawId, sourceStructureId);
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: backdrawMatchUp.matchUpId, outcome });
  expectLinkError(result);
});

it('a double exit across a malformed LOSER link is refused, and the draw is unchanged', () => {
  const { drawId, sourceStructureId } = corruptedDraw({ drawType: FIRST_MATCH_LOSER_CONSOLATION, linkType: LOSER });
  const matchUpId = matchUpIn(drawId, sourceStructureId).matchUpId;
  const before = hash(getDrawDefinition(drawId));
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId,
    drawId,
  });
  expectLinkError(result);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
});

it('a malformed link in a structure DOWNSTREAM is returned from the cascade, and rolled back', () => {
  // COMPASS: East's round-1 losers go to West, and West's own LOSER link is the malformed one
  const { drawId } = corruptedDraw({ drawType: COMPASS, structureName: 'West', linkType: LOSER });
  const eastId = getDrawDefinition(drawId).structures.find((s) => s.structureName === 'East').structureId;
  const matchUpId = matchUpIn(drawId, eastId).matchUpId;
  const before = hash(getDrawDefinition(drawId));
  const result: any = tournamentEngine.executionQueue(
    [{ method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } }],
    true,
  );
  expectLinkError(result);
  expect(result.rolledBack).toEqual(true);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
});

it('clearing a position in a structure with a malformed link is refused, and rolled back', () => {
  const { drawId, sourceStructureId } = corruptedDraw({ drawType: FIRST_MATCH_LOSER_CONSOLATION, linkType: LOSER });
  const before = hash(getDrawDefinition(drawId));
  const params = { drawId, structureId: sourceStructureId, drawPosition: 1 };
  const result: any = tournamentEngine.executionQueue([{ method: 'removeDrawPositionAssignment', params }], true);
  expectLinkError(result);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
});

it('the queries that follow the link return the error', () => {
  const { drawId, sourceStructureId } = corruptedDraw({ drawType: FIRST_MATCH_LOSER_CONSOLATION, linkType: LOSER });
  const matchUpId = matchUpIn(drawId, sourceStructureId).matchUpId;
  expectLinkError(tournamentEngine.matchUpActions({ drawId, matchUpId }));
  expectLinkError(tournamentEngine.getMatchUpDependencies({ drawIds: [drawId] }));
  // hydration only decorates: the draw stays readable, without the targets it cannot derive
  const read: any = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true });
  expect(read.error).toBeUndefined();
  expect(read.matchUps.length).toBeGreaterThan(0);
});

it('a draw with no LOSER link at all is directed exactly as before', () => {
  setSubscriptions({});
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    setState: true,
  });
  const structureId = getDrawDefinition(drawId).structures[0].structureId;
  const matchUpId = matchUpIn(drawId, structureId).matchUpId;
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  expect(result.success).toEqual(true);
  expect(matchUpIn(drawId, structureId, 2, 1).sides.filter((side) => side.participantId).length).toEqual(1);
});
