import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { RETRIEVAL } from '@Constants/timeItemConstants';

/**
 * A caller-supplied `timeItem.createdAt` must be honoured, not overwritten.
 *
 * `createdAt` is the ORDERING KEY that resolves "the latest value" across the
 * query layer — ratings (`getScaleValues`, `participantScaleItem`), check-in,
 * `startTime`/`endTime`, schedule details, quality-win points. Stamping it
 * unconditionally means it can only ever record *write* time, so an edit made at
 * a venue and synced hours later is recorded as having happened at sync time.
 *
 * Honouring a supplied value is what makes the mutation faithfully replayable —
 * the same principle as minting ids at the origin.
 *
 * Every assertion is paired with its opposite: an implementation that ignored the
 * parameter entirely would still satisfy a one-directional test.
 */

const SUPPLIED = '2026-06-15T14:05:00.000Z';

function seedParticipant() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ nonRandom: 1 });
  tournamentEngine.setState(tournamentRecord);
  const { participants } = tournamentEngine.getParticipants();
  return participants[0].participantId;
}

function participantTimeItems(participantId: string): any[] {
  const { participants } = tournamentEngine.getParticipants();
  return participants.find((p: any) => p.participantId === participantId)?.timeItems ?? [];
}

describe('addTimeItem — supplied createdAt', () => {
  it('uses the supplied createdAt verbatim', () => {
    const participantId = seedParticipant();

    const result: any = tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: { itemType: RETRIEVAL, itemValue: 'supplied', createdAt: SUPPLIED },
    });
    expect(result.success).toEqual(true);

    const added = participantTimeItems(participantId).at(-1);
    expect(added.createdAt).toEqual(SUPPLIED);
  });

  it('still stamps when no createdAt is supplied — the default path is unchanged', () => {
    // The negative direction. No existing caller supplies createdAt, so this is
    // the behaviour every current code path depends on.
    const participantId = seedParticipant();
    const before = Date.now();

    tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: { itemType: RETRIEVAL, itemValue: 'minted' },
    });

    const added = participantTimeItems(participantId).at(-1);
    expect(typeof added.createdAt).toEqual('string');
    // Stamped from the clock, not left undefined.
    expect(new Date(added.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('a supplied createdAt survives into the ordering the query layer reads', () => {
    // The point of the change: two timeItems added in one order but stamped in
    // the other must sort by the SUPPLIED times, since that is what "latest
    // value" resolution keys on.
    const participantId = seedParticipant();

    tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: { itemType: RETRIEVAL, itemValue: 'later-event', createdAt: '2026-06-15T18:00:00.000Z' },
    });
    tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: { itemType: RETRIEVAL, itemValue: 'earlier-event', createdAt: '2026-06-15T09:00:00.000Z' },
    });

    const items = participantTimeItems(participantId).filter((i: any) => i.itemType === RETRIEVAL);
    const byCreatedAt = items.toSorted(
      (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Insertion order and event order deliberately disagree.
    expect(items.map((i: any) => i.itemValue)).toEqual(['later-event', 'earlier-event']);
    expect(byCreatedAt.map((i: any) => i.itemValue)).toEqual(['earlier-event', 'later-event']);
  });

  it('two instances replaying the same call agree on createdAt', () => {
    // Models the server run and the client re-run on ack: identical params in,
    // identical timestamps out. Without a supplied value these would differ by
    // however long the round trip took.
    const timeItem = { itemType: RETRIEVAL, itemValue: 'replayed', createdAt: SUPPLIED };

    const firstParticipantId = seedParticipant();
    tournamentEngine.addParticipantTimeItem({ participantId: firstParticipantId, timeItem: { ...timeItem } });
    const first = participantTimeItems(firstParticipantId).at(-1).createdAt;

    const secondParticipantId = seedParticipant();
    tournamentEngine.addParticipantTimeItem({ participantId: secondParticipantId, timeItem: { ...timeItem } });
    const second = participantTimeItems(secondParticipantId).at(-1).createdAt;

    expect(first).toEqual(second);
    expect(first).toEqual(SUPPLIED);
  });

  it('creationTime:false still adds no createdAt at all', () => {
    // The pre-existing opt-out must keep working — honouring a supplied value
    // must not turn into "always have a createdAt".
    const participantId = seedParticipant();

    tournamentEngine.addParticipantTimeItem({
      participantId,
      creationTime: false,
      timeItem: { itemType: RETRIEVAL, itemValue: 'no-stamp' },
    });

    const added = participantTimeItems(participantId).at(-1);
    expect(added.createdAt).toBeUndefined();
  });
});
