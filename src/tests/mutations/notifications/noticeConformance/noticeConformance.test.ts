import { captureNotices, castDiff, changedEntities, conformanceViolations } from './harness';
import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INDIVIDUAL } from '@Constants/participantConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';

// Workstream D-core scaffold. Demonstrates the notice-completeness invariant on
// two representative mutations: one COVERED (zero violations) and one KNOWN GAP
// (the harness flags it). The full ~640-method catalog sweep is the follow-on.

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: 'conf-t1' },
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    drawProfiles: [{ drawSize: 8, eventName: 'Singles' }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
}

const reset = () => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
};

describe('notice conformance harness (D-core scaffold)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('COMPLETENESS: a covered mutation (modifyParticipant) yields zero violations', () => {
    seed();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const target = participants[0];

    const captured = captureNotices(() => {
      tournamentEngine.modifyParticipant({
        participant: {
          ...target,
          person: { ...(target.person ?? {}), standardGivenName: 'Pete', standardFamilyName: 'Sampras' },
        },
      });
    });
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    expect(captured.some((n) => n.topic === MODIFY_PARTICIPANTS)).toBe(true);
    expect(conformanceViolations(before, after, captured)).toEqual([]);
  });

  it('COMPLETENESS: setEventDates changes the event and is covered by MODIFY_EVENT (C2 closed)', () => {
    seed();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const eventId = before.events[0].eventId;

    const captured = captureNotices(() => {
      tournamentEngine.setEventDates({ eventId, startDate: '2025-01-03', endDate: '2025-01-12' });
    });
    const after = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    // the event attributes changed, and MODIFY_EVENT (added in C2) now covers it.
    expect(changedEntities(before, after).some((c) => c.kind === 'event' && c.change === 'modified')).toBe(true);
    expect(conformanceViolations(before, after, captured)).toEqual([]);
  });

  it('FIDELITY: castDiff is empty for an unchanged record (sanity)', () => {
    seed();
    const record = tournamentEngine.getTournament().tournamentRecord;
    expect(Object.keys(castDiff(record, structuredClone(record)))).toEqual([]);
  });
});
