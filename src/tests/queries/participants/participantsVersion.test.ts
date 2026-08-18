import { participantsVersion } from '@Query/participants/participantsVersion';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `participantsVersion` handshake — G2 / D2.
 *
 * Measured motivation: participants are 52%–78.6% of an event payload, the same 412 KB block is
 * byte-identical across all five events of a slam-shaped tournament (5x duplication), and
 * `getEventData` returns ALL tournament participants regardless of event — 86.4% of them irrelevant
 * to the smallest event. See Mentat/planning/PUBLISH_WARMCACHE_AND_PAYLOAD_DECOMPOSITION.md.
 *
 * The handshake exists so a client can PROVE what it holds rather than ASSERT it. Assertion fails
 * silently — every bracket side renders TBD.
 */
describe('participantsVersion', () => {
  function loadTournament() {
    return mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
  }

  describe('the stamp itself', () => {
    it('is stable across calls and independent of ordering', () => {
      const participants = [{ participantId: 'a', participantName: 'A' }, { participantId: 'b' }];
      const reversed = [...participants].reverse();

      expect(participantsVersion(participants)).toEqual(participantsVersion(participants));
      // ordering is not a content change; treating it as one would mean the handshake never fires
      expect(participantsVersion(reversed)).toEqual(participantsVersion(participants));
    });

    it('changes when content changes, not merely when length does', () => {
      const base = [{ participantId: 'a', participantName: 'A' }];
      const renamed = [{ participantId: 'a', participantName: 'CHANGED' }];
      const added = [...base, { participantId: 'b' }];

      expect(participantsVersion(renamed)).not.toEqual(participantsVersion(base));
      expect(participantsVersion(added)).not.toEqual(participantsVersion(base));
    });

    it('encodes the count, so sets of different size can never collide', () => {
      // The count is the cheap discriminator that makes a false MATCH — the dangerous direction —
      // require a collision on count AND two independent hashes.
      const version = participantsVersion([{ participantId: 'a' }, { participantId: 'b' }]);
      expect(version?.startsWith('p1-2-')).toEqual(true);
    });

    it('returns undefined for a non-array rather than a stamp that means nothing', () => {
      expect(participantsVersion(undefined)).toBeUndefined();
      expect(participantsVersion(null as any)).toBeUndefined();
    });
  });

  describe('getEventData integration', () => {
    it('ADDITIVE — omitting participantsVersion is byte-identical to today, apart from the new field', () => {
      // The load-bearing guarantee. ClubSpark runs the existing pattern at scale for USTA and ITA;
      // default output must not move. Asserted mechanically rather than promised in review.
      const {
        eventIds: [eventId],
      } = loadTournament();

      const result: any = tournamentEngine.getEventData({ eventId });
      const { participantsVersion: version, ...withoutNewField } = result;

      expect(version).toBeDefined();
      expect(withoutNewField.participants?.length).toBeGreaterThan(0);
      expect(withoutNewField.eventData).toBeDefined();
      expect(withoutNewField.success).toEqual(true);
      // nothing else appeared
      expect(Object.keys(withoutNewField).sort()).toEqual(['eventData', 'participants', 'success']);
    });

    it('omits participants ONLY on an exact version match', () => {
      const {
        eventIds: [eventId],
      } = loadTournament();

      const first: any = tournamentEngine.getEventData({ eventId });
      const version = first.participantsVersion;
      expect(first.participants.length).toBeGreaterThan(0);

      const second: any = tournamentEngine.getEventData({ eventId, participantsVersion: version });
      expect(second.participants).toBeUndefined();
      // the stamp still rides the response, so the client can detect a later change
      expect(second.participantsVersion).toEqual(version);
      // and the rest of the payload is untouched
      expect(second.eventData).toBeDefined();
    });

    it.each([
      ['a stale version', 'p1-1-aaaabbbb'],
      ['a malformed version', 'nonsense'],
      ['an empty string', ''],
    ])('INCLUDES participants on %s — the safe direction', (_label, supplied) => {
      const {
        eventIds: [eventId],
      } = loadTournament();

      const result: any = tournamentEngine.getEventData({ eventId, participantsVersion: supplied });
      expect(result.participants?.length).toBeGreaterThan(0);
    });

    it('a participant change invalidates the stamp, so a stale client is re-sent the set', () => {
      // Proves the stamp tracks real mutations rather than agreeing with itself forever.
      //
      // Uses ADDITION deliberately. An earlier version of this test renamed a participant via
      // `modifyParticipant`, which returns success:true while leaving `participantName` untouched —
      // for an INDIVIDUAL the name is derived from `person`, so a direct edit is recomputed away.
      // That made the test look like a stamp defect when the mutation had simply not happened.
      const {
        eventIds: [eventId],
      } = loadTournament();

      const before: any = tournamentEngine.getEventData({ eventId });
      const staleVersion = before.participantsVersion;

      const { participants: additions } = mocksEngine.generateParticipants({
        participantsCount: 1,
        participantType: 'INDIVIDUAL',
        nonRandom: 2,
      });
      const result: any = tournamentEngine.addParticipants({ participants: additions });
      expect(result.success).toEqual(true);

      const after: any = tournamentEngine.getEventData({ eventId, participantsVersion: staleVersion });
      expect(after.participantsVersion).not.toEqual(staleVersion);
      // the whole point: a client holding the old set is NOT left with a silently stale one
      expect(after.participants?.length).toBeGreaterThan(0);
    });

    it('a SCORE does not invalidate the stamp — participants and results change at different rates', () => {
      // This is the premise the whole tier rests on. If scoring moved the stamp, the handshake would
      // never fire during play and the optimization would be worthless. Verified, not assumed.
      const {
        eventIds: [eventId],
        drawIds: [drawId],
      } = loadTournament();

      const before: any = tournamentEngine.getEventData({ eventId });

      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-4 6-2',
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
      });
      const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
      const target = matchUps.find(
        (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
      );
      const scored: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
      expect(scored.success).toEqual(true);

      const after: any = tournamentEngine.getEventData({ eventId, participantsVersion: before.participantsVersion });
      expect(after.participantsVersion).toEqual(before.participantsVersion);
      expect(after.participants).toBeUndefined(); // still omitted — the saving survives play
    });
  });
});
