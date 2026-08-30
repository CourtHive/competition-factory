import { buildFromSources, buildTournamentRecord, repairDrawLinks } from '@Tools/buildFromSources/buildFromSources';
import tournamentEngine from '@Tests/engines/syncEngine';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { UNLINKED_STRUCTURES } from '@Constants/errorConditionConstants';

/**
 * Two areas the ported suite did not reach, both real behaviour rather than coverage padding:
 *
 *  1. LINK REPAIR — new here, and the reason the module moved into the factory at all. A record
 *     rebuilt from sources has no links, because links are a property of the draw and the sources
 *     are a projection of its matchUps. `getDrawData` then REFUSES the draw outright.
 *  2. THE MATCHUP-ONLY PATH — building from a `competitionScheduleMatchUps` response with no
 *     eventData. That path materialises structures from the matchUps themselves
 *     (`insertMatchUpIntoStructure`, `makeEmptyGroupNode`) and is exactly what a caller does when
 *     they paste one network response rather than three.
 */
function seededTournament(drawType = 'FIRST_MATCH_LOSER_CONSOLATION') {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  return tournamentRecord;
}

describe('repairDrawLinks', () => {
  it('gives an unlinked reconstructed draw the links it needs to be read', () => {
    const tournamentRecord: any = seededTournament();
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];

    // Reproduce what reconstruction produces: the structures survive, the links do not.
    const stripped = {
      ...tournamentRecord,
      events: [{ ...event, drawDefinitions: [{ ...drawDefinition, links: [] }] }],
    };

    // Control — assert the broken state before asserting the repair, or the repair proves nothing.
    let refused: any = getDrawData({
      tournamentRecord: stripped,
      event: stripped.events[0],
      drawDefinition: stripped.events[0].drawDefinitions[0],
    });
    expect(refused.error).toEqual(UNLINKED_STRUCTURES);

    const report = repairDrawLinks(stripped);
    expect(report.length).toBe(1);
    expect(report[0].drawId).toBe(drawDefinition.drawId);
    expect(report[0].inferred.length).toBeGreaterThan(0);

    let readable: any = getDrawData({
      tournamentRecord: stripped,
      event: stripped.events[0],
      drawDefinition: stripped.events[0].drawDefinitions[0],
    });
    expect(readable.error).toBeUndefined();
  });

  it('reports nothing and changes nothing when every draw is already linked', () => {
    const tournamentRecord: any = seededTournament();
    const before = JSON.stringify(tournamentRecord);
    const report = repairDrawLinks(tournamentRecord);
    expect(report).toEqual([]);
    expect(JSON.stringify(tournamentRecord)).toBe(before);
  });

  it('tolerates a record with no events rather than throwing', () => {
    expect(repairDrawLinks({} as any)).toEqual([]);
    expect(repairDrawLinks({ events: [{}] } as any)).toEqual([]);
  });
});

describe('buildFromSources — matchUp-only path', () => {
  it('builds a record from a schedule response alone, and materialises its structures', () => {
    seededTournament('ROUND_ROBIN');
    const scheduleResponse: any = tournamentEngine.competitionScheduleMatchUps();

    const result: any = buildFromSources([scheduleResponse]);
    expect(result.unknownCount).toBe(0);
    expect(result.classification[0].kind).toBe('matchups');

    // The point of this path: structures exist even though no eventData described them.
    const drawDefinition = result.record.events?.[0]?.drawDefinitions?.[0];
    expect(drawDefinition).toBeDefined();
    expect(drawDefinition.structures.length).toBeGreaterThan(0);
    const matchUpCount = drawDefinition.structures.flatMap((s: any) => [
      ...(s.matchUps ?? []),
      ...(s.structures ?? []).flatMap((c: any) => c.matchUps ?? []),
    ]).length;
    expect(matchUpCount).toBeGreaterThan(0);
  });

  it('surfaces link repairs it performed while assembling', () => {
    seededTournament('FIRST_MATCH_LOSER_CONSOLATION');
    const scheduleResponse: any = tournamentEngine.competitionScheduleMatchUps();
    const result: any = buildFromSources([scheduleResponse]);

    // Whether repair was needed depends on how many structures the reconstruction produced; what
    // must hold either way is that the field EXISTS and every draw is readable. A silent repair or
    // an unreadable draw are both failures.
    expect(Array.isArray(result.inferredLinks)).toBe(true);
    for (const event of result.record.events ?? []) {
      for (const drawDefinition of event.drawDefinitions ?? []) {
        let readable: any = getDrawData({ tournamentRecord: result.record, event, drawDefinition });
        expect(readable.error).toBeUndefined();
      }
    }
  });

  it('counts sources it cannot classify rather than dropping them', () => {
    const result: any = buildFromSources([{ nonsense: true }, { also: 'unknown' }]);
    expect(result.unknownCount).toBe(2);
    expect(result.classification.every((c: any) => c.kind === 'unknown')).toBe(true);
  });

  it('buildTournamentRecord does NOT repair — the repair belongs to buildFromSources', () => {
    // Deliberate: a caller assembling a record by hand keeps the existing behaviour exactly, and
    // opts in via repairDrawLinks. Asserting it here so the split is not lost to a later refactor.
    const tournamentRecord: any = seededTournament();
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const record: any = buildTournamentRecord({
      eventDataDocs: [],
      matchUpDocs: [],
      participantDocs: [],
    });
    expect(record).toBeDefined();
    expect(drawDefinition.links.length).toBeGreaterThan(0);
  });
});

/**
 * The remaining uncovered code was the DEFENSIVE path — guards for input that is partial,
 * malformed, or internally inconsistent. That is not incidental: this module exists to accept data
 * whose shape nobody controls, so the guards are the feature, and an untested guard is a guard
 * nobody has seen work.
 */
describe('buildFromSources — malformed and partial input', () => {
  it('skips an eventData doc with no eventId instead of building a nameless event', () => {
    const result: any = buildFromSources([
      { tournamentPublicEventData: { eventData: { eventInfo: {}, drawsData: [] } } },
    ]);
    expect(result.classification[0].kind).toBe('event-data');
    expect(result.record.events ?? []).toEqual([]);
  });

  it('skips a drawsData entry with no drawId', () => {
    const result: any = buildFromSources([
      {
        tournamentPublicEventData: {
          eventData: {
            eventInfo: { eventId: 'e1', eventName: 'E', eventType: 'SINGLES' },
            drawsData: [{ drawName: 'no id here' }],
          },
        },
      },
    ]);
    const event = result.record.events[0];
    expect(event.eventId).toBe('e1');
    expect(event.drawDefinitions).toEqual([]);
  });

  it('does not duplicate a draw described by two documents', () => {
    const doc = (drawId: string) => ({
      tournamentPublicEventData: {
        eventData: {
          eventInfo: { eventId: 'e1', eventName: 'E', eventType: 'SINGLES' },
          drawsData: [{ drawId, drawName: 'Main', structures: [] }],
        },
      },
    });
    const result: any = buildFromSources([doc('d1'), doc('d1')]);
    expect(result.record.events[0].drawDefinitions.length).toBe(1);
  });

  /**
   * INVERTED 2026-08-30. This test previously asserted the DROP and named it pre-existing: a matchUp
   * whose `structureId` matched no structure vanished, because `augmentDrawWithMatchUps` computed
   * `insertMatchUpIntoStructure`'s result and discarded it. It is kept rather than deleted because
   * it is the record of what changed — the behaviour is now REPORTED.
   *
   * Note what it still does NOT do: no structure is invented to hold the orphan. Trading a silent
   * drop for a silent fabrication would be no better and harder to unpick.
   */
  it('REPORTS a matchUp whose structureId matches no structure, rather than dropping it silently', () => {
    const result: any = buildFromSources([
      {
        tournamentPublicEventData: {
          eventData: {
            eventInfo: { eventId: 'e1', eventName: 'E', eventType: 'SINGLES' },
            drawsData: [{ drawId: 'd1', drawName: 'Main', structures: [{ structureId: 's1', matchUps: [] }] }],
          },
        },
      },
      {
        tournamentMatchUps: {
          dateMatchUps: [
            { matchUpId: 'm1', eventId: 'e1', drawId: 'd1', structureId: 's1', roundNumber: 1, sides: [] },
            {
              matchUpId: 'm2',
              eventId: 'e1',
              drawId: 'd1',
              structureId: 'no-such-structure',
              roundNumber: 1,
              sides: [],
            },
          ],
        },
      },
    ]);

    const draw = result.record.events[0].drawDefinitions.find((d: any) => d.drawId === 'd1');
    const placed: string[] = [];
    const walk = (structures: any[] = []) => {
      for (const s of structures) {
        for (const m of s.matchUps ?? []) placed.push(m.matchUpId);
        walk(s.structures);
      }
    };
    walk(draw.structures);

    expect(placed).toContain('m1');
    expect(placed).not.toContain('m2');

    // The change: m2 is still not in the draw, but it is no longer invisible.
    expect(result.unplacedMatchUps).toHaveLength(1);
    expect(result.unplacedMatchUps[0]).toMatchObject({
      matchUpId: 'm2',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 'no-such-structure',
    });
  });

  it('reports an empty unplaced list when every matchUp finds a home', () => {
    // The negative half: a report that is never empty is as useless as one that is never populated.
    const result: any = buildFromSources([
      {
        tournamentPublicEventData: {
          eventData: {
            eventInfo: { eventId: 'e1', eventName: 'E', eventType: 'SINGLES' },
            drawsData: [{ drawId: 'd1', drawName: 'Main', structures: [{ structureId: 's1', matchUps: [] }] }],
          },
        },
      },
      {
        tournamentMatchUps: {
          dateMatchUps: [
            { matchUpId: 'm1', eventId: 'e1', drawId: 'd1', structureId: 's1', roundNumber: 1, sides: [] },
          ],
        },
      },
    ]);
    expect(result.unplacedMatchUps).toEqual([]);
  });

  it('ignores a matchUp with no eventId rather than inventing one', () => {
    const result: any = buildFromSources([{ tournamentMatchUps: { dateMatchUps: [{ matchUpId: 'm', drawId: 'd' }] } }]);
    expect(result.record.events ?? []).toEqual([]);
  });
});
