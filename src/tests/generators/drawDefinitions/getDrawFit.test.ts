import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD, WITHDRAWN } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * getDrawFit — whether an event's entries fit a draw, structure by structure, without making it (CA, 2026-11-08: the
 * dry-run fit query for the topology's Fit mode and the Format Wizard).
 *
 * The counts are the draw generator's own placements: the query runs it and attaches nothing.
 */
function eventWith(entries: { count: number; entryStatus?: string; entryStage?: string }[], participantsCount = 64) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    eventProfiles: [{ eventName: 'Fit' }],
    setState: true,
  });
  const ids = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  let next = 0;
  for (const { count, entryStatus, entryStage } of entries) {
    const participantIds = ids.slice(next, next + count);
    next += count;
    const result: any = tournamentEngine.addEventEntries({ eventId, participantIds, entryStatus, entryStage });
    expect(result.success).toBe(true);
  }
  return eventId as string;
}

const main = (fit: any) => fit.structures.find((s: any) => s.stage === MAIN);

describe('getDrawFit — the sizes a director meets', () => {
  it('32 entries into a 32 draw fit exactly', () => {
    const eventId = eventWith([{ count: 32 }]);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32 });
    expect(fit.success).toBe(true);
    expect(main(fit)).toMatchObject({ positions: 32, placed: 32, byes: 0, notPlaced: 0, status: 'FITS' });
    expect(fit.drawSize).toEqual(32);
  });

  it('26 entries into an unseeded 32: six BYEs nobody is owed — SHORT', () => {
    const eventId = eventWith([{ count: 26 }]);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32 });
    expect(main(fit)).toMatchObject({
      placed: 26,
      byes: 6,
      seedsCount: 0,
      seedByes: 0,
      byesBeyondSeeds: 6,
      status: 'SHORT',
    });
  });

  it('26 entries into a 32 with 8 seeds: the seeds take the six BYEs — FITS', () => {
    // BYEs go to the seeds first (ATP §7.18, WTA §V.A.5.d, USTA FAC II.B.4.d): a draw whose BYEs its seeds absorb is full
    const eventId = eventWith([{ count: 26 }]);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32, seedsCount: 8 });
    expect(main(fit)).toMatchObject({ byes: 6, seedsCount: 8, seedByes: 6, byesBeyondSeeds: 0, status: 'FITS' });
  });

  it('40 entries into a 32: eight not placed, named with the reason — OVER', () => {
    const eventId = eventWith([{ count: 40 }]);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32 });
    expect(main(fit)).toMatchObject({ placed: 32, notPlaced: 8, status: 'OVER' });
    expect(fit.notPlaced).toHaveLength(8);
    expect(fit.notPlaced[0]).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryStage: MAIN });
    expect(fit.notPlaced[0].reason).toBeDefined();
  });

  it('no entries yet: the draw a director builds before registration — EMPTY', () => {
    const eventId = eventWith([]);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32 });
    expect(main(fit)).toMatchObject({ positions: 32, placed: 0, status: 'EMPTY' });
    expect(fit.ledger).toEqual({});
  });
});

describe('getDrawFit — the ledger, and qualifying', () => {
  it('a mixed event: the main draw takes DA and WC plus four qualifiers; alternates and withdrawals wait', () => {
    const eventId = eventWith([
      { count: 24 },
      { count: 4, entryStatus: WILDCARD },
      { count: 6, entryStatus: ALTERNATE },
      { count: 12, entryStage: QUALIFYING },
      { count: 2, entryStatus: WITHDRAWN },
    ]);
    const fit: any = tournamentEngine.getDrawFit({
      qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
      drawSize: 32,
      eventId,
    });

    expect(fit.ledger[MAIN]).toEqual({
      selected: { [DIRECT_ACCEPTANCE]: 24, [WILDCARD]: 4 },
      selectedCount: 28,
      alternates: 6,
      withdrawn: 2,
      other: {},
    });
    expect(fit.ledger[QUALIFYING]).toMatchObject({ selected: { [DIRECT_ACCEPTANCE]: 12 }, selectedCount: 12 });

    expect(main(fit)).toMatchObject({ positions: 32, placed: 28, qualifierSlots: 4, byes: 0, status: 'FITS' });
    const qualifying = fit.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifying).toMatchObject({ positions: 16, placed: 12, byes: 4, status: 'SHORT' });
    expect(fit.notPlaced).toEqual([]);
  });

  it('drawEntries tries a different acceptance without touching the event', () => {
    const eventId = eventWith([{ count: 36 }]);
    const { event } = tournamentEngine.getEvent({ eventId });
    // the director moves the last four below the acceptance line
    const drawEntries = event.entries.map((entry: any, index: number) =>
      index >= 32 ? { ...entry, entryStatus: ALTERNATE } : entry,
    );
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32, drawEntries });
    expect(main(fit)).toMatchObject({ placed: 32, notPlaced: 0, status: 'FITS' });
    expect(fit.ledger[MAIN]).toMatchObject({ selectedCount: 32, alternates: 4 });

    // the event's own entries are as they were
    const after = tournamentEngine.getEvent({ eventId }).event;
    expect(after.entries.filter((e: any) => e.entryStatus === ALTERNATE)).toHaveLength(0);
  });

  it('an over-full trial acceptance is OVER, not refused — as an over-full event is', () => {
    // The generator refuses over-full `drawEntries` ("No stage space available") where it warns for the same entries
    // read from the event. A fit must report the excess either way: the topology passes `drawEntries`.
    const eventId = eventWith([{ count: 26 }]);
    const { event } = tournamentEngine.getEvent({ eventId });
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 16, drawEntries: event.entries });
    expect(fit.error).toBeUndefined();
    expect(main(fit)).toMatchObject({ placed: 16, notPlaced: 10, status: 'OVER' });
    expect(fit.notPlaced).toHaveLength(10);
    // and the event is as it was
    expect(tournamentEngine.getEvent({ eventId }).event.entries).toHaveLength(26);
  });

  it('a round robin counts its groups’ positions', () => {
    const eventId = eventWith([{ count: 30 }]);
    const fit: any = tournamentEngine.getDrawFit({
      structureOptions: { groupSize: 4 },
      drawType: ROUND_ROBIN,
      drawSize: 32,
      eventId,
    });
    expect(main(fit)).toMatchObject({ positions: 32, placed: 30, byes: 2, status: 'SHORT' });
  });
});

describe('getDrawFit — reads, never writes', () => {
  it('attaches no draw and leaves the record as it was', () => {
    const eventId = eventWith([{ count: 24 }]);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const fit: any = tournamentEngine.getDrawFit({ eventId, drawSize: 32 });
    expect(fit.success).toBe(true);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
    expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions ?? []).toHaveLength(0);
  });

  it('refuses without an event', () => {
    eventWith([{ count: 4 }]);
    const fit: any = tournamentEngine.getDrawFit({ drawSize: 32 });
    expect(fit.error).toBeDefined();
  });
});
