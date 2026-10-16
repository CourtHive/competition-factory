import { buildTargetIndex, positionTargets } from '@Query/matchUp/positionTargets';
import { addGoesTo, hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  PLAYOFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * P53: `addGoesTo` and `addUpcomingMatchUps` hand `positionTargets` an index built once per call, in place of
 * scanning `inContextDrawMatchUps` several times per matchUp. The index claims to answer exactly what the scans
 * answer. Asked here of every matchUp of every draw shape, fresh and part-played, both ways round: the targets
 * with and without the index, with and without `useTargetMatchUpIds`, and the edges `addGoesTo` writes against
 * the edges generation stored.
 */
const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  LUCKY_DRAW,
  COMPASS,
  OLYMPIC,
  PLAYOFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
];
const SIZES = [16, 32];
const COMPLETION = [0, 9];

const cases = DRAW_TYPES.flatMap((drawType) =>
  SIZES.flatMap((drawSize) => COMPLETION.map((completionGoal) => ({ drawType, drawSize, completionGoal }))),
);

// the targets as data: matchUps by id, so two answers compare by what they name
const asIds = (value: any, depth = 0): any => {
  if (!value || typeof value !== 'object') return value;
  if (depth && value.matchUpId) return `matchUp:${value.matchUpId}`;
  if (Array.isArray(value)) return value.map((element) => asIds(element, depth + 1));
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries.map(([key, v]) => [key, asIds(v, depth + 1)]));
};

function expectParity(drawDefinition: any) {
  const { matchUps: inContextDrawMatchUps = [] } = getAllDrawMatchUps({ inContext: true, drawDefinition });
  const targetIndex = buildTargetIndex(inContextDrawMatchUps);
  let compared = 0;
  for (const { matchUpId } of inContextDrawMatchUps) {
    for (const useTargetMatchUpIds of [false, true]) {
      const scanned = positionTargets({ inContextDrawMatchUps, useTargetMatchUpIds, drawDefinition, matchUpId });
      const indexed = positionTargets({
        inContextDrawMatchUps,
        useTargetMatchUpIds,
        drawDefinition,
        targetIndex,
        matchUpId,
      });
      expect(asIds(indexed)).toEqual(asIds(scanned));
      // addGoesTo's read: the same targets, named by the matchUps themselves rather than copies of them
      const referenced: any = positionTargets({
        asReferences: true,
        inContextDrawMatchUps,
        useTargetMatchUpIds,
        drawDefinition,
        targetIndex,
        matchUpId,
      });
      const { winnerMatchUp, loserMatchUp, byeMatchUp } = referenced.targetMatchUps ?? {};
      for (const target of [winnerMatchUp, loserMatchUp, byeMatchUp].filter(Boolean)) {
        expect(inContextDrawMatchUps.includes(target)).toEqual(true);
      }
      expect(asIds(definedAttributes(referenced))).toEqual(asIds(scanned));
      compared += 1;
    }
  }
  return compared;
}

const storedEdges = (drawDefinition: any) =>
  (drawDefinition.structures ?? [])
    .flatMap((structure: any) => [structure, ...(structure.structures ?? [])])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .map(({ matchUpId, winnerMatchUpId, loserMatchUpId, finishingPositionRange }: any) => ({
      finishingPositionRange,
      winnerMatchUpId,
      loserMatchUpId,
      matchUpId,
    }));

it.each(cases)('indexed targets equal scanned targets: $drawType $drawSize, $completionGoal played', (scenario) => {
  const { drawType, drawSize, completionGoal } = scenario;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, completionGoal }],
    completeAllMatchUps: completionGoal > 0,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  expect(expectParity(drawDefinition)).toBeGreaterThan(0);

  // what generation stored is what addGoesTo derives: re-deriving onto a copy changes nothing
  const copy = makeDeepCopy(drawDefinition, false, true);
  expect(hasStoredGoesTo({ drawDefinition: copy })).toEqual(true);
  expect(addGoesTo({ drawDefinition: copy }).error).toBeUndefined();
  expect(storedEdges(copy)).toEqual(storedEdges(drawDefinition));

  // and a draw stripped of its edges gets back exactly those
  const stripped = makeDeepCopy(drawDefinition, false, true);
  for (const structure of stripped.structures ?? [])
    for (const matchUp of [structure, ...(structure.structures ?? [])].flatMap((s: any) => s.matchUps ?? [])) {
      delete matchUp.winnerMatchUpId;
      delete matchUp.loserMatchUpId;
    }
  expect(addGoesTo({ drawDefinition: stripped }).error).toBeUndefined();
  expect(storedEdges(stripped)).toEqual(storedEdges(drawDefinition));
});

it('indexed targets equal scanned targets on a TEAM draw and on playoff structures', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 16, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO, drawType: FEED_IN_CHAMPIONSHIP },
      { drawSize: 32, drawType: SINGLE_ELIMINATION, idPrefix: 'po' },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const [teamDraw, playoffDraw] = tournamentRecord.events.map((event: any) => event.drawDefinitions[0]);

  const structureId = playoffDraw.structures[0].structureId;
  const playoffs = tournamentEngine.addPlayoffStructures({
    drawId: playoffDraw.drawId,
    structureId,
    roundNumbers: [1, 2, 3],
  });
  expect(playoffs.success).toEqual(true);
  const { drawDefinition: withPlayoffs } = tournamentEngine.getEvent({ drawId: playoffDraw.drawId });
  expect(withPlayoffs.structures.length).toBeGreaterThan(1);

  for (const drawDefinition of [teamDraw, withPlayoffs]) {
    expect(expectParity(drawDefinition)).toBeGreaterThan(0);
    const copy = makeDeepCopy(drawDefinition, false, true);
    expect(addGoesTo({ drawDefinition: copy }).error).toBeUndefined();
    expect(storedEdges(copy)).toEqual(storedEdges(drawDefinition));
  }
}, 180_000);
