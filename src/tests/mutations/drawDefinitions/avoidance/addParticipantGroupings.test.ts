import { addParticipantGroupings } from '@Query/drawDefinition/avoidance/addParticipantGroupings';
import { expect, test } from 'vitest';

// constants and types
import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';

// Each individual used to scan every team, pair and group; memberships are now read from an index built in
// array order (assessment 2026-10-16 H5). These pin what the scan produced, including its edge cases.

const individual = (participantId: string) => ({ participantId, participantType: INDIVIDUAL });
const container = (participantType: string, participantId: string, individualParticipantIds: string[]) => ({
  participantName: `${participantType} ${participantId}`,
  individualParticipantIds,
  participantType,
  participantId,
});

function groupingsFor(participants: any[]) {
  const { participantsWithGroupings, groupInfo } = addParticipantGroupings({ participants });
  const byId = Object.fromEntries(participantsWithGroupings.map((p) => [p.participantId, p]));
  return { byId, groupInfo };
}

test('memberships are listed in the order the containers appear', () => {
  const { byId, groupInfo } = groupingsFor([
    individual('i1'),
    individual('i2'),
    container(TEAM, 't2', ['i1']),
    container(TEAM, 't1', ['i2', 'i1']),
    container(PAIR, 'p2', ['i1', 'i2']),
    container(PAIR, 'p1', ['i1']),
    container(GROUP, 'g1', ['i2', 'i1']),
  ]);

  expect(byId.i1.teamParticipantIds).toEqual(['t2', 't1']);
  expect(byId.i1.teams.map(({ participantId }) => participantId)).toEqual(['t2', 't1']);
  expect(byId.i1.pairParticipantIds).toEqual(['p2', 'p1']);
  expect(byId.i1.groupParticipantIds).toEqual(['g1']);
  expect(byId.i2.teamParticipantIds).toEqual(['t1']);
  expect(byId.i2.groups.map(({ participantId }) => participantId)).toEqual(['g1']);
  // groupInfo holds teams only, keyed in first-seen order
  expect(Object.keys(groupInfo)).toEqual(['t2', 't1']);
});

test('an individual listed twice in one container is a member once', () => {
  const { byId } = groupingsFor([
    individual('i1'),
    container(TEAM, 't1', ['i1', 'i1']),
    container(PAIR, 'p1', ['i1', 'x', 'i1']),
    container(GROUP, 'g1', ['i1', 'i1']),
  ]);
  expect(byId.i1.teamParticipantIds).toEqual(['t1']);
  expect(byId.i1.teams).toHaveLength(1);
  expect(byId.i1.pairParticipantIds).toEqual(['p1']);
  expect(byId.i1.groupParticipantIds).toEqual(['g1']);
});

test('two container objects with the same participantId count once, the first one wins', () => {
  const first = { ...container(TEAM, 't1', ['i1']), participantName: 'First' };
  const second = { ...container(TEAM, 't1', ['i1']), participantName: 'Second' };
  const { byId, groupInfo } = groupingsFor([individual('i1'), first, second]);
  expect(byId.i1.teamParticipantIds).toEqual(['t1']);
  expect(byId.i1.teams.map(({ participantName }) => participantName)).toEqual(['First']);
  expect(groupInfo.t1.participantName).toEqual('First');
});

test('individuals in no container get empty lists, and containers are not annotated', () => {
  const { byId } = groupingsFor([individual('i1'), individual('i2'), container(TEAM, 't1', ['i2'])]);
  expect(byId.i1).toMatchObject({ teamParticipantIds: [], pairParticipantIds: [], groupParticipantIds: [], teams: [] });
  expect(byId.t1.teamParticipantIds).toBeUndefined();
});
