import { isRoundWinnerLink, traversesByFinishingPosition, traversesByRound } from '@Query/drawDefinition/linkTraversal';
import { repairMalformedLinks } from '@Mutate/drawDefinitions/links/repairMalformedLinks';
import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { isMalformedRoundLink } from '@Query/drawDefinition/malformedLinks';
import { getMalformedRoundLink } from '@Query/drawDefinition/linkGetter';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import {
  LOSER,
  MAIN,
  POSITION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  WINNER,
} from '@Constants/drawDefinitionConstants';

/**
 * A LINK OUT OF A ROUND ROBIN TRAVERSES BY FINISHING POSITION, whatever its label (CA, 2026-10-23).
 *
 * A round robin decides who leaves it by TALLY, once its groups are complete, so its link names
 * `source.finishingPositions`, the group places that cross it. The factory writes such a link as POSITION (with the
 * groups' final round on a qualifying link); records converted from classic TMX (294 prod draws, 2017–2023), the
 * factory's first generator (2020-09) and the documentation have written it as WINNER, with or without a round. Both
 * labels are valid, permanently, and every reader decides by the SOURCE structure (`traversesByFinishingPosition`).
 *
 * What went wrong before this file existed, measured on dev (2026-10-23), with a WINNER label:
 *  - no round: every outcome on the draw was refused (a "malformed round link");
 *  - with a round: `qualifierProgression` took the elimination path, collected the winner of every group MATCHUP
 *    (24 ids, 12 unique), and placed 3 participants in MAIN of whom only 1 had won their group; the qualifier action
 *    offered 24 candidates; round robin playoffs reported success and placed nobody.
 * And with any label, round robin qualifying took only group winners, ignoring the link's `finishingPositions`.
 *
 * Every scenario below runs against all four shapes. Groups are scored DETERMINISTICALLY: the lower drawPosition
 * always wins, so each group's finishing order is its drawPosition order and every expectation is exact.
 */

type Variant = { name: string; linkType: string; keepRound: boolean };
const VARIANTS: Variant[] = [
  { name: 'POSITION with a round (as the factory writes it)', linkType: POSITION, keepRound: true },
  { name: 'POSITION without a round', linkType: POSITION, keepRound: false },
  { name: 'WINNER with a round', linkType: WINNER, keepRound: true },
  { name: 'WINNER without a round (classic TMX conversions)', linkType: WINNER, keepRound: false },
];

const ROUND_ROBIN_QUALIFYING = {
  drawSize: 32,
  qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN, qualifyingPositions: 4 }] }],
};

const ROUND_ROBIN_GOLD_SILVER = {
  drawSize: 16,
  drawType: ROUND_ROBIN_WITH_PLAYOFF,
  structureOptions: {
    groupSize: 4,
    playoffGroups: [
      { finishingPositions: [1], structureName: 'Gold' },
      { finishingPositions: [2], structureName: 'Silver' },
    ],
  },
};

const isContainer = (structure: any) => !!structure?.structures?.length;

function containerLinks(drawDefinition: any) {
  const containerIds = new Set(drawDefinition.structures.filter(isContainer).map(({ structureId }) => structureId));
  return drawDefinition.links.filter((link: any) => containerIds.has(link.source.structureId));
}

/** generate, then store every link out of the round robin in the variant's shape */
function generate(drawProfile: any, variant?: Variant, finishingPositions?: number[]) {
  setSubscriptions({});
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: false });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const links = containerLinks(drawDefinition);
  if (variant || finishingPositions) expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link.linkType).toEqual(POSITION); // what the factory writes
    if (variant) {
      link.linkType = variant.linkType;
      if (!variant.keepRound) delete link.source.roundNumber;
    }
    if (finishingPositions) link.source.finishingPositions = finishingPositions;
  }
  tournamentEngine.setState(tournamentRecord);
  return { tournamentRecord, drawDefinition, eventId, drawId };
}

const storedDraw = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;
const structureNamed = (drawId: string, predicate: (structure: any) => boolean) =>
  storedDraw(drawId).structures.find(predicate);

/** score every round robin matchUp of the container: the lower drawPosition wins */
function scoreGroups(drawId: string, containerStructureId: string) {
  const matchUps = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.filter(({ containerStructureId: id }: any) => id === containerStructureId);
  expect(matchUps.length).toBeGreaterThan(0);
  for (const matchUp of matchUps) {
    const [side1, side2] = [1, 2].map((sideNumber) =>
      matchUp.sides.find((side: any) => side.sideNumber === sideNumber),
    );
    const winningSide = side1.drawPosition < side2.drawPosition ? 1 : 2;
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide, score: { scoreStringSide1: '6-1 6-1', scoreStringSide2: '1-6 1-6' } },
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  return matchUps.length;
}

/** the participants who finished in each place, by the tally, checked against the drawPosition order they must have */
function finishersByPlace(drawId: string, containerStructureId: string): Map<number, Set<string>> {
  const container = structureNamed(drawId, ({ structureId }) => structureId === containerStructureId);
  const byPlace = new Map<number, Set<string>>();
  for (const group of container.structures) {
    const ranked = [...group.positionAssignments].sort((a: any, b: any) => a.drawPosition - b.drawPosition);
    ranked.forEach((assignment: any, index: number) => {
      const tally = assignment.tally ?? assignment.extensions?.find(({ name }: any) => name === TALLY)?.value;
      expect(tally?.groupOrder).toEqual(index + 1); // lower drawPosition always won: no ties, exact order
      if (!byPlace.has(index + 1)) byPlace.set(index + 1, new Set());
      byPlace.get(index + 1)?.add(assignment.participantId);
    });
  }
  return byPlace;
}

const placedIn = (structure: any) =>
  new Set(structure.positionAssignments.map(({ participantId }: any) => participantId).filter(Boolean));

describe('the shared definition: how a link traverses', () => {
  it.each(VARIANTS)('$name out of a round robin traverses by finishing position', (variant) => {
    const { drawDefinition } = generate(ROUND_ROBIN_QUALIFYING, variant);
    const [link] = containerLinks(drawDefinition);
    expect(traversesByFinishingPosition(link, drawDefinition)).toEqual(true);
    expect(traversesByRound(link, drawDefinition)).toEqual(false);
    expect(isRoundWinnerLink(link, drawDefinition)).toEqual(false);
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(false);
    expect(getMalformedRoundLink(drawDefinition)).toBeUndefined();
  });

  it('a WINNER link out of an ELIMINATION structure traverses by round, whatever finishingPositions it carries', () => {
    const { drawDefinition } = generate({
      drawSize: 32,
      qualifyingProfiles: [
        { structureProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION, qualifyingPositions: 4 }] },
      ],
    });
    const link = drawDefinition.links.find(({ linkType }: any) => linkType === WINNER);
    expect(traversesByRound(link, drawDefinition)).toEqual(true);
    expect(isRoundWinnerLink(link, drawDefinition)).toEqual(true);
    link.source.finishingPositions = [1];
    expect(traversesByFinishingPosition(link, drawDefinition)).toEqual(false);
    delete link.source.roundNumber;
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(true);
    expect(getMalformedRoundLink(drawDefinition)?.error).toBeDefined();
  });

  it('a WINNER link out of a round robin naming no finishingPositions says nothing about who crosses it: malformed', () => {
    const { drawDefinition } = generate(ROUND_ROBIN_QUALIFYING, VARIANTS[3]);
    const [link] = containerLinks(drawDefinition);
    delete link.source.finishingPositions;
    expect(traversesByFinishingPosition(link, drawDefinition)).toEqual(false);
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(true);
  });

  it('a LOSER link out of a round robin is never read as a finishing-position link', () => {
    const { drawDefinition } = generate(ROUND_ROBIN_QUALIFYING);
    const [link] = containerLinks(drawDefinition);
    link.linkType = LOSER;
    expect(traversesByFinishingPosition(link, drawDefinition)).toEqual(false);
    expect(traversesByRound(link, drawDefinition)).toEqual(true);
  });

  it('without the draw the source cannot be seen, and a WINNER label is read as a round link', () => {
    const { drawDefinition } = generate(ROUND_ROBIN_QUALIFYING, VARIANTS[3]);
    const [link] = containerLinks(drawDefinition);
    expect(traversesByFinishingPosition(link)).toEqual(false);
    expect(isMalformedRoundLink(link)).toEqual(true);
    // a POSITION label needs no draw
    link.linkType = POSITION;
    expect(traversesByFinishingPosition(link)).toEqual(true);
  });

  it.each([null, 'link', [], undefined])('an entry that is not a link traverses neither way: %s', (entry) => {
    expect(traversesByFinishingPosition(entry)).toEqual(false);
    expect(traversesByRound(entry)).toEqual(false);
    expect(isRoundWinnerLink(entry)).toEqual(false);
  });
});

describe('round robin QUALIFYING into MAIN', () => {
  it.each(VARIANTS)('$name: every group winner, and only group winners, reach MAIN', (variant) => {
    const { drawDefinition, drawId, eventId } = generate(ROUND_ROBIN_QUALIFYING, variant);
    const containerId = drawDefinition.structures.find(isContainer).structureId;

    expect(scoreGroups(drawId, containerId)).toEqual(24);
    const winners = finishersByPlace(drawId, containerId).get(1) as Set<string>;
    expect(winners.size).toEqual(4);

    // the draw reads clean throughout
    const inconsistencies: any = getDrawInconsistencies({ drawDefinition: storedDraw(drawId) });
    expect(inconsistencies.valid).toEqual(true);
    expect(inconsistencies.inconsistencies.filter(({ linkType }: any) => linkType)).toEqual([]);

    // the qualifier action offers exactly the group winners, once each
    const main = structureNamed(drawId, ({ stage }) => stage === MAIN);
    const qualifierPosition = main.positionAssignments.find(({ qualifier }: any) => qualifier).drawPosition;
    const { validActions } = tournamentEngine.positionActions({
      drawPosition: qualifierPosition,
      structureId: main.structureId,
      drawId,
    });
    const offered = validActions.find(({ type }: any) => type === QUALIFYING_PARTICIPANT)?.qualifyingParticipantIds;
    expect(offered?.length).toEqual(4);
    expect(new Set(offered)).toEqual(winners);

    // progression fills every qualifier position with a different group winner
    const result = tournamentEngine.qualifierProgression({ drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.assignedParticipants.length).toEqual(4);
    const qualifierSeats = structureNamed(drawId, ({ stage }) => stage === MAIN).positionAssignments.filter(
      ({ qualifier }: any) => qualifier,
    );
    expect(qualifierSeats.length).toEqual(4);
    expect(new Set(qualifierSeats.map(({ participantId }: any) => participantId))).toEqual(winners);
  });

  it.each(VARIANTS)('$name naming [1, 2]: the top two of every group qualify, not only the winners', (variant) => {
    const { drawDefinition, drawId, eventId } = generate(ROUND_ROBIN_QUALIFYING, variant, [1, 2]);
    const containerId = drawDefinition.structures.find(isContainer).structureId;
    scoreGroups(drawId, containerId);
    const places = finishersByPlace(drawId, containerId);
    const topTwo = new Set([...(places.get(1) as Set<string>), ...(places.get(2) as Set<string>)]);
    expect(topTwo.size).toEqual(8);

    const main = structureNamed(drawId, ({ stage }) => stage === MAIN);
    const qualifierPosition = main.positionAssignments.find(({ qualifier }: any) => qualifier).drawPosition;
    const { validActions } = tournamentEngine.positionActions({
      drawPosition: qualifierPosition,
      structureId: main.structureId,
      drawId,
    });
    const offered = validActions.find(({ type }: any) => type === QUALIFYING_PARTICIPANT)?.qualifyingParticipantIds;
    expect(new Set(offered)).toEqual(topTwo);
    expect(offered.length).toEqual(8);

    // four qualifier positions: all four are filled, each from the top two of a group
    const result = tournamentEngine.qualifierProgression({ drawId, eventId });
    expect(result.assignedParticipants.length).toEqual(4);
    for (const { participantId } of result.assignedParticipants) expect(topTwo.has(participantId)).toEqual(true);
  });

  it.each(VARIANTS)('$name: nothing is offered or placed before the groups are complete', (variant) => {
    const { drawId, eventId } = generate(ROUND_ROBIN_QUALIFYING, variant);
    const result = tournamentEngine.qualifierProgression({ drawId, eventId });
    expect(result.error).toBeDefined();
    const main = structureNamed(drawId, ({ stage }) => stage === MAIN);
    expect(main.positionAssignments.filter(({ qualifier, participantId }: any) => qualifier && participantId)).toEqual(
      [],
    );
  });

  it.each(VARIANTS)('$name: MAIN is scored as usual alongside the qualifying groups', (variant) => {
    const { drawId } = generate(ROUND_ROBIN_QUALIFYING, variant);
    const readyInMain = tournamentEngine
      .allTournamentMatchUps({ contextFilters: { stages: [MAIN] } })
      .matchUps.filter(({ readyToScore }: any) => readyToScore);
    expect(readyInMain.length).toBeGreaterThan(0);
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: readyInMain[0].matchUpId,
      outcome: { winningSide: 1 },
      matchUpStatus: COMPLETED,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});

describe('round robin MAIN into Gold and Silver playoffs', () => {
  it.each(VARIANTS)('$name: Gold holds the group winners and Silver the runners-up', (variant) => {
    const { drawDefinition, drawId } = generate(ROUND_ROBIN_GOLD_SILVER, variant);
    const containerId = drawDefinition.structures.find(isContainer).structureId;
    expect(containerLinks(drawDefinition).length).toEqual(2);

    expect(scoreGroups(drawId, containerId)).toEqual(24);
    const places = finishersByPlace(drawId, containerId);

    const result = tournamentEngine.automatedPlayoffPositioning({ structureId: containerId, drawId });
    expect(result.success).toEqual(true);

    const gold = placedIn(structureNamed(drawId, ({ structureName }) => structureName === 'Gold'));
    const silver = placedIn(structureNamed(drawId, ({ structureName }) => structureName === 'Silver'));
    expect(gold).toEqual(places.get(1));
    expect(silver).toEqual(places.get(2));
    expect([...gold].filter((participantId) => silver.has(participantId))).toEqual([]);

    const inconsistencies: any = getDrawInconsistencies({ drawDefinition: storedDraw(drawId) });
    expect(inconsistencies.valid).toEqual(true);
  });
});

describe('the repair and the migration leave it as it is', () => {
  it.each(VARIANTS)('$name: repairMalformedLinks changes nothing', (variant) => {
    const { tournamentRecord, drawDefinition } = generate(ROUND_ROBIN_QUALIFYING, variant);
    const before = structuredClone(drawDefinition.links);
    const result: any = repairMalformedLinks({ drawDefinition, tournamentRecord });
    expect(result).toEqual({ success: true, repaired: [], removed: [] });
    expect(drawDefinition.links).toEqual(before);
  });

  it.each(VARIANTS)(
    '$name: migrateTournamentRecord keeps the link and stores the edges without a warning',
    (variant) => {
      const { tournamentRecord, drawDefinition } = generate(ROUND_ROBIN_QUALIFYING, variant);
      const before = structuredClone(drawDefinition.links);
      const result: any = migrateTournamentRecord({ tournamentRecord });
      expect(result.success).toEqual(true);
      expect(result.warnings).toBeUndefined();
      expect(drawDefinition.links).toEqual(before);
    },
  );

  it('a draw holding a round robin WINNER link and a malformed elimination link: only the elimination link is touched', () => {
    const { tournamentRecord, drawDefinition } = generate(
      {
        drawSize: 32,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ qualifyingRoundNumber: 2, stageSequence: 1, drawSize: 16 }],
          },
          {
            roundTarget: 1,
            structureProfiles: [{ qualifyingPositions: 4, drawType: ROUND_ROBIN, stageSequence: 2, drawSize: 16 }],
          },
        ],
      },
      VARIANTS[3],
    );
    const roundRobinLink = containerLinks(drawDefinition)[0];
    const eliminationLink = drawDefinition.links.find(
      (link: any) => link !== roundRobinLink && link.linkType === WINNER,
    );
    const round = eliminationLink.source.roundNumber;
    delete eliminationLink.source.roundNumber;
    const roundRobinBefore = structuredClone(roundRobinLink);

    const result: any = repairMalformedLinks({ drawDefinition, tournamentRecord });
    expect(result.success).toEqual(true);
    expect(result.repaired.map(({ sourceRoundNumber }: any) => sourceRoundNumber)).toEqual([round]);
    expect(result.removed).toEqual([]);
    expect(roundRobinLink).toEqual(roundRobinBefore);
    expect(eliminationLink.source.roundNumber).toEqual(round);
  });
});
