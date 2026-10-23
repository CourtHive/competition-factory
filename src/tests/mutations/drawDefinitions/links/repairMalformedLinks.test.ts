import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import {
  planLinkRepairs,
  repairMalformedLink,
  repairMalformedLinks,
} from '@Mutate/drawDefinitions/links/repairMalformedLinks';

// constants
import { DRAW_POSITION_ASSIGNED, INVALID_VALUES, MISSING_STRUCTURE_ID } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  COMPASS,
  CONSOLATION,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LOSER,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  PAGE_PLAYOFF,
  PLAY_OFF,
  SINGLE_ELIMINATION,
  WINNER,
} from '@Constants/drawDefinitionConstants';

/**
 * A DRAW'S MALFORMED LINKS ARE REPAIRED, OR REMOVED AND REPORTED (CA, 2026-10-22).
 *
 * Each draw is generated well-formed and its links are then corrupted: a WINNER or LOSER link loses its
 * `source.roundNumber`, an entry is replaced by `null`, or a link is pointed at a structure the draw does not have.
 * The repair must restore exactly what generation wrote where the round can be determined, and leave a draw
 * `getDrawInconsistencies` calls valid, on which outcomes can be set.
 *
 * A REFUSED call leaves the record as it found it, on a DIRECT call: no `rollbackOnError`, no snapshot/restore. The
 * record is copied before the call and compared after it.
 */

const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome;

type Corruption = (drawDefinition: any) => void;

function generate({ drawType, drawSize = 16, completeAllMatchUps = false, playoffRounds = [] as number[] }) {
  setSubscriptions({});
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize }],
    completeAllMatchUps,
    setState: true,
  });
  if (playoffRounds.length) {
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    const result = tournamentEngine.addPlayoffStructures({ drawId, structureId, roundNumbers: playoffRounds });
    expect(result.success).toEqual(true);
    return { drawId, tournamentRecord: tournamentEngine.getTournament().tournamentRecord };
  }
  return { drawId, tournamentRecord };
}

const drawOf = (tournamentRecord) => tournamentRecord.events[0].drawDefinitions[0];

const storedEdges = (drawDefinition) =>
  (drawDefinition.structures ?? [])
    .flatMap((structure) => [structure, ...(structuresOf(structure) ?? [])])
    .flatMap((structure) => matchUpsOf(structure) ?? [])
    .map(({ matchUpId, winnerMatchUpId, loserMatchUpId }) => [matchUpId, winnerMatchUpId, loserMatchUpId]);

const structureId = (drawDefinition, structureName) =>
  drawDefinition.structures.find((structure) => structure.structureName === structureName).structureId;

/** corrupts the record and loads it into the engine; returns what generation wrote */
function corrupt(tournamentRecord, corruption: Corruption) {
  const generated = structuredClone(drawOf(tournamentRecord));
  const record = structuredClone(tournamentRecord);
  corruption(drawOf(record));
  tournamentEngine.setState(record);
  return generated;
}

const dropSourceRound =
  (predicate: (link: any, drawDefinition: any) => boolean): Corruption =>
  (drawDefinition) => {
    const links = drawDefinition.links.filter((link) => predicate(link, drawDefinition));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) Reflect.deleteProperty(link.source, 'roundNumber');
  };

/** score every matchUp that is ready, until none is: every link the draw has is followed */
function playOut(drawId: string) {
  for (let pass = 0; pass < 32; pass += 1) {
    const ready = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.filter((matchUp) => matchUp.readyToScore && matchUp.matchUpStatus !== COMPLETED);
    if (!ready.length) return;
    for (const { matchUpId } of ready) {
      const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
      expect(result.success).toEqual(true);
    }
  }
}

const expectValid = (drawId: string) => {
  const result: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
};

describe('a malformed round link is restored to the round generation wrote', () => {
  const scenarios: [string, { drawType: string; drawSize?: number; playoffRounds?: number[] }, Corruption][] = [
    [
      'FIRST_MATCH_LOSER_CONSOLATION: both LOSER links',
      { drawType: FIRST_MATCH_LOSER_CONSOLATION },
      dropSourceRound((link) => link.linkType === LOSER),
    ],
    [
      // all but the Main final's LOSER link into the Decider: with both late LOSER links malformed, rounds 3 and 4
      // (one matchUp each) both fit, which the ambiguous case below covers
      'DOUBLE_ELIMINATION: the LOSER links into the Backdraw, and the WINNER links into Main and the Decider',
      { drawType: DOUBLE_ELIMINATION, drawSize: 8 },
      dropSourceRound(
        (link, drawDefinition) =>
          !(link.linkType === LOSER && link.target.structureId === structureId(drawDefinition, 'Decider')),
      ),
    ],
    ['COMPASS: every LOSER link', { drawType: COMPASS, drawSize: 16 }, dropSourceRound(() => true)],
    ['FEED_IN_CHAMPIONSHIP: every LOSER link', { drawType: FEED_IN_CHAMPIONSHIP }, dropSourceRound(() => true)],
    [
      'playoffs: the LOSER links into three added playoff structures',
      { drawType: SINGLE_ELIMINATION, drawSize: 16, playoffRounds: [1, 2, 3] },
      dropSourceRound(() => true),
    ],
  ];

  it.each(scenarios)('%s', (_, profile, corruption) => {
    const { drawId, tournamentRecord } = generate(profile);
    const generated = corrupt(tournamentRecord, corruption);
    expect(tournamentEngine.getDrawInconsistencies({ drawId }).valid).toEqual(false);

    const result: any = tournamentEngine.repairMalformedLinks({ drawId });
    expect(result.success).toEqual(true);
    expect(result.removed).toEqual([]);
    expect(result.repaired.length).toBeGreaterThan(0);
    expect(result.repaired.every(({ basis }) => basis === 'inferred')).toEqual(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.links).toEqual(generated.links);
    expect(storedEdges(drawDefinition)).toEqual(storedEdges(generated));
    expectValid(drawId);

    playOut(drawId);
    expectValid(drawId);
  });
});

it('removes an entry that is not a link, and a link to a structure the draw does not have', () => {
  const { drawId, tournamentRecord } = generate({ drawType: FIRST_MATCH_LOSER_CONSOLATION });
  const generated = corrupt(tournamentRecord, (drawDefinition) => {
    drawDefinition.links.push(null, 'not a link', {
      ...structuredClone(drawDefinition.links[0]),
      target: { ...drawDefinition.links[0].target, structureId: 'no-such-structure' },
    });
  });

  // the integrity scan reports both, and does not throw
  const inconsistencies = tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies;
  expect(inconsistencies.map(({ issueType }) => issueType).sort()).toEqual([
    'DANGLING_LINK',
    'INVALID_LINK',
    'INVALID_LINK',
  ]);

  const result: any = tournamentEngine.repairMalformedLinks({ drawId });
  expect(result.success).toEqual(true);
  expect(result.repaired).toEqual([]);
  expect(result.removed.map(({ linkIndex, reason }) => [linkIndex, reason])).toEqual([
    [2, 'NOT_A_LINK'],
    [3, 'NOT_A_LINK'],
    [4, 'DANGLING_LINK'],
  ]);
  expect(result.unlinkedStructureIds).toEqual([]);
  expect(tournamentEngine.getEvent({ drawId }).drawDefinition.links).toEqual(generated.links);
  expectValid(drawId);
  playOut(drawId);
  expectValid(drawId);
});

it('removes and reports a link whose source round is ambiguous, which an operator can then restore', () => {
  // DOUBLE_ELIMINATION Main rounds 3 and 4 each hold one matchUp, and both of their LOSER links lose their round:
  // either round's loser fits the Backdraw's round 4 and the Decider's share of round 1
  const { drawId, tournamentRecord } = generate({ drawType: DOUBLE_ELIMINATION, drawSize: 8 });
  const isLateMainLoserLink = (link, drawDefinition) =>
    link.linkType === LOSER &&
    link.source.structureId === structureId(drawDefinition, 'Main') &&
    link.source.roundNumber > 2;
  const generated = corrupt(tournamentRecord, dropSourceRound(isLateMainLoserLink));
  const main = structureId(generated, 'Main');
  const backdraw = structureId(generated, 'Backdraw');

  const before = structuredClone(tournamentEngine.getEvent({ drawId }).drawDefinition);
  const result: any = tournamentEngine.repairMalformedLinks({ drawId });
  expect(result.success).toEqual(true);
  expect(result.repaired).toEqual([]);
  expect(result.removed.map(({ reason, candidates }) => [reason, candidates])).toEqual([
    ['AMBIGUOUS_SOURCE_ROUND', [3, 4]],
    ['AMBIGUOUS_SOURCE_ROUND', [3, 4]],
  ]);
  expect(tournamentEngine.getEvent({ drawId }).drawDefinition.links.length).toEqual(before.links.length - 2);

  // the operator's answer, one link at a time, on the draw as it was before the removal
  tournamentEngine.setState(corruptedRecord(before));
  let single: any = tournamentEngine.repairMalformedLink({
    drawId,
    sourceStructureId: main,
    targetStructureId: backdraw,
    sourceRoundNumber: 3,
  });
  expect(single.success).toEqual(true);
  expect(single.repaired).toEqual([expect.objectContaining({ sourceRoundNumber: 3, basis: 'specified' })]);
  // with round 3 directed, the Decider's link has one candidate left
  single = tournamentEngine.repairMalformedLinks({ drawId });
  expect(single.repaired).toEqual([expect.objectContaining({ sourceRoundNumber: 4, basis: 'inferred' })]);
  expect(tournamentEngine.getEvent({ drawId }).drawDefinition.links).toEqual(generated.links);
  expectValid(drawId);
  playOut(drawId);
  expectValid(drawId);

  function corruptedRecord(drawDefinition) {
    const record = structuredClone(tournamentRecord);
    record.events[0].drawDefinitions[0] = drawDefinition;
    return record;
  }
});

describe('a refused call leaves the record as it found it', () => {
  function completedWithMalformedLink() {
    const { tournamentRecord } = generate({ drawType: FIRST_MATCH_LOSER_CONSOLATION, completeAllMatchUps: true });
    const record = structuredClone(tournamentRecord);
    dropSourceRound((link) => link.linkType === LOSER && link.source.roundNumber === 1)(drawOf(record));
    return record;
  }

  it('refuses, unless forced, where participants arrived through the link', () => {
    const tournamentRecord = completedWithMalformedLink();
    const drawDefinition = drawOf(tournamentRecord);
    const before = structuredClone(tournamentRecord);

    let result: any = repairMalformedLinks({ tournamentRecord, drawDefinition });
    expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
    expect(result.context.arrived[0].targetStructureId).toEqual(structureId(drawDefinition, 'Consolation'));
    expect(result.context.arrived[0].participantIds.length).toEqual(8);
    expect(result.context.repaired).toEqual([expect.objectContaining({ sourceRoundNumber: 1 })]);
    expect(tournamentRecord).toEqual(before);

    result = repairMalformedLinks({ tournamentRecord, drawDefinition, force: true });
    expect(result.success).toEqual(true);
    expect(result.repaired).toEqual([expect.objectContaining({ sourceRoundNumber: 1 })]);
    expect(getDrawInconsistencies({ drawDefinition, tournamentRecord }).valid).toEqual(true);
  });

  it('refuses a selection that matches no malformed link, or a round the source does not have', () => {
    const tournamentRecord = completedWithMalformedLink();
    const drawDefinition = drawOf(tournamentRecord);
    const before = structuredClone(tournamentRecord);
    const main = structureId(drawDefinition, 'Main');
    const consolation = structureId(drawDefinition, 'Consolation');

    const refusals: any[] = [
      repairMalformedLink({ tournamentRecord, drawDefinition }),
      repairMalformedLink({ tournamentRecord, drawDefinition, sourceStructureId: consolation }),
      repairMalformedLink({ tournamentRecord, drawDefinition, sourceStructureId: main, sourceRoundNumber: 0 }),
      repairMalformedLink({
        tournamentRecord,
        drawDefinition,
        sourceStructureId: main,
        sourceRoundNumber: 9,
        force: true,
      }),
      // round 2 is directed by the other LOSER link
      repairMalformedLink({
        tournamentRecord,
        drawDefinition,
        sourceStructureId: main,
        sourceRoundNumber: 2,
        force: true,
      }),
    ];
    expect(refusals.map(({ error }) => error)).toEqual([
      MISSING_STRUCTURE_ID,
      INVALID_VALUES,
      INVALID_VALUES,
      INVALID_VALUES,
      INVALID_VALUES,
    ]);
    expect(tournamentRecord).toEqual(before);
  });
});

it('a draw with nothing malformed is left alone', () => {
  const { drawId, tournamentRecord } = generate({ drawType: FEED_IN_CHAMPIONSHIP });
  const before = structuredClone(drawOf(tournamentRecord));
  const result: any = tournamentEngine.repairMalformedLinks({ drawId });
  expect(result).toEqual({ success: true, repaired: [], relabeled: [], removed: [] });
  expect(tournamentEngine.getEvent({ drawId }).drawDefinition).toEqual(before);
  expect(repairMalformedLinks({ drawDefinition: undefined as any }).error).toBeDefined();
  expect(repairMalformedLink({ drawDefinition: undefined as any }).error).toBeDefined();
});

it('removing the only link into a structure reports the structure as unlinked', () => {
  const { drawId, tournamentRecord } = generate({ drawType: SINGLE_ELIMINATION, drawSize: 8, playoffRounds: [2] });
  const playoff = drawOf(tournamentRecord).structures.find(({ stage }) => stage === PLAY_OFF).structureId;
  corrupt(tournamentRecord, (drawDefinition) => {
    // the semifinal losers' link, pointed at no round of the target: nothing can say what it supplies
    const link = drawDefinition.links.find(({ target }) => target.structureId === playoff);
    Reflect.deleteProperty(link.source, 'roundNumber');
    Reflect.deleteProperty(link.target, 'roundNumber');
  });
  const result: any = tournamentEngine.repairMalformedLinks({ drawId });
  expect(result.removed).toEqual([expect.objectContaining({ reason: 'NO_SOURCE_ROUND', candidates: [] })]);
  // the draw had one link: neither of its structures is reached by a link now
  const main = drawOf(tournamentRecord).structures.find(({ stage }) => stage === MAIN).structureId;
  expect(result.unlinkedStructureIds).toEqual([main, playoff]);
});

it('a WINNER link is restored to the final round of its source', () => {
  const { drawId, tournamentRecord } = generate({ drawType: DOUBLE_ELIMINATION, drawSize: 16 });
  const generated = corrupt(
    tournamentRecord,
    dropSourceRound((link) => link.linkType === WINNER),
  );
  const result: any = tournamentEngine.repairMalformedLinks({ drawId });
  expect(result.repaired.map(({ linkType }) => linkType)).toEqual([WINNER, WINNER]);
  expect(tournamentEngine.getEvent({ drawId }).drawDefinition.links).toEqual(generated.links);
  expect(generated.structures.map(({ stage }) => stage)).toEqual([MAIN, CONSOLATION, PLAY_OFF]);
});

// the claim the docs make, measured: every WINNER or LOSER link a generator writes, stripped of its round one at a
// time, is restored to that round (the full sweep, sizes 4 to 64 with qualifying and playoffs, measured 556 of 556)
it.each([
  [FIRST_MATCH_LOSER_CONSOLATION, [8, 16]],
  [FIRST_ROUND_LOSER_CONSOLATION, [8]],
  [DOUBLE_ELIMINATION, [4, 16]],
  [COMPASS, [8, 32]],
  [OLYMPIC, [16]],
  [CURTIS_CONSOLATION, [32]],
  [FEED_IN_CHAMPIONSHIP, [16]],
  [FEED_IN_CHAMPIONSHIP_TO_SF, [16]],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, [16]],
  [PAGE_PLAYOFF, [4]],
] as [string, number[]][])('%s: each stripped round is restored to the round generation wrote', (drawType, sizes) => {
  for (const drawSize of sizes) {
    // the counts the inference reads are those of the stored structures: a fresh draw has them all
    const { tournamentRecord } = generate({ drawType, drawSize });
    const drawDefinition = drawOf(tournamentRecord);
    const roundLinks = drawDefinition.links.filter(({ linkType }) => [WINNER, LOSER].includes(linkType));
    expect(roundLinks.length).toBeGreaterThan(0);
    for (const link of roundLinks) {
      const copy = structuredClone(drawDefinition);
      const index = drawDefinition.links.indexOf(link);
      Reflect.deleteProperty(copy.links[index].source, 'roundNumber');
      const plan: any = planLinkRepairs({ drawDefinition: copy });
      expect([drawSize, plan.removed]).toEqual([drawSize, []]);
      expect(plan.repaired).toEqual([
        expect.objectContaining({ linkIndex: index, sourceRoundNumber: link.source.roundNumber }),
      ]);
    }
  }
});

it('a single link is repaired while another malformed link remains, and the edges are rebuilt once it is gone', () => {
  const { drawId, tournamentRecord } = generate({ drawType: FIRST_MATCH_LOSER_CONSOLATION });
  const generated = corrupt(tournamentRecord, (drawDefinition) => {
    Reflect.deleteProperty(drawDefinition.links[0].source, 'roundNumber');
    drawDefinition.links.push({ ...structuredClone(drawDefinition.links[1]), target: { structureId: 'gone' } });
  });
  const main = structureId(generated, 'Main');
  const consolation = structureId(generated, 'Consolation');

  let result: any = tournamentEngine.repairMalformedLink({
    drawId,
    sourceStructureId: main,
    targetStructureId: consolation,
  });
  expect(result.repaired).toEqual([expect.objectContaining({ linkIndex: 0, sourceRoundNumber: 1 })]);
  expect(result.removed).toEqual([]);

  result = tournamentEngine.repairMalformedLink({ drawId, targetStructureId: 'gone' });
  expect(result.removed).toEqual([expect.objectContaining({ linkIndex: 2, reason: 'DANGLING_LINK' })]);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links).toEqual(generated.links);
  expect(storedEdges(drawDefinition)).toEqual(storedEdges(generated));
  expectValid(drawId);
});
