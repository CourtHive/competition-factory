import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { setSubscriptions } from '@Global/state/globalState';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import {
  CANNOT_MODIFY_TIEFORMAT,
  INVALID_GENDER,
  INVALID_VALUES,
  NOT_IMPLEMENTED,
} from '@Constants/errorConditionConstants';

function fixture(type = SINGLES) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });
  const event = tournamentRecord.events![0];
  const draw = event.drawDefinitions![0];
  const parents = draw.structures!.flatMap((s) => s.matchUps ?? []);
  const parent = parents[0];
  const collection = event.tieFormat!.collectionDefinitions.find((c) => c.matchUpType === type)!;
  const children = parent.tieMatchUps!.filter((m) => m.collectionId === collection.collectionId);
  for (const matchUp of parents) {
    for (const side of matchUp.sides ?? []) delete side.lineUp;
    for (const child of matchUp.tieMatchUps ?? []) for (const side of child.sides ?? []) delete side.participantId;
  }
  delete draw.lineUps;
  const params = {
    drawId,
    matchUpId: parent.matchUpId,
    collectionId: collection.collectionId,
    matchUpType: type === SINGLES ? DOUBLES : SINGLES,
  };
  const load = () => tournamentEngine.setState(tournamentRecord);
  const stored = () =>
    tournamentEngine
      .allTournamentMatchUps({ inContext: false, matchUpFilters: { matchUpTypes: [TEAM] } })
      .matchUps.find((m) => m.matchUpId === parent.matchUpId);
  load();
  return { tournamentRecord, event, draw, parents, parent, collection, children, params, load, stored };
}

afterEach(() => setSubscriptions({ subscriptions: {} }));

it.each([SINGLES, DOUBLES])(
  'converts %s rubbers in one encounter and preserves identities, schedule and other encounters',
  (type) => {
    const f = fixture(type);
    f.children[0].schedule = { scheduledDate: '2026-11-03', scheduledTime: '10:00', courtId: 'court-1' };
    f.load();
    const before = structuredClone(f.stored());
    let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
    expect(result.success).toBe(true);
    const after = f.stored();
    expect(after.tieMatchUps.map((m) => m.matchUpId)).toEqual(before.tieMatchUps.map((m) => m.matchUpId));
    for (const child of after.tieMatchUps.filter((m) => m.collectionId === f.collection.collectionId)) {
      expect(child.matchUpType).toBe(f.params.matchUpType);
      expect(child.collectionPosition).toBe(
        before.tieMatchUps.find((m) => m.matchUpId === child.matchUpId).collectionPosition,
      );
    }
    expect(after.tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).schedule).toEqual(
      f.children[0].schedule,
    );
    expect(
      tournamentEngine
        .getTieFormat({ drawId: f.params.drawId })
        .tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
    ).toBe(type);
    expect(
      tournamentEngine
        .getTieFormat(f.params)
        .tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
    ).toBe(f.params.matchUpType);
  },
);

it('refuses assigned players without an explicit clear and leaves the whole record unchanged', () => {
  const f = fixture();
  f.parent.sides = [
    {
      sideNumber: 1,
      lineUp: [
        {
          participantId: 'player-1',
          collectionAssignments: [{ collectionId: f.collection.collectionId, collectionPosition: 1 }],
        },
      ],
    },
  ];
  f.load();
  const before = structuredClone(f.stored());
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  expect(f.stored()).toEqual(before);
});

it('explicit clear removes only the changed collection assignments, retaining players and other lines', () => {
  const f = fixture();
  const otherId = f.event.tieFormat!.collectionDefinitions.find(
    (c) => c.collectionId !== f.collection.collectionId,
  )!.collectionId;
  f.parent.sides = [
    {
      sideNumber: 1,
      lineUp: [
        {
          participantId: 'player-1',
          collectionAssignments: [
            { collectionId: f.collection.collectionId, collectionPosition: 1 },
            { collectionId: otherId, collectionPosition: 1 },
          ],
        },
      ],
    },
  ];
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, clearCollectionAssignments: true });
  expect(result.success).toBe(true);
  expect(f.stored().sides[0].lineUp).toEqual([
    { participantId: 'player-1', collectionAssignments: [{ collectionId: otherId, collectionPosition: 1 }] },
  ]);
});

it.each(['status', 'score', 'winner', 'start'])('refuses an affected rubber with %s, even with overrides', (kind) => {
  const f = fixture();
  const child = f.children.at(-1)!;
  if (kind === 'status') child.matchUpStatus = IN_PROGRESS;
  if (kind === 'score') child.score = { sets: [{ setNumber: 1, side1Score: 1, side2Score: 0 }] };
  if (kind === 'winner') child.winningSide = 1;
  if (kind === 'start') child.timeItems = [{ itemType: 'SCHEDULE.TIME.START', itemValue: '10:00' }];
  f.load();
  const before = structuredClone(f.stored());
  let result: any = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    clearCollectionAssignments: true,
    updateInProgressMatchUps: true,
  });
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  expect(f.stored()).toEqual(before);
});

it('allows an untouched collection when a different collection is underway', () => {
  const f = fixture();
  f.parent.matchUpStatus = IN_PROGRESS;
  f.parent.tieMatchUps!.find((m) => m.collectionId !== f.collection.collectionId)!.matchUpStatus = IN_PROGRESS;
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.success).toBe(true);
  expect(f.stored().matchUpStatus).toBe(IN_PROGRESS);
});

it('refuses a finished encounter even without a winner', () => {
  const f = fixture();
  f.parent.matchUpStatus = COMPLETED;
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
});

it('keeps broader conversion refused and disallows combining a type and count change', () => {
  const f = fixture();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, matchUpId: undefined });
  expect(result.error).toBe(NOT_IMPLEMENTED);
  result = tournamentEngine.modifyCollectionDefinition({ ...f.params, matchUpCount: f.collection.matchUpCount + 1 });
  expect(result.error).toBe(INVALID_VALUES);
});

it('announces every changed child and the final parent', () => {
  const f = fixture();
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.success).toBe(true);
  expect(new Set(notices.map(({ matchUp }) => matchUp.matchUpId))).toEqual(
    new Set([f.parent.matchUpId, ...f.children.map((c) => c.matchUpId)]),
  );
  expect(
    notices
      .filter(({ matchUp }) => matchUp.matchUpId !== f.parent.matchUpId)
      .every(({ matchUp }) => matchUp.matchUpType === f.params.matchUpType),
  ).toBe(true);
});

it('does not revive draw-inherited assignments after an explicit encounter-only clear', () => {
  const f = fixture();
  const context = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.matchUpId === f.parent.matchUpId);
  const teamId = context.sides[0].participantId;
  const team = f.tournamentRecord.participants!.find((p) => p.participantId === teamId)!;
  const playerId = team.individualParticipantIds![0];
  f.draw.lineUps = {
    [teamId]: [
      {
        participantId: playerId,
        notes: 'keep competitor metadata',
        collectionAssignments: [{ collectionId: f.collection.collectionId, collectionPosition: 1 }],
      },
    ],
  };
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  result = tournamentEngine.modifyCollectionDefinition({ ...f.params, clearCollectionAssignments: true });
  expect(result.success).toBe(true);
  expect(f.stored().sides.find((s) => s.sideNumber === 1).lineUp).toEqual([
    { participantId: playerId, notes: 'keep competitor metadata', collectionAssignments: [] },
  ]);
  const after = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(after.sides.some((s) => s.participantId)).toBe(false);
  expect(
    tournamentEngine
      .getEvent({ drawId: f.params.drawId })
      .event.drawDefinitions.find((draw) => draw.drawId === f.params.drawId).lineUps[teamId],
  ).toEqual(f.draw.lineUps[teamId]);
});

it('rechecks unchanged mixed gender when doubles becomes singles', () => {
  const f = fixture(DOUBLES);
  f.event.gender = 'MIXED';
  f.collection.gender = 'MIXED';
  f.load();
  const before = structuredClone(f.stored());
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(INVALID_GENDER);
  expect(f.stored()).toEqual(before);
});

it('forks a shared centralized format deterministically and preserves its other references', () => {
  const f = fixture();
  const format = structuredClone(f.event.tieFormat!);
  format.tieFormatId = 'original-format';
  f.event.tieFormats = [format];
  f.event.tieFormatId = format.tieFormatId;
  delete f.event.tieFormat;
  f.parent.tieFormatId = format.tieFormatId;
  f.load();
  const before = structuredClone(f.stored());
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(INVALID_VALUES);
  expect(f.stored()).toEqual(before);
  result = tournamentEngine.modifyCollectionDefinition({ ...f.params, tieFormatUuids: ['resolved-choice-format'] });
  expect(result.success).toBe(true);
  expect(f.stored().tieFormatId).toBe('resolved-choice-format');
  expect(tournamentEngine.getTieFormat({ eventId: f.event.eventId }).tieFormat).toEqual(format);
  expect(
    tournamentEngine
      .getTieFormat(f.params)
      .tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
  ).toBe(DOUBLES);
});

it('keeps a scheduled court lock and supports assigning a singles competitor after conversion', () => {
  const f = fixture(DOUBLES);
  f.children[0].schedule = { courtId: 'locked-court', lock: { reason: 'show court' } };
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.success).toBe(true);
  const parent = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.matchUpId === f.parent.matchUpId);
  const team = f.tournamentRecord.participants!.find((p) => p.participantId === parent.sides[0].participantId)!;
  result = tournamentEngine.assignTieMatchUpParticipantId({
    drawId: f.params.drawId,
    tieMatchUpId: f.children[0].matchUpId,
    sideNumber: 1,
    participantId: team.individualParticipantIds![0],
  });
  expect(result.success).toBe(true);
  const child = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(child.matchUpType).toBe(SINGLES);
  expect(child.sides[0].participantId).toBe(team.individualParticipantIds![0]);
  expect(f.stored().tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).schedule).toEqual(
    f.children[0].schedule,
  );
});

it('repeated resolution to the same type succeeds without notices', () => {
  const f = fixture();
  expect(tournamentEngine.modifyCollectionDefinition(f.params).success).toBe(true);
  const before = structuredClone(f.stored());
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.success).toBe(true);
  expect(f.stored()).toEqual(before);
  expect(notices).toEqual([]);
});

it('clears stored side assignments without deleting pair records or side metadata', () => {
  const f = fixture(DOUBLES);
  f.tournamentRecord.participants!.push({
    participantId: 'existing-pair',
    participantType: 'PAIR',
    individualParticipantIds: [],
  });
  f.children[0].sides![0].participantId = 'existing-pair';
  f.children[0].sides![0].notes = 'retain side metadata';
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, clearCollectionAssignments: true });
  expect(result.success).toBe(true);
  const side = f.stored().tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).sides[0];
  expect(side.participantId).toBeUndefined();
  expect(side.notes).toBe('retain side metadata');
  expect(
    tournamentEngine.getParticipants({ participantFilters: { participantIds: ['existing-pair'] } }).participants,
  ).toHaveLength(1);
});

it('can resolve gender together with type and preserves unrelated lineup metadata', () => {
  const f = fixture(DOUBLES);
  f.event.gender = 'MIXED';
  f.collection.gender = 'MIXED';
  f.parent.sides = [
    { sideNumber: 1, lineUp: [{ participantId: 'other-player', notes: 'keep notes', collectionAssignments: [] }] },
  ];
  f.load();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, gender: 'MALE' });
  expect(result.success).toBe(true);
  expect(f.stored().sides[0].lineUp[0].notes).toBe('keep notes');
});

it.each(['parent-winner', 'scoredTime'])('refuses %s evidence without touching the collection', (kind) => {
  const f = fixture();
  if (kind === 'parent-winner') f.parent.winningSide = 1;
  else f.children[0].schedule = { scoredTime: '2026-11-03T10:00:00Z' };
  f.load();
  const before = structuredClone(f.stored());
  let result: any = tournamentEngine.modifyCollectionDefinition(f.params);
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  expect(f.stored()).toEqual(before);
});

it('refuses invalid clear flags and unknown target types', () => {
  const f = fixture();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, clearCollectionAssignments: 'yes' });
  expect(result.error).toBe(INVALID_VALUES);
  result = tournamentEngine.modifyCollectionDefinition({ ...f.params, matchUpType: TEAM });
  expect(result.error).toBe(INVALID_VALUES);
});

it('refuses a colliding format id without changing the shared registry or issuing notices', () => {
  const f = fixture();
  const format = structuredClone(f.event.tieFormat!);
  format.tieFormatId = 'original-format';
  f.event.tieFormats = [format];
  f.event.tieFormatId = format.tieFormatId;
  delete f.event.tieFormat;
  f.parent.tieFormatId = format.tieFormatId;
  f.load();
  const before = structuredClone(tournamentEngine.getEvent({ eventId: f.event.eventId }).event);
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, tieFormatUuids: ['original-format'] });
  expect(result.error).toBe(INVALID_VALUES);
  expect(tournamentEngine.getEvent({ eventId: f.event.eventId }).event).toEqual(before);
  expect(notices).toEqual([]);
});

it('supports assigning a doubles pair after singles-to-doubles conversion', () => {
  const f = fixture(SINGLES);
  expect(tournamentEngine.modifyCollectionDefinition(f.params).success).toBe(true);
  const parent = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.matchUpId === f.parent.matchUpId);
  const team = f.tournamentRecord.participants!.find((p) => p.participantId === parent.sides[0].participantId)!;
  const playerIds = team.individualParticipantIds!.slice(0, 2);
  for (const participantId of playerIds) {
    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId: f.params.drawId,
      tieMatchUpId: f.children[0].matchUpId,
      sideNumber: 1,
      participantId,
    });
    expect(result.success).toBe(true);
  }
  const child = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(child.matchUpType).toBe(DOUBLES);
  expect(child.sides[0].participant.individualParticipantIds).toEqual(playerIds);
});
