import { addParticipants } from '@Mutate/participants/addParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { expect, it } from 'vitest';

// constants
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

/**
 * A batch reads the record's participants once (participantsIndex); each answer must be the one adding the same
 * participants one at a time, scanning the record, gives.
 */
const person = (id: string) => ({
  participantId: id,
  participantType: INDIVIDUAL,
  participantRole: COMPETITOR,
  person: { standardGivenName: `Given${id}`, standardFamilyName: `Family${id}` },
});
const pair = (ids: string[], participantId?: string) => ({
  participantType: PAIR,
  participantRole: COMPETITOR,
  individualParticipantIds: ids,
  ...(participantId ? { participantId } : {}),
});

function bothWays(participants: any[], existing: any[] = [], allowDuplicateParticipantIdPairs = false) {
  const batched: any = { tournamentId: 't', participants: makeDeepCopy(existing) };
  const single: any = { tournamentId: 't', participants: makeDeepCopy(existing) };
  const batchedResult = addParticipants({
    participants: makeDeepCopy(participants),
    tournamentRecord: batched,
    allowDuplicateParticipantIdPairs,
    returnParticipants: true,
  });
  // as addParticipants orders them: individuals first
  const ordered = makeDeepCopy(participants).sort(
    (a, b) => Number(a.participantType !== INDIVIDUAL) - Number(b.participantType !== INDIVIDUAL),
  );
  const singleResults = ordered.map((participant) =>
    addParticipant({ participant, tournamentRecord: single, allowDuplicateParticipantIdPairs }),
  );
  return { batched, single, batchedResult, singleResults };
}

const ids = ['a', 'b', 'c', 'd'];

it('a repeated pair, its ids in either order, is the existing pair, and names come in record order', () => {
  const { batched, single, batchedResult } = bothWays(
    [pair(['b', 'a'], 'p1'), pair(['a', 'b'], 'p2'), pair(['c', 'd'], 'p3')],
    ids.map(person),
  );
  expect(batched.participants).toEqual(single.participants);
  expect(batchedResult.addedCount).toEqual(2);
  expect(batched.participants.find((p) => p.participantId === 'p1').participantName).toEqual(
    single.participants.find((p) => p.participantId === 'p1').participantName,
  );
});

it('duplicate pairs are added when allowed', () => {
  const { batched, single } = bothWays([pair(['a', 'b'], 'p1'), pair(['b', 'a'], 'p2')], ids.map(person), true);
  expect(batched.participants).toEqual(single.participants);
  expect(batched.participants.filter((p) => p.participantType === PAIR).length).toEqual(2);
});

it('a stored pair holding more than two ids is matched as the scan matches it', () => {
  const irregular = { ...pair(['a', 'b', 'c'], 'p0') };
  const { batched, single } = bothWays(
    [pair(['a', 'c'], 'p1'), pair(['c', 'd'], 'p2')],
    [...ids.map(person), irregular],
  );
  expect(batched.participants).toEqual(single.participants);
  expect(batched.participants.some((p) => p.participantId === 'p1')).toEqual(false);
});

it('a record repeating a participantId is scanned, and an unknown member refuses a team', () => {
  const repeated = [...ids.map(person), person('a')];
  const { batched, single } = bothWays([pair(['a', 'b'], 'p1')], repeated);
  expect(batched.participants).toEqual(single.participants);

  const team = {
    participantType: TEAM,
    participantRole: COMPETITOR,
    participantName: 'T',
    individualParticipantIds: ['a', 'z'],
  };
  const result: any = addParticipants({
    participants: [team as any],
    tournamentRecord: { tournamentId: 't', participants: ids.map(person) } as any,
  });
  expect(result.error).toBeDefined();
});
