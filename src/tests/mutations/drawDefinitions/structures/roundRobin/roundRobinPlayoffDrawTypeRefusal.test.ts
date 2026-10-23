import { PLAYOFF_GROUP_DRAW_TYPES, validatePlayoffGroups } from '@Validators/validatePlayoffGroups';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';
import {
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  PAGE_PLAYOFF,
  PLAY_OFF,
  PLAYOFF,
  POSITION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/*
 * A PLAYOFF GROUP WHOSE drawType THE FACTORY CANNOT BUILD IS REFUSED.
 * Found by a TMX e2e run: a separator option ('──────────') and the STAGE constant 'PLAY_OFF' passed as a playoff
 * group's drawType fell through every builder in processPlayoffGroups, and generateDrawDefinition reported success
 * with the Main structure alone — 0 PLAY_OFF structures, 0 links.
 */

// every value the dispatch in processPlayoffGroups builds; the set exported beside it must be exactly this
const BUILDABLE = [
  SINGLE_ELIMINATION,
  COMPASS,
  OLYMPIC,
  PLAYOFF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  FIRST_ROUND_LOSER_CONSOLATION,
  CURTIS_CONSOLATION,
  PAGE_PLAYOFF,
  AD_HOC,
];

const UNBUILDABLE: any[] = [
  '──────────',
  PLAY_OFF, // the STAGE constant, not a draw type
  '',
  'NOT_A_DRAW_TYPE',
  ROUND_ROBIN_WITH_PLAYOFF, // a draw type, but not one a playoff group can be built as
  'single_elimination', // case matters
  0,
  42,
  false,
  {},
  [SINGLE_ELIMINATION],
];

const DRAW_SIZE = 16;
const GROUP_SIZE = 4; // 4 groups of 4

function setup() {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: DRAW_SIZE } }],
  });
  tournamentEngine.setState(tournamentRecord);
  return { eventId };
}

function generate({ eventId, playoffGroups }) {
  return tournamentEngine.generateDrawDefinition({
    structureOptions: { groupSize: GROUP_SIZE, playoffGroups },
    drawType: ROUND_ROBIN_WITH_PLAYOFF,
    drawSize: DRAW_SIZE,
    eventId,
  });
}

// a group of 8 (finishing positions 1 and 2 across 4 groups); PAGE_PLAYOFF requires exactly 4
function groupFor(drawType) {
  return drawType === PAGE_PLAYOFF
    ? { drawType, finishingPositions: [1] }
    : { drawType, finishingPositions: [1, 2], structureName: `PO ${drawType}` };
}

function expectRefusal(result, playoffGroupIndex: number, drawType: any) {
  expect(result.success).not.toEqual(true);
  expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
  expect(result.drawDefinition).toBeUndefined();
  expect(result.info).toContain(`playoffGroups[${playoffGroupIndex}].drawType`);
  expect(result.context?.playoffGroupIndex).toEqual(playoffGroupIndex);
  // an empty string is dropped from a context by definedAttributes; the info names it instead
  if (drawType !== '') expect(result.context?.drawType).toEqual(drawType);
  expect(result.context?.validDrawTypes).toEqual([...PLAYOFF_GROUP_DRAW_TYPES]);
}

function addRoundRobinDraw() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: DRAW_SIZE }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  return { drawId, structureId };
}

function addEliminationDraw() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  return { drawId, structureId };
}

const snapshot = (drawId) => JSON.stringify(tournamentEngine.getEvent({ drawId }).drawDefinition);

describe('the playoff group drawTypes the factory builds', () => {
  it('the exported set is exactly the dispatch in processPlayoffGroups', () => {
    expect([...PLAYOFF_GROUP_DRAW_TYPES].sort()).toEqual([...BUILDABLE].sort());
  });

  it.each(BUILDABLE)('generateDrawDefinition builds a %s playoff group', (drawType) => {
    const { eventId } = setup();
    const result = generate({ eventId, playoffGroups: [groupFor(drawType)] });
    expect(result.success).toEqual(true);
    const { structures, links } = result.drawDefinition;
    expect(structures.filter((s) => s.stage === MAIN).length).toEqual(1);
    expect(structures.filter((s) => s.stage === PLAY_OFF).length).toBeGreaterThan(0);
    const mainStructureId = structures.find((s) => s.stage === MAIN).structureId;
    expect(links.some((l) => l.linkType === POSITION && l.source.structureId === mainStructureId)).toEqual(true);
  });

  it.each([undefined, null])('an omitted drawType (%s) still defaults to SINGLE_ELIMINATION', (drawType) => {
    const { eventId } = setup();
    const result = generate({ eventId, playoffGroups: [{ drawType, finishingPositions: [1, 2] }] });
    expect(result.success).toEqual(true);
    const playoffs = result.drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(playoffs.length).toEqual(1);
    // a single elimination of 8: 4 + 2 + 1 matchUps
    expect(playoffs[0].matchUps.length).toEqual(7);
    expect(result.drawDefinition.links.length).toEqual(1);
  });

  it('the default playoff group (no playoffGroups) is unchanged', () => {
    const { eventId } = setup();
    const result = generate({ eventId, playoffGroups: undefined });
    expect(result.success).toEqual(true);
    expect(result.drawDefinition.structures.filter((s) => s.stage === PLAY_OFF).length).toEqual(1);
    expect(result.drawDefinition.links.length).toEqual(1);
  });
});

describe('generateDrawDefinition refuses a playoff group it cannot build', () => {
  it.each(UNBUILDABLE)('refuses drawType %j', (drawType) => {
    const { eventId } = setup();
    const result = generate({ eventId, playoffGroups: [{ drawType, finishingPositions: [1, 2] }] });
    expectRefusal(result, 0, drawType);
    // nothing written: the event holds no draw
    expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions ?? []).toEqual([]);
  });

  it('refuses a group of 2 too (a group of 2 is always built as SINGLE_ELIMINATION, but its drawType is still read)', () => {
    const { eventId } = setup();
    // groupSize 4, 2 groups (drawSize 8): finishing position 1 is a playoff of 2
    const result = tournamentEngine.generateDrawDefinition({
      structureOptions: { groupSize: GROUP_SIZE, playoffGroups: [{ drawType: '──────────', finishingPositions: [1] }] },
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      drawSize: 8,
      eventId,
    });
    expectRefusal(result, 0, '──────────');
  });

  it('refuses mixed groups as a whole, whichever group is unbuildable', () => {
    const { eventId } = setup();
    let result = generate({
      eventId,
      playoffGroups: [
        { drawType: SINGLE_ELIMINATION, finishingPositions: [1, 2] },
        { drawType: PLAY_OFF, finishingPositions: [3, 4] },
      ],
    });
    expectRefusal(result, 1, PLAY_OFF);

    result = generate({
      eventId,
      playoffGroups: [
        { drawType: '──────────', finishingPositions: [1, 2] },
        { drawType: SINGLE_ELIMINATION, finishingPositions: [3, 4] },
      ],
    });
    expectRefusal(result, 0, '──────────');
    expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions ?? []).toEqual([]);
  });

  it('refuses an unbuildable drawType on a bestOf / remainder group', () => {
    const { eventId } = setup();
    const result = generate({
      eventId,
      playoffGroups: [
        { finishingPositions: [1], bestOf: 6, drawType: SINGLE_ELIMINATION },
        { remainder: true, drawType: 'NOT_A_DRAW_TYPE' },
      ],
    });
    expectRefusal(result, 1, 'NOT_A_DRAW_TYPE');
  });

  it('refuses through the mocksEngine drawProfiles path', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          structureOptions: { groupSize: GROUP_SIZE, playoffGroups: [{ drawType: PLAY_OFF, finishingPositions: [1] }] },
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          drawSize: DRAW_SIZE,
        },
      ],
    });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
  });
});

describe('addPlayoffStructures and generateAndPopulatePlayoffStructures refuse the same way', () => {
  it.each(UNBUILDABLE)('addPlayoffStructures on a ROUND_ROBIN source refuses %j and changes nothing', (drawType) => {
    const { drawId, structureId } = addRoundRobinDraw();
    const before = snapshot(drawId);
    const result = tournamentEngine.addPlayoffStructures({
      playoffGroups: [{ drawType, finishingPositions: [1] }],
      structureId,
      drawId,
    });
    expectRefusal(result, 0, drawType);
    expect(snapshot(drawId)).toEqual(before);
  });

  it.each(UNBUILDABLE)('generateAndPopulatePlayoffStructures on a ROUND_ROBIN source refuses %j', (drawType) => {
    const { drawId, structureId } = addRoundRobinDraw();
    const before = snapshot(drawId);
    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [{ drawType, finishingPositions: [1] }],
      structureId,
      drawId,
    });
    expectRefusal(result, 0, drawType);
    expect(snapshot(drawId)).toEqual(before);
  });

  it('addPlayoffStructures refuses mixed groups as a whole and changes nothing', () => {
    const { drawId, structureId } = addRoundRobinDraw();
    const before = snapshot(drawId);
    const result = tournamentEngine.addPlayoffStructures({
      playoffGroups: [
        { drawType: SINGLE_ELIMINATION, finishingPositions: [1] },
        { drawType: '──────────', finishingPositions: [2] },
      ],
      structureId,
      drawId,
    });
    expectRefusal(result, 1, '──────────');
    expect(snapshot(drawId)).toEqual(before);
  });

  it('addPlayoffStructures on an elimination source (position-based playoffGroups) refuses and changes nothing', () => {
    const { drawId, structureId } = addEliminationDraw();
    const before = snapshot(drawId);
    const result = tournamentEngine.addPlayoffStructures({
      playoffGroups: [{ drawType: 'NOT_A_DRAW_TYPE', finishingPositions: [3, 4] }],
      structureId,
      drawId,
    });
    expectRefusal(result, 0, 'NOT_A_DRAW_TYPE');
    expect(snapshot(drawId)).toEqual(before);
  });

  it('addPlayoffStructures still builds every buildable drawType on a ROUND_ROBIN source', () => {
    for (const drawType of BUILDABLE) {
      const { drawId, structureId } = addRoundRobinDraw();
      const result = tournamentEngine.addPlayoffStructures({
        playoffGroups: [groupFor(drawType)],
        structureId,
        drawId,
      });
      expect({ drawType, success: result.success }).toEqual({ drawType, success: true });
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      expect(drawDefinition.structures.filter((s) => s.stage === PLAY_OFF).length).toBeGreaterThan(0);
    }
  });
});

describe('validatePlayoffGroups (the public validator) agrees', () => {
  it.each(UNBUILDABLE)('reports drawType %j invalid', (drawType) => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ drawType, finishingPositions: [1] }],
      groupSize: GROUP_SIZE,
      groupCount: 4,
    });
    expect(result.valid).toEqual(false);
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
    expect(result.context?.playoffGroupIndex).toEqual(0);
  });

  it.each(BUILDABLE)('reports drawType %s valid', (drawType) => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ drawType, finishingPositions: [1] }],
      groupSize: GROUP_SIZE,
      groupCount: 4,
    });
    expect(result.valid).toEqual(true);
  });
});
