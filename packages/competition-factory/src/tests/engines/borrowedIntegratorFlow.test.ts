import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import asyncEngine from '@Assemblies/engines/async';
import * as governors from '@Assemblies/governors';
import mocksEngine from '@Assemblies/engines/mock';
import { ObjectId } from 'bson';
import {
  deepCopyEnabled,
  deleteNotices,
  setDeepCopy,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

// An integrator's flow, as a document-database integration described it (2026-10-15):
//   - copying is switched off ONCE, at startup, with `stringify` for driver ids;
//   - every request runs in its own async context (a per-request state provider) and calls
//     `setState(record, false)` on a plain record read from the database, driver values in place;
//   - subscriptions are set per request, and the subscribers write matchUp changes;
//   - after the queue, `getTournament()` is written back: in borrowed mode, the object passed in;
//   - on a refusal there is no `rollbackOnError`: the caller aborts its transaction and discards
//     the in-memory record.
// One read path calls `setState(record)` with no second argument; the integrator asked whether
// that switches copying back on for every other request in the process. It does not.

/** One request: its own async context, and an engine built inside it (as CFS's getMutationEngine). */
function inRequest<T>(fn: (engine: any) => Promise<T>): Promise<T> {
  return asyncGlobalState.runWithInstanceState(async () => {
    const engine = asyncEngine();
    engine.importMethods(governors, true, 1);
    return fn(engine);
  });
}

/** Subscribes the current request to matchUp modifications, as the integrator's subscribers do. */
function subscribeToMatchUps() {
  const modified: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads) => modified.push(...payloads) } });
  return modified;
}

function databaseRecord() {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  // driver values as a populated `.lean()` read leaves them
  tournamentRecord._id = new ObjectId();
  tournamentRecord.parentOrganisation = new ObjectId();
  for (const participant of tournamentRecord.participants) participant._id = new ObjectId();
  return { tournamentRecord, drawId, eventId };
}

async function firstRoundMatchUpId(engine, drawId: string) {
  const { matchUps } = await engine.allDrawMatchUps({ drawId });
  return matchUps.find((matchUp) => matchUp.roundNumber === 1).matchUpId;
}

const storedMatchUp = (tournamentRecord, matchUpId: string) =>
  tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (matchUp) => matchUp.matchUpId === matchUpId,
  );

const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });

beforeEach(() => {
  setStateProvider(asyncGlobalState);
  setDeepCopy(false, { stringify: ['_id', 'personOtherIds'] }); // once, at startup
});

afterEach(() => {
  setDeepCopy(true, { stringify: [] });
  setStateProvider(syncGlobalState);
  deleteNotices();
});

describe('borrowed mode with a per-request provider', () => {
  it('a request mutates the record it loaded, notifies its own subscribers, and writes back that object', async () => {
    const { tournamentRecord, drawId } = databaseRecord();
    const recordId = tournamentRecord._id;

    const { result, written, modified, matchUpId } = await inRequest(async (engine) => {
      const modified = subscribeToMatchUps();
      await engine.setState(tournamentRecord, false);
      const matchUpId = await firstRoundMatchUpId(engine, drawId);
      const result: any = await engine.executionQueue([
        { method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } },
      ]);
      const { tournamentRecord: written } = await engine.getTournament();
      return { result, written, modified, matchUpId };
    });

    expect(result.success).toEqual(true);
    // the object written back is the one that was loaded, holding the write
    expect(written).toBe(tournamentRecord);
    expect(storedMatchUp(tournamentRecord, matchUpId).winningSide).toEqual(1);
    // driver values are untouched: nothing was copied, so `stringify` never ran on the record
    expect(tournamentRecord._id).toBe(recordId);
    expect(tournamentRecord.participants.every((participant) => participant._id instanceof ObjectId)).toEqual(true);
    // the subscriber heard about the matchUp it must persist
    expect(modified.map(({ matchUp }) => matchUp.matchUpId)).toContain(matchUpId);
    expect(deepCopyEnabled().enabled).toEqual(false);
  });

  it('`setState(record)` with no second argument leaves copying off and borrows the record', async () => {
    const { tournamentRecord } = databaseRecord();

    const written = await inRequest(async (engine) => {
      await engine.setState(tournamentRecord); // the public read path
      return (await engine.getTournament()).tournamentRecord;
    });

    expect(deepCopyEnabled().enabled).toEqual(false);
    expect(written).toBe(tournamentRecord);
  });

  it('`stringify` reaches participants hydrated into context, not the record or `getParticipants`', async () => {
    const { tournamentRecord, eventId } = databaseRecord();

    const { written, participant, sideParticipant, eventDataParticipant } = await inRequest(async (engine) => {
      await engine.setState(tournamentRecord, false);
      const { tournamentRecord: written } = await engine.getTournament();
      const {
        participants: [participant],
      } = await engine.getParticipants();
      const { matchUps } = await engine.allTournamentMatchUps({ inContext: true });
      const sideParticipant = matchUps
        .flatMap((matchUp) => matchUp.sides ?? [])
        .find((side) => side.participant)?.participant;
      const { eventData } = await engine.getEventData({ eventId });
      const eventDataParticipant = eventData.drawsData[0].structures[0].roundMatchUps[1][0].sides[0].participant;
      return { written, participant, sideParticipant, eventDataParticipant };
    });

    expect(written._id).toBeInstanceOf(ObjectId);
    expect(participant._id).toBeInstanceOf(ObjectId);
    expect(typeof sideParticipant._id).toEqual('string');
    expect(typeof eventDataParticipant._id).toEqual('string');
  });

  it('concurrent requests each hold their own record and hear only their own notices', async () => {
    const run = (loaded: ReturnType<typeof databaseRecord>) =>
      inRequest(async (engine) => {
        const modified = subscribeToMatchUps();
        await engine.setState(loaded.tournamentRecord, false);
        const matchUpId = await firstRoundMatchUpId(engine, loaded.drawId);
        await new Promise((resolve) => setTimeout(resolve, 5)); // let the other request interleave
        await engine.executionQueue([
          { method: 'setMatchUpStatus', params: { drawId: loaded.drawId, matchUpId, outcome } },
        ]);
        const { tournamentRecord: written } = await engine.getTournament();
        const matchUpIds = modified.map(({ matchUp }) => matchUp.matchUpId);
        return { written, matchUpId, matchUpIds };
      });

    const a = databaseRecord();
    const b = databaseRecord();
    const [ra, rb] = await Promise.all([run(a), run(b)]);

    expect(ra.written).toBe(a.tournamentRecord);
    expect(rb.written).toBe(b.tournamentRecord);
    expect(ra.matchUpIds).toContain(ra.matchUpId);
    expect(rb.matchUpIds).toContain(rb.matchUpId);
    expect(ra.matchUpIds).not.toContain(rb.matchUpId);
    expect(rb.matchUpIds).not.toContain(ra.matchUpId);
  });

  it('a refused queue without rollback keeps earlier writes and notifies no one: the caller must discard', async () => {
    const { tournamentRecord, drawId } = databaseRecord();

    const { result, modified, matchUpId } = await inRequest(async (engine) => {
      const modified = subscribeToMatchUps();
      await engine.setState(tournamentRecord, false);
      const matchUpId = await firstRoundMatchUpId(engine, drawId);
      const result: any = await engine.executionQueue([
        { method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } },
        { method: 'setMatchUpStatus', params: { drawId, matchUpId: 'not a matchUp', outcome } },
      ]);
      return { result, modified, matchUpId };
    });

    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.rolledBack).toEqual(false);
    // the borrowed record holds the write made before the refusal...
    expect(storedMatchUp(tournamentRecord, matchUpId).winningSide).toEqual(1);
    // ...and no subscriber was told about it
    expect(modified).toEqual([]);
  });
});
