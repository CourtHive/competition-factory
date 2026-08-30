import { inferDrawLinks } from '@Mutate/drawDefinitions/links/inferDrawLinks';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { UNLINKED_STRUCTURES } from '@Constants/errorConditionConstants';
import { LOSER, POSITION } from '@Constants/drawDefinitionConstants';

/**
 * THE ORACLE IS THE FACTORY ITSELF.
 *
 * Asserting that inference produces the links I think it should would only confirm what I typed. So
 * every case here generates a draw the factory LINKED, strips the links, re-infers, and compares
 * against what the generator produced. An inference that disagrees with the generator is wrong by
 * construction, not by opinion.
 */
function generatedDraw(drawType: string, drawSize = 16) {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0];
  return { tournamentRecord, event, drawDefinition: event.drawDefinitions[0] };
}

const stripLinks = (drawDefinition: any) => ({ ...drawDefinition, links: [] });

describe('inferDrawLinks', () => {
  it('leaves an already-linked draw alone', () => {
    const { drawDefinition } = generatedDraw('FIRST_MATCH_LOSER_CONSOLATION');
    let result: any = inferDrawLinks({ drawDefinition });
    expect(result.alreadyLinked).toBe(true);
    expect(result.links).toEqual([]);
  });

  it('leaves a single-structure draw alone — nothing to join', () => {
    const { drawDefinition } = generatedDraw('SINGLE_ELIMINATION');
    expect(drawDefinition.structures.length).toBe(1);
    let result: any = inferDrawLinks({ drawDefinition });
    expect(result.alreadyLinked).toBe(true);
  });

  it('makes a stripped consolation draw READABLE again', () => {
    const { tournamentRecord, event, drawDefinition } = generatedDraw('FIRST_MATCH_LOSER_CONSOLATION');
    const stripped = stripLinks(drawDefinition);

    // The control: without links the factory refuses it outright.
    let refused: any = getDrawData({ tournamentRecord, event, drawDefinition: stripped });
    expect(refused.error).toEqual(UNLINKED_STRUCTURES);

    let result: any = inferDrawLinks({ drawDefinition: stripped });
    expect(result.alreadyLinked).toBe(false);
    const repaired = { ...stripped, links: result.links };

    let readable: any = getDrawData({ tournamentRecord, event, drawDefinition: repaired });
    expect(readable.error).toBeUndefined();
    expect(readable.structures?.length).toBe(2);
  });

  it('agrees with the GENERATOR on link type and direction for a consolation draw', () => {
    const { drawDefinition } = generatedDraw('FIRST_MATCH_LOSER_CONSOLATION');
    const generated = drawDefinition.links[0];
    let result: any = inferDrawLinks({ drawDefinition: stripLinks(drawDefinition) });

    expect(result.inferred[0].confidence).toBe('exact');
    expect(result.links[0].linkType).toBe(generated.linkType);
    expect(result.links[0].linkType).toBe(LOSER);
    expect(result.links[0].source.structureId).toBe(generated.source.structureId);
    expect(result.links[0].target.structureId).toBe(generated.target.structureId);
  });

  it('agrees with the GENERATOR that a round-robin playoff feeds by POSITION, not LOSER', () => {
    const { drawDefinition } = generatedDraw('ROUND_ROBIN_WITH_PLAYOFF', 8);
    const generated = drawDefinition.links[0];
    expect(generated.linkType).toBe(POSITION);

    let result: any = inferDrawLinks({ drawDefinition: stripLinks(drawDefinition) });
    // The distinction this asserts: an elimination source feeds LOSER, a CONTAINER source feeds
    // POSITION. Getting it from structureType rather than guessing is the whole point.
    expect(result.links[0].linkType).toBe(POSITION);
    expect(result.links[0].source.structureId).toBe(generated.source.structureId);
    expect(result.links[0].target.structureId).toBe(generated.target.structureId);
  });

  it('reports SHAPE confidence, and says why, when the feed pattern cannot be recovered', () => {
    // COMPASS is 8 structures and 7 links whose pattern follows drawType. Readability is recoverable;
    // the pattern is not, and claiming otherwise would be the dangerous outcome.
    const { tournamentRecord, event, drawDefinition } = generatedDraw('COMPASS');
    expect(drawDefinition.structures.length).toBeGreaterThan(2);

    let result: any = inferDrawLinks({ drawDefinition: stripLinks(drawDefinition) });
    expect(result.inferred.every((i: any) => i.confidence === 'shape')).toBe(true);
    expect(result.issues.join(' ')).toContain('drawType');

    const repaired = { ...stripLinks(drawDefinition), links: result.links };
    let readable: any = getDrawData({ tournamentRecord, event, drawDefinition: repaired });
    expect(readable.error).toBeUndefined();
  });

  it('joins N groups with exactly N-1 links — no fan-out, no duplicates', () => {
    const { drawDefinition } = generatedDraw('CURTIS_CONSOLATION');
    const groups = drawDefinition.structures.length;
    let result: any = inferDrawLinks({ drawDefinition: stripLinks(drawDefinition) });
    expect(result.links.length).toBe(groups - 1);
  });

  it('never modifies or removes links a draw already has', () => {
    const { drawDefinition } = generatedDraw('CURTIS_CONSOLATION');
    // Keep only the first link: partly linked, so two groups remain rather than three.
    const partial = { ...drawDefinition, links: [drawDefinition.links[0]] };
    let result: any = inferDrawLinks({ drawDefinition: partial });
    expect(result.links.length).toBeGreaterThan(0);
    // The returned links are ADDITIONS; the caller concatenates. None repeats the retained pair.
    const retained = `${drawDefinition.links[0].source.structureId}->${drawDefinition.links[0].target.structureId}`;
    const added = result.links.map((l: any) => `${l.source.structureId}->${l.target.structureId}`);
    expect(added).not.toContain(retained);
  });
});

/**
 * The point of this feature is data the factory did NOT generate. A third party may omit `stage`
 * entirely, use a stage the factory has no ordering for, or ship structures the existing links do
 * not reference. Those are the real inputs, so they are the ones worth asserting — not a coverage
 * exercise.
 */
describe('inferDrawLinks — third-party shapes', () => {
  const bare = (structures: any[]) => ({ drawId: 'd', structures, links: [] }) as any;

  it('orders by stageSequence when stages are absent, and still joins the draw', () => {
    let result: any = inferDrawLinks({
      drawDefinition: bare([
        { structureId: 'b', stageSequence: 2, matchUps: [] },
        { structureId: 'a', stageSequence: 1, matchUps: [] },
      ]),
    });
    expect(result.links).toHaveLength(1);
    // Sequence decides direction when stage cannot: 1 feeds 2, regardless of array order.
    expect(result.links[0].source.structureId).toBe('a');
    expect(result.links[0].target.structureId).toBe('b');
    expect(result.inferred[0].confidence).toBe('shape');
  });

  it('handles a stage vocabulary it does not know without throwing or dropping a structure', () => {
    let result: any = inferDrawLinks({
      drawDefinition: bare([
        { structureId: 'main', stage: 'MAIN', matchUps: [] },
        { structureId: 'odd', stage: 'SOMETHING_ELSE', matchUps: [] },
      ]),
    });
    expect(result.links).toHaveLength(1);
    // MAIN is known and ranks ahead of anything unrecognised, so it feeds rather than receives.
    expect(result.links[0].source.structureId).toBe('main');
  });

  it('joins three unlinked structures with two links, not three', () => {
    let result: any = inferDrawLinks({
      drawDefinition: bare([
        { structureId: 'q', stage: 'QUALIFYING', matchUps: [] },
        { structureId: 'm', stage: 'MAIN', matchUps: [] },
        { structureId: 'c', stage: 'CONSOLATION', matchUps: [] },
      ]),
    });
    expect(result.links).toHaveLength(2);
    // QUALIFYING feeds by position; MAIN feeds its consolation by loser. Both in one draw.
    expect(result.links[0].linkType).toBe(POSITION);
    expect(result.links[1].linkType).toBe(LOSER);
  });

  it('returns a no-op for a drawDefinition with no structures rather than throwing', () => {
    let result: any = inferDrawLinks({ drawDefinition: { drawId: 'empty' } as any });
    expect(result.alreadyLinked).toBe(true);
    expect(result.links).toEqual([]);
  });
});
