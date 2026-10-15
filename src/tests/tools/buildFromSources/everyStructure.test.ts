import { buildFromSources } from '@Tools/buildFromSources/buildFromSources';
import { randomSource, setRandomSource } from '@Tools/prng';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import {
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_ROUND_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

/**
 * buildFromSources builds EVERY structure of a draw, and gives the draw its true links.
 *
 * It used to read only `structures[0]`: a consolation, a playoff, every COMPASS direction but East were
 * dropped, and nothing reported it. Measured 2026-10-14: 4 of 4 captured ITA tournaments and 85 of 119 USTA
 * playtennis tournaments had lost structures, about 12,600 matchUps (10,100 decided).
 *
 * Each case completes a factory draw, projects it through `getEventData` (the shape those sources carry: every
 * structure, no links), rebuilds it, and compares it with the original.
 */

const matchUpsOf = (structures: any[]): any[] =>
  structures.flatMap((s) => [...(s.matchUps ?? []), ...matchUpsOf(s.structures ?? [])]);

// key order differs between generators, so compare links with their keys sorted
const canonical = (value: any) => Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)));
const linkKey = (link: any) =>
  JSON.stringify({ linkType: link.linkType, source: canonical(link.source), target: canonical(link.target) });
const sortedLinks = (links: any[] = []) => links.map(linkKey).toSorted((a, b) => a.localeCompare(b));

function generated(drawProfile: Record<string, any>, playoffPositions?: number[]) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    // a round robin's playoffs are positioned only as the groups complete, so complete it as it is generated
    completeAllMatchUps: drawProfile.drawType === ROUND_ROBIN_WITH_PLAYOFF,
    drawProfiles: [drawProfile],
    setState: true,
    nonRandom: 1,
  });
  if (playoffPositions) {
    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;
    expect(tournamentEngine.addPlayoffStructures({ drawId, structureId, playoffPositions }).success).toEqual(true);
  }
  // complete every matchUp, playoffs included, on the record itself
  const record = tournamentEngine.getTournament().tournamentRecord;
  const event = record.events[0];
  const drawDefinition = event.drawDefinitions[0];
  mocksEngine.completeDrawMatchUps({
    completeRoundRobinPlayoffs: true,
    tournamentRecord: record,
    completeAllMatchUps: true,
    drawDefinition,
    event,
  });
  tournamentEngine.setState(record);
  const original = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const eventId = event.eventId;
  const { eventData } = tournamentEngine.getEventData({ eventId });
  const decidedCount = matchUpsOf(original.structures).filter((m) => m.winningSide).length;
  return { drawId, original, eventData, decidedCount };
}

const cases: [string, Record<string, any>, number[]?][] = [
  ['SINGLE_ELIMINATION + Playoff 3-4', { drawType: SINGLE_ELIMINATION, drawSize: 16 }, [3, 4]],
  ['SINGLE_ELIMINATION + Playoff 3-4 and 5-8', { drawType: SINGLE_ELIMINATION, drawSize: 16 }, [3, 4, 5, 6, 7, 8]],
  [FEED_IN_CHAMPIONSHIP_TO_QF, { drawType: FEED_IN_CHAMPIONSHIP_TO_QF, drawSize: 32 }],
  [FEED_IN_CHAMPIONSHIP_TO_R16, { drawType: FEED_IN_CHAMPIONSHIP_TO_R16, drawSize: 32 }],
  [FEED_IN_CHAMPIONSHIP, { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 }],
  ['COMPASS', { drawType: 'COMPASS', drawSize: 32 }],
  [CURTIS_CONSOLATION, { drawType: CURTIS_CONSOLATION, drawSize: 64 }],
  [FIRST_MATCH_LOSER_CONSOLATION, { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 32 }],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, { drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 16 }],
  [FIRST_ROUND_LOSER_CONSOLATION, { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 }],
  ['OLYMPIC', { drawType: 'OLYMPIC', drawSize: 16 }],
  [
    'ROUND_ROBIN_WITH_PLAYOFF, a playoff per finishing position',
    {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      drawSize: 16,
      structureOptions: {
        groupSize: 4,
        playoffGroups: [1, 2, 3, 4].map((n) => ({ finishingPositions: [n], structureName: `Playoff ${n}` })),
      },
    },
  ],
];

describe('buildFromSources builds every structure of a draw', () => {
  it.each(cases)(
    '%s',
    (_label, drawProfile, playoffPositions) => {
      const { drawId, original, eventData, decidedCount } = generated(drawProfile, playoffPositions);
      expect(decidedCount).toBeGreaterThan(0);
      const [sourceDraw] = eventData.drawsData;
      expect(sourceDraw.structures.length).toBeGreaterThan(1);

      const result = buildFromSources([eventData]);
      expect(result.unbuiltStructures).toEqual([]);
      if (process.env.BFS_DEBUG)
        console.error(JSON.stringify({ inferred: result.inferredLinks, derived: result.derivedLinks }, null, 1));
      expect(result.inferredLinks).toEqual([]);
      expect(result.derivedLinks.flatMap(({ issues }) => issues)).toEqual([]);

      const rebuilt = result.record.events[0].drawDefinitions[0];
      // every structure, by id, in the source's order
      expect(rebuilt.structures.map((s) => s.structureId)).toEqual(sourceDraw.structures.map((s) => s.structureId));

      // every matchUp, and every decided one keeps its result
      const before = new Map(matchUpsOf(original.structures).map((m) => [m.matchUpId, m]));
      const after = matchUpsOf(rebuilt.structures);
      expect(after.length).toEqual(before.size);
      for (const m of after) {
        expect(m.winningSide).toEqual(before.get(m.matchUpId).winningSide);
        expect(m.score?.scoreStringSide1).toEqual(before.get(m.matchUpId).score?.scoreStringSide1);
      }

      // the true links: those the generator gave the original
      expect(sortedLinks(rebuilt.links)).toEqual(sortedLinks(original.links));

      // and the rebuilt draw reads
      tournamentEngine.setState(result.record);
      const drawData: any = tournamentEngine.getDrawData({ drawId });
      expect(drawData.error).toBeUndefined();
      expect(drawData.drawInfo.drawId).toEqual(drawId);
    },
    180_000,
  );

  const roundRobinWithPlayoffs = () =>
    generated({
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      drawSize: 16,
      structureOptions: {
        groupSize: 4,
        playoffGroups: [1, 2].map((n) => ({ finishingPositions: [n], structureName: `Playoff ${n}` })),
      },
    });

  it('a round robin playoff takes the finishing position its participants hold, whatever it is named', () => {
    const { eventData, original } = roundRobinWithPlayoffs();
    const [draw] = eventData.drawsData;
    // names that would mislead: the participants decide
    draw.structures[1].structureName = 'Playoff 9';
    draw.structures[2].structureName = 'Gold';
    const { record, derivedLinks } = buildFromSources([eventData]);
    expect(sortedLinks(record.events[0].drawDefinitions[0].links)).toEqual(sortedLinks(original.links));
    expect(derivedLinks[0].derived.map(({ basis }) => basis)).toEqual(['roundRobinPlayoff', 'roundRobinPlayoff']);
  });

  it('a round robin playoff nobody has reached takes the number in its name, and says so', () => {
    const { eventData, original } = roundRobinWithPlayoffs();
    const [draw] = eventData.drawsData;
    for (const playoff of draw.structures.slice(1)) {
      for (const m of Object.values<any>(playoff.roundMatchUps).flat()) m.sides = [];
    }
    const { record, derivedLinks } = buildFromSources([eventData]);
    expect(sortedLinks(record.events[0].drawDefinitions[0].links)).toEqual(sortedLinks(original.links));
    expect(derivedLinks[0].derived.map(({ basis }) => basis)).toEqual([
      'roundRobinPlayoffByName',
      'roundRobinPlayoffByName',
    ]);
  });

  it('an unreached round robin playoff with no number in its name is reported, not guessed', () => {
    const { eventData } = roundRobinWithPlayoffs();
    const [draw] = eventData.drawsData;
    draw.structures[2].structureName = 'Gold';
    for (const m of Object.values<any>(draw.structures[2].roundMatchUps).flat()) m.sides = [];
    const { derivedLinks, inferredLinks } = buildFromSources([eventData]);
    expect(derivedLinks[0].issues).toEqual(['Gold: no finishing position in Main accounts for its participants']);
    // still readable: the remaining structure is joined by inferDrawLinks, which reports it
    expect(inferredLinks.length).toEqual(1);
  });

  it('a one-structure draw is built as before: no links, one structure', () => {
    const { eventData } = generated({ drawType: SINGLE_ELIMINATION, drawSize: 16 });
    const result = buildFromSources([eventData]);
    const rebuilt = result.record.events[0].drawDefinitions[0];
    expect(rebuilt.structures.length).toEqual(1);
    expect(rebuilt.links).toBeUndefined();
    expect(result.derivedLinks).toEqual([]);
  });

  it('a structure that cannot be built is reported, not dropped', () => {
    const { eventData } = generated({ drawType: FEED_IN_CHAMPIONSHIP_TO_QF, drawSize: 16 });
    const [draw] = eventData.drawsData;
    draw.structures.push({ structureName: 'nameless' }, { ...draw.structures[1] });
    const result = buildFromSources([eventData]);
    expect(result.unbuiltStructures.map(({ structureName, reason }) => [structureName, reason])).toEqual([
      ['nameless', 'no structureId'],
      [draw.structures[1].structureName, 'repeats a structureId already built'],
    ]);
  });

  it('a source that says losers went elsewhere is reported', () => {
    const { eventData } = generated({ drawType: FEED_IN_CHAMPIONSHIP_TO_QF, drawSize: 16 });
    const [draw] = eventData.drawsData;
    // a third structure the losers of round 1 claim to reach
    const elsewhere = { ...draw.structures[1], structureId: 'elsewhere', structureName: 'Elsewhere' };
    elsewhere.roundMatchUps = { 1: [{ ...draw.structures[1].roundMatchUps[1][0], matchUpId: 'elsewhere-1' }] };
    draw.structures.push(elsewhere);
    draw.structures[0].roundMatchUps[1][0].loserMatchUpId = 'elsewhere-1';
    const { derivedLinks } = buildFromSources([eventData]);
    const issues = derivedLinks.flatMap((report) => report.issues);
    expect(issues.some((issue) => issue.includes('losers go to another structure'))).toEqual(true);
    expect(issues.some((issue) => issue.includes('no link says so'))).toEqual(true);
  });

  it('deriving links draws nothing from the random source', () => {
    const { eventData } = generated({ drawType: 'COMPASS', drawSize: 16 });
    setRandomSource(42);
    const first = randomSource()();
    setRandomSource(42);
    buildFromSources([eventData]);
    expect(randomSource()()).toEqual(first);
    setRandomSource();
  });
});
