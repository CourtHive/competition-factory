import { isLegacyRoundRobinWinnerLink, isMalformedRoundLink } from '@Query/drawDefinition/malformedLinks';
import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getMalformedRoundLink } from '@Query/drawDefinition/linkGetter';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_ROUND_ROBIN_WINNER_LINK,
  planLinkRepairs,
  repairMalformedLink,
  repairMalformedLinks,
} from '@Mutate/drawDefinitions/links/repairMalformedLinks';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  MAIN,
  POSITION,
  QUALIFYING,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  WINNER,
} from '@Constants/drawDefinitionConstants';

/**
 * A ROUND ROBIN'S LINK NAMES FINISHING POSITIONS, NOT A ROUND — and that is correct, never malformed.
 *
 * Two kinds of link leave a structure (malformedLinks.ts):
 *  - WINNER / LOSER links name a ROUND (`source.roundNumber`): an elimination structure decides who leaves it match by
 *    match. One of these with no round cannot say which round it directs, and is an error (CA, 2026-10-06).
 *  - POSITION links name FINISHING POSITIONS (`source.finishingPositions`): a round robin decides who leaves it by
 *    TALLY, once its groups are complete, so no round decides who leaves it (a qualifying link records the groups' final
 *    round, a playoff link none). Round robin qualifying into MAIN and round robin
 *    into its playoffs are built this way.
 *
 * This was misread once (2026-10-23). The malformed-link check had been written for the first kind, and a prod count
 * found 294 draws (2017–2023, classic TMX conversions) whose round robin qualifying link into MAIN is labelled
 * `linkType: WINNER`, with `finishingPositions: [1]` and no round. Read as a WINNER link it is "missing its round": the
 * draw refused every outcome, the integrity scan called it an error, and the repair looked for the container's final
 * round, found none (a container has no rounds of its own) and REMOVED the link joining qualifying to MAIN. Read for
 * what it is, it is a POSITION link under a legacy label. These tests pin both readings apart.
 *
 * Each legacy draw is generated well-formed (POSITION) and its link relabelled WINNER, exactly the stored shape.
 */

const ROUND_ROBIN_QUALIFYING = {
  drawSize: 32,
  qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN, qualifyingPositions: 4 }] }],
};

function generate(drawProfile: any) {
  setSubscriptions({});
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: false });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  return { tournamentRecord, drawDefinition, drawId };
}

/** the link out of the round robin, as the factory writes it */
function roundRobinLink(drawDefinition: any) {
  const containerIds = drawDefinition.structures
    .filter((structure: any) => structure.structures?.length)
    .map(({ structureId }: any) => structureId);
  const links = drawDefinition.links.filter((link: any) => containerIds.includes(link.source.structureId));
  expect(links.length).toBeGreaterThan(0);
  return links[0];
}

/**
 * The stored shape of a classic TMX conversion: the same link labelled WINNER, with no round. `asPosition` is the
 * POSITION link it means, the one the repair must leave behind.
 */
function legacyDraw(drawProfile: any = ROUND_ROBIN_QUALIFYING) {
  const generated = generate(drawProfile);
  const link = roundRobinLink(generated.drawDefinition);
  delete link.source.roundNumber;
  const asPosition = structuredClone(link);
  link.linkType = WINNER;
  return { ...generated, link, asPosition };
}

describe('the factory writes a round robin link by finishing position', () => {
  it('round robin qualifying into MAIN: POSITION, by finishing position', () => {
    const { drawDefinition } = generate(ROUND_ROBIN_QUALIFYING);
    const link = roundRobinLink(drawDefinition);
    expect(link.linkType).toEqual(POSITION);
    expect(link.source.finishingPositions).toEqual([1]);
    // the groups' final round is recorded, and decides nothing: the groups' winners leave by tally
    expect(link.source.roundNumber).toEqual(3);

    // no round is CORRECT here: the link is neither malformed nor reported
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(false);
    expect(isMalformedRoundLink(link)).toEqual(false);
    expect(isLegacyRoundRobinWinnerLink(link, drawDefinition)).toEqual(false);
    expect(getMalformedRoundLink(drawDefinition)).toBeUndefined();
    const { inconsistencies }: any = getDrawInconsistencies({ drawDefinition });
    expect(inconsistencies.filter(({ linkType }: any) => linkType)).toEqual([]);
  });

  it('round robin into its playoffs: POSITION, by finishing position, and no round', () => {
    const { drawDefinition } = generate({ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF });
    const link = roundRobinLink(drawDefinition);
    expect(link.linkType).toEqual(POSITION);
    expect(link.source.finishingPositions.length).toBeGreaterThan(0);
    expect(link.source.roundNumber).toBeUndefined();
    expect(getMalformedRoundLink(drawDefinition)).toBeUndefined();
  });
});

describe('a round robin link labelled WINNER is a POSITION link under a legacy name', () => {
  it('is recognised, is not malformed, and does not refuse the draw', () => {
    const { drawDefinition, link } = legacyDraw();
    expect(isLegacyRoundRobinWinnerLink(link, drawDefinition)).toEqual(true);
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(false);
    expect(getMalformedRoundLink(drawDefinition)).toBeUndefined();
  });

  it('is recognised out of round robin playoffs too', () => {
    const { drawDefinition, link } = legacyDraw({ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF });
    expect(isLegacyRoundRobinWinnerLink(link, drawDefinition)).toEqual(true);
    expect(getMalformedRoundLink(drawDefinition)).toBeUndefined();
  });

  it('is reported as info by the integrity scan, never as an error, and the draw stays valid', () => {
    const { drawDefinition, link } = legacyDraw();
    const result: any = getDrawInconsistencies({ drawDefinition });
    const linkFindings = result.inconsistencies.filter(({ linkType }: any) => linkType);
    expect(linkFindings.map(({ issueType, severity }: any) => [issueType, severity])).toEqual([
      [LEGACY_ROUND_ROBIN_WINNER_LINK, 'info'],
    ]);
    expect(linkFindings[0].sourceStructureId).toEqual(link.source.structureId);
    expect(result.valid).toEqual(true);
  });

  it('accepts outcomes in the round robin qualifying groups and in MAIN', () => {
    const { tournamentRecord, drawId } = legacyDraw();
    tournamentEngine.setState(tournamentRecord);
    for (const stage of [QUALIFYING, MAIN]) {
      const matchUps = tournamentEngine
        .allTournamentMatchUps({ contextFilters: { stages: [stage] } })
        .matchUps.filter(({ readyToScore }: any) => readyToScore);
      expect(matchUps.length).toBeGreaterThan(0);
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUps[0].matchUpId,
        outcome: { winningSide: 1 },
        matchUpStatus: COMPLETED,
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });
});

describe('the repair relabels it POSITION, and never removes it or gives it a round', () => {
  it('repairMalformedLinks relabels the link POSITION and changes nothing else about it', () => {
    const { tournamentRecord, drawDefinition, link, asPosition } = legacyDraw();
    const result: any = repairMalformedLinks({ drawDefinition, tournamentRecord });
    expect(result.success).toEqual(true);
    expect(result.removed).toEqual([]);
    expect(result.repaired).toEqual([]);
    expect(result.relabeled).toEqual([
      expect.objectContaining({
        reason: LEGACY_ROUND_ROBIN_WINNER_LINK,
        sourceStructureId: link.source.structureId,
        targetStructureId: link.target.structureId,
        finishingPositions: [1],
        from: WINNER,
        to: POSITION,
      }),
    ]);
    expect(result.unlinkedStructureIds).toEqual([]);
    expect(roundRobinLink(drawDefinition)).toEqual(asPosition);
    expect(getDrawInconsistencies({ drawDefinition }).inconsistencies).toEqual([]);
  });

  it('needs no force once qualifiers have played: only the label changes', () => {
    const { tournamentRecord, drawDefinition, drawId } = legacyDraw();
    tournamentEngine.setState(tournamentRecord);
    const qualifyingId = drawDefinition.structures.find(({ stage }: any) => stage === QUALIFYING).structureId;
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { structureIds: [qualifyingId] },
      matchUpFilters: { readyToScore: true },
    });
    for (const { matchUpId } of matchUps) {
      tournamentEngine.setMatchUpStatus({ matchUpId, outcome: { winningSide: 1 }, matchUpStatus: COMPLETED, drawId });
    }
    const stored = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const plan: any = planLinkRepairs({ drawDefinition: stored });
    expect(plan.arrived).toEqual([]);
    expect(plan.relabeled.length).toEqual(1);
    const result: any = tournamentEngine.repairMalformedLinks({ drawId });
    expect(result.success).toEqual(true);
    expect(result.relabeled.length).toEqual(1);
    expect(roundRobinLink(tournamentEngine.getEvent({ drawId }).drawDefinition).linkType).toEqual(POSITION);
  });

  it('repairMalformedLink relabels the one link it is pointed at', () => {
    const { tournamentRecord, drawDefinition, link } = legacyDraw();
    const result: any = repairMalformedLink({
      sourceStructureId: link.source.structureId,
      drawDefinition,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.relabeled.length).toEqual(1);
    expect(link.linkType).toEqual(POSITION);
  });
});

describe('migrateTournamentRecord relabels it as a legacy promotion', () => {
  it('counts the link, leaves it POSITION, and stores the edges without a warning', () => {
    const { tournamentRecord, drawDefinition, asPosition } = legacyDraw();
    const result: any = migrateTournamentRecord({ tournamentRecord });
    expect(result.success).toEqual(true);
    expect(result.promoted.links).toEqual(1);
    expect(result.warnings).toBeUndefined();
    expect(roundRobinLink(drawDefinition)).toEqual(asPosition);

    const again: any = migrateTournamentRecord({ tournamentRecord });
    expect(again.promoted.links).toEqual(0);
  });
});

describe('what stays malformed: a WINNER link out of an ELIMINATION structure with no round', () => {
  it('is malformed whatever finishingPositions it carries: an elimination structure is left by round', () => {
    const { drawDefinition } = generate({
      drawSize: 32,
      qualifyingProfiles: [
        { structureProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION, qualifyingPositions: 4 }] },
      ],
    });
    const link = drawDefinition.links.find(({ linkType }: any) => linkType === WINNER);
    link.source = { structureId: link.source.structureId, finishingPositions: [1] };
    expect(isLegacyRoundRobinWinnerLink(link, drawDefinition)).toEqual(false);
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(true);
    expect(getMalformedRoundLink(drawDefinition)?.error).toBeDefined();
  });

  it('a round robin WINNER label with no finishingPositions names nothing that can leave, and is malformed', () => {
    const { drawDefinition, link } = legacyDraw();
    delete link.source.finishingPositions;
    expect(isLegacyRoundRobinWinnerLink(link, drawDefinition)).toEqual(false);
    expect(isMalformedRoundLink(link, drawDefinition)).toEqual(true);
  });

  it('without the draw the source cannot be seen, and the WINNER label is read as the WINNER link it claims to be', () => {
    const { link } = legacyDraw();
    expect(isLegacyRoundRobinWinnerLink(link)).toEqual(false);
    expect(isMalformedRoundLink(link)).toEqual(true);
  });
});
