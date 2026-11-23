import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/matchUpTypes';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

/**
 * THE INDEX EMITS ONLY WHAT IT IS ASKED FOR, AND EACH ENTRY IS THE ONE THE FULL BUILD MAKES (`matchUpIds`, the working
 * view's re-index after a write). An entry is built from its structure's whole round profile and position assignments,
 * so leaving other members out must not change it: a filtered build equals the full build restricted to the requested
 * matchUps, in the same order, a dual bringing its lines. A line asked for alone is not a member of its structure and
 * is not emitted: the working view always asks for an affected line's dual (`overlay.ts`).
 */
function fullIndex(drawProfile: Record<string, unknown>) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const args = { tournamentRecord, drawDefinition, event, team: true };
  return { args, full: buildStructuralIndex(args).matchUps };
}

const expected = (full: any[], ids: Set<string>) =>
  full.filter((entry) => ids.has(entry.matchUpId) || (!!entry.matchUpTieId && ids.has(entry.matchUpTieId)));

const shapes: [string, Record<string, unknown>][] = [
  [
    'FEED_IN_CHAMPIONSHIP 32 with byes',
    { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32, participantsCount: 27, completionGoal: 20 },
  ],
  [
    'FMLC 16 with byes',
    { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 13, completionGoal: 10 },
  ],
  ['DOUBLE_ELIMINATION 16', { drawType: DOUBLE_ELIMINATION, drawSize: 16, completionGoal: 20 }],
  ['COMPASS 16', { drawType: COMPASS, drawSize: 16, completionGoal: 16 }],
  ['ROUND_ROBIN 16', { drawType: ROUND_ROBIN, drawSize: 16, completionGoal: 12 }],
  ['TEAM SE 8', { eventType: TEAM, drawSize: 8, completionGoal: 4 }],
  [
    'TEAM FMLC 8 with byes',
    { eventType: TEAM, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 6, completionGoal: 3 },
  ],
  ['TEAM ROUND_ROBIN 8', { eventType: TEAM, drawType: ROUND_ROBIN, drawSize: 8, completionGoal: 4 }],
];

describe('a filtered build is the full build restricted to the requested matchUps', () => {
  it.each(shapes)('%s', (_label, drawProfile) => {
    const { args, full } = fullIndex(drawProfile);
    const members = full.filter((entry) => !entry.matchUpTieId);
    // CONTROLS: a draw with members, results among them, and (for TEAM) lines nested under their duals
    expect(members.length).toBeGreaterThan(4);
    expect(full.some((entry) => entry.winningSide)).toEqual(true);
    if (drawProfile.eventType === TEAM) expect(full.some((entry) => entry.matchUpTieId)).toEqual(true);

    // each member alone, so every round, feed position and BYE is met in isolation
    for (const member of members) {
      const ids = new Set([member.matchUpId]);
      expect(buildStructuralIndex({ ...args, matchUpIds: ids }).matchUps).toEqual(expected(full, ids));
    }
    // a scattered subset, across structures and rounds, and the subset with its structures named as the overlay does
    const scattered = new Set(members.filter((_, index) => index % 3 === 0).map((entry) => entry.matchUpId));
    expect(buildStructuralIndex({ ...args, matchUpIds: scattered }).matchUps).toEqual(expected(full, scattered));
    const structureIds = new Set(
      members.filter((entry) => scattered.has(entry.matchUpId)).map((e) => e.containerStructureId ?? e.structureId),
    );
    expect(buildStructuralIndex({ ...args, structureIds, matchUpIds: scattered }).matchUps).toEqual(
      expected(full, scattered),
    );
    // every member requested: the full build exactly
    const all = new Set(members.map((entry) => entry.matchUpId));
    expect(buildStructuralIndex({ ...args, matchUpIds: all }).matchUps).toEqual(full);
  });
});

it('emits nothing for a line asked for without its dual, and nothing for an empty request', () => {
  const { args, full } = fullIndex({ eventType: TEAM, drawSize: 4, completionGoal: 1 });
  const lineId = full.find((entry) => entry.matchUpTieId)?.matchUpId;
  expect(lineId).toBeDefined();
  expect(buildStructuralIndex({ ...args, matchUpIds: new Set([lineId as string]) }).matchUps).toEqual([]);
  expect(buildStructuralIndex({ ...args, matchUpIds: new Set() }).matchUps).toEqual([]);
});
