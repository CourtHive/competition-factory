import { STRUCTURE_REPORT } from '@Constants/reportConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A structure report identifies its winner by `winningPersonId` — a PERSON id,
 * not a participantId. The name map alone cannot answer "which participant is
 * this": it deliberately points both ids at the same string. Without a parallel
 * id map the winner column names someone a consumer cannot resolve, which is why
 * the winner was the one participant in the reports surface with no reachable
 * card.
 */
describe('Structure report — winningParticipantId', () => {
  const generate = () => tournamentEngine.generateReport({ reportId: STRUCTURE_REPORT }) as any;

  it('emits an id that resolves to a real participant, not the raw personId', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
      completeAllMatchUps: true,
      setState: true,
      nonRandom: 1,
    });

    const result = generate();
    expect(result.error).toBeUndefined();

    const decided = result.rows.filter((row: any) => row.winner);
    expect(decided.length, 'no structure reported a winner — the case is untested').toBeGreaterThan(0);

    const participants = tournamentEngine.getParticipants({}).participants ?? [];
    const byId: Record<string, any> = {};
    for (const participant of participants) byId[participant.participantId] = participant;

    for (const row of decided) {
      expect(row.winningParticipantId).toBeTruthy();
      const participant = byId[row.winningParticipantId];
      // The id must be resolvable by `getParticipants` — that is precisely what a
      // participant card does with it. A personId would fail here.
      expect(participant, `winningParticipantId ${row.winningParticipantId} is not a participantId`).toBeTruthy();
      // ...and it must be the participant whose name the row already displays.
      expect(participant.participantName).toEqual(row.winner);
    }
  });

  /**
   * The structure report is **person-oriented by design** — it records
   * `winningPersonId` / `winningPerson2Id` alongside per-person WTN details, and
   * the `winner` column already displays only the FIRST individual's name for a
   * doubles draw. The id therefore resolves to that same individual, not to the
   * PAIR: it must open the card for the person whose name the row shows.
   *
   * Resolving to the PAIR would be worse on both counts — the id would disagree
   * with the displayed name, and `participantProfileModal` is person-oriented
   * throughout, so a PAIR renders a mostly-empty card.
   */
  it('resolves a doubles winner to the individual the row actually names', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventName: 'Doubles', eventType: DOUBLES_EVENT }],
      completeAllMatchUps: true,
      setState: true,
      nonRandom: 1,
    });

    const decided = generate().rows.filter((row: any) => row.winner);
    expect(decided.length).toBeGreaterThan(0);

    const participants = tournamentEngine.getParticipants({}).participants ?? [];
    const byId: Record<string, any> = {};
    for (const participant of participants) byId[participant.participantId] = participant;

    for (const row of decided) {
      const participant = byId[row.winningParticipantId];
      expect(participant).toBeTruthy();
      expect(participant.participantType).toEqual('INDIVIDUAL');
      // The id and the displayed name must agree — that agreement is the whole
      // contract, and it is what a PAIR id would break.
      expect(participant.participantName).toEqual(row.winner);
    }
  });

  it('resolves a team winner, where the id is already a participantId', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      setState: true,
      nonRandom: 1,
    });

    const decided = generate().rows.filter((row: any) => row.winner);
    if (!decided.length) return; // team structures need not report a winner

    const participants = tournamentEngine.getParticipants({}).participants ?? [];
    const byId: Record<string, any> = {};
    for (const participant of participants) byId[participant.participantId] = participant;

    for (const row of decided) {
      expect(byId[row.winningParticipantId]).toBeTruthy();
    }
  });

  it('leaves the id empty rather than guessing when no winner is decided', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
      setState: true,
      nonRandom: 1,
    });

    const undecided = generate().rows.filter((row: any) => !row.winner);
    expect(undecided.length, 'every structure had a winner — the empty case is untested').toBeGreaterThan(0);
    for (const row of undecided) expect(row.winningParticipantId).toEqual('');
  });

  it('does not surface the id as a displayed column', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
      nonRandom: 1,
    });
    const result = generate();
    expect(result.columns.some((column: any) => column.key === 'winningParticipantId')).toBe(false);
  });
});
