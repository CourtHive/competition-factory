import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SIGNED_IN, SIGN_IN_STATUS } from '@Constants/participantConstants';

/**
 * `occurredAt` — recording when something HAPPENED rather than when this
 * instance wrote it.
 *
 * Decisions taken by CA 2026-08-15, recorded in
 * `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md` §4.1:
 *
 *   D1 — record-root `updatedAt` keeps WRITE-time semantics, because the
 *        staleness probe (`POST /factory/updated-at`) derives from it. Only
 *        entity-level timestamps carry event time. Asserted below.
 *   D2 — event-time ordering is authoritative, INCLUDING retroactively: a
 *        rating recorded at a venue and synced later correctly sorts before a
 *        rating actually set after it, even though it arrived second.
 *
 * Every assertion is paired with its opposite, so an implementation that ignored
 * the parameter would not pass on a technicality.
 */

const EARLY = '2026-06-15T09:00:00.000Z';
const LATE = '2026-06-15T18:00:00.000Z';

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { participants } = tournamentEngine.getParticipants();
  return participants[0].participantId;
}

function timeItemsOf(participantId: string, itemType?: string): any[] {
  const { participants } = tournamentEngine.getParticipants();
  const items = participants.find((p: any) => p.participantId === participantId)?.timeItems ?? [];
  return itemType ? items.filter((i: any) => i.itemType === itemType) : items;
}

describe('modifyParticipantsSignInStatus — occurredAt', () => {
  it('records the supplied occurredAt on the timeItem', () => {
    const participantId = seed();

    const result: any = tournamentEngine.modifyParticipantsSignInStatus({
      participantIds: [participantId],
      signInState: SIGNED_IN,
      occurredAt: EARLY,
    });
    expect(result.success).toEqual(true);

    expect(timeItemsOf(participantId, SIGN_IN_STATUS).at(-1).createdAt).toEqual(EARLY);
  });

  it('defaults to now when occurredAt is omitted', () => {
    const participantId = seed();
    const before = Date.now();

    tournamentEngine.modifyParticipantsSignInStatus({
      participantIds: [participantId],
      signInState: SIGNED_IN,
    });

    const createdAt = timeItemsOf(participantId, SIGN_IN_STATUS).at(-1).createdAt;
    expect(new Date(createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('modifyParticipantsPaymentStatus — occurredAt', () => {
  it('records the supplied occurredAt, and defaults to now without it', () => {
    const participantId = seed();

    tournamentEngine.modifyParticipantsPaymentStatus({
      participantIds: [participantId],
      paymentState: 'PAID',
      occurredAt: EARLY,
    });
    const supplied = timeItemsOf(participantId).at(-1).createdAt;
    expect(supplied).toEqual(EARLY);

    const other = seed();
    const before = Date.now();
    tournamentEngine.modifyParticipantsPaymentStatus({ participantIds: [other], paymentState: 'PAID' });
    const minted = timeItemsOf(other).at(-1).createdAt;
    expect(new Date(minted).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('scale items — supplied createdAt (D2: event order is authoritative)', () => {
  it('honours a createdAt on the caller-supplied scaleItem', () => {
    const participantId = seed();

    const result: any = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: {
        scaleType: 'RATING',
        eventType: 'SINGLES',
        scaleName: 'UTR',
        scaleValue: 9.5,
        createdAt: EARLY,
      },
    });
    expect(result.error).toBeUndefined();

    const scaleItems = timeItemsOf(participantId).filter((i: any) => i.itemType?.startsWith('SCALE'));
    expect(scaleItems.at(-1).createdAt).toEqual(EARLY);
  });

  it('a late-arriving EARLIER rating does not supersede a later one — retroactive ordering', () => {
    // The D2 consequence, asserted explicitly. The venue's rating is written
    // SECOND (it synced later) but occurred FIRST, so the rating actually set
    // afterwards must remain current.
    const participantId = seed();
    const scaleAttributes = { scaleType: 'RATING', eventType: 'SINGLES', scaleName: 'UTR' };

    // Arrives first, happened LATE.
    tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: { ...scaleAttributes, scaleValue: 9.9, createdAt: LATE },
    });
    // Arrives second, happened EARLY — the buffered venue edit.
    tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem: { ...scaleAttributes, scaleValue: 9.1, createdAt: EARLY },
    });

    const { scaleItem }: any = tournamentEngine.getParticipantScaleItem({ participantId, scaleAttributes });

    // Resolution keys on createdAt, so the LATE value stays current even though
    // the EARLY one was written last.
    expect(scaleItem.scaleValue).toEqual(9.9);
  });
});

describe('D1 — record-root updatedAt keeps WRITE-time semantics', () => {
  it('occurredAt does not rewrite tournamentRecord.updatedAt', () => {
    // The staleness probe (POST /factory/updated-at) derives from
    // `data->>'updatedAt'`. If a backdated occurredAt moved the record root,
    // a delayed sync would make the record look OLDER than a client's last poll
    // and staleness detection would silently break.
    const participantId = seed();
    const before = tournamentEngine.getTournament().tournamentRecord.updatedAt;

    tournamentEngine.modifyParticipantsSignInStatus({
      participantIds: [participantId],
      signInState: SIGNED_IN,
      occurredAt: EARLY,
    });

    const after = tournamentEngine.getTournament().tournamentRecord.updatedAt;
    // Whatever the root does, it must NOT have been set to the backdated value.
    expect(after).not.toEqual(EARLY);
    if (before && after) expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
});
