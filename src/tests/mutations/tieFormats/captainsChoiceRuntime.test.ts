import { CANNOT_MODIFY_TIEFORMAT, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

function fixture() {
  const {
    tournamentRecord: record,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
  });
  const event = record.events![0];
  const draw = event.drawDefinitions![0];
  const collection = event.tieFormat!.collectionDefinitions.find((c) => c.matchUpType === SINGLES)!;
  collection.matchUpTypeOptions = [SINGLES, DOUBLES];
  delete collection.matchUpType;
  const parents = draw.structures!.flatMap((s) => s.matchUps ?? []);
  for (const parent of parents)
    for (const child of parent.tieMatchUps ?? [])
      if (child.collectionId === collection.collectionId) delete child.matchUpType;
  const parent = parents[0];
  const children = parent.tieMatchUps!.filter((c) => c.collectionId === collection.collectionId);
  const params = { drawId, matchUpId: parent.matchUpId, collectionId: collection.collectionId };
  const load = () => tournamentEngine.setState(record);
  const stored = () =>
    tournamentEngine
      .allTournamentMatchUps({ inContext: false, matchUpFilters: { matchUpTypes: [TEAM] } })
      .matchUps.find((m) => m.matchUpId === parent.matchUpId);
  const state = () => tournamentEngine.getEvent({ eventId }).event;
  const resolve = (matchUpType = SINGLES) => tournamentEngine.modifyCollectionDefinition({ ...params, matchUpType });
  const definition = () =>
    tournamentEngine
      .getTieFormat(params)
      .tieFormat.collectionDefinitions.find((c) => c.collectionId === collection.collectionId);
  load();
  const context = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.matchUpId === parent.matchUpId);
  const team = record.participants!.find((p) => p.participantId === context.sides[0].participantId)!;
  const playerIds = team.individualParticipantIds!.slice(0, 2);
  return {
    record,
    event,
    eventId,
    draw,
    drawId,
    parents,
    parent,
    collection,
    children,
    params,
    load,
    stored,
    state,
    resolve,
    definition,
    context,
    team,
    playerIds,
  };
}

afterEach(() => setSubscriptions({ subscriptions: {} }));

it('keeps unresolved rubbers visible and untyped in hydrated and structural queries', () => {
  const f = fixture();
  const lines = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => f.children.some((c) => c.matchUpId === m.matchUpId));
  expect(lines).toHaveLength(f.children.length);
  expect(lines.every((line) => line.matchUpType === undefined)).toBe(true);
  expect(
    f
      .stored()
      .tieMatchUps.filter((m) => m.collectionId === f.collection.collectionId)
      .every((line) => line.matchUpType === undefined),
  ).toBe(true);
});

it.each([SINGLES, DOUBLES])('selects %s for only this encounter and retains options and child identities', (type) => {
  const f = fixture();
  const before = structuredClone(f.stored());
  let result: any = f.resolve(type);
  expect(result.success).toBe(true);
  expect(f.definition().matchUpType).toBe(type);
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(f.stored().tieMatchUps.map((m) => m.matchUpId)).toEqual(before.tieMatchUps.map((m) => m.matchUpId));
  expect(
    f
      .stored()
      .tieMatchUps.filter((m) => m.collectionId === f.collection.collectionId)
      .every((line) => line.matchUpType === type),
  ).toBe(true);
  expect(
    tournamentEngine
      .getTieFormat({ drawId: f.drawId })
      .tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
  ).toBeUndefined();
});

it('reselects and explicitly resets while keeping options, schedules and IDs', () => {
  const f = fixture();
  f.children[0].schedule = { courtId: 'court', lock: { reason: 'keep placement' } };
  f.load();
  expect(f.resolve(SINGLES).success).toBe(true);
  expect(f.resolve(DOUBLES).success).toBe(true);
  const ids = f.stored().tieMatchUps.map((m) => m.matchUpId);
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, resetMatchUpTypeChoice: true });
  expect(result.success).toBe(true);
  expect(f.definition().matchUpType).toBeUndefined();
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(f.stored().tieMatchUps.map((m) => m.matchUpId)).toEqual(ids);
  expect(f.stored().tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).schedule).toEqual(
    f.children[0].schedule,
  );
});

it('omitting type is not a reset, and repeated selection/reset are no-ops', () => {
  const f = fixture();
  expect(f.resolve().success).toBe(true);
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, collectionName: 'Still chosen' });
  expect(result.success).toBe(true);
  expect(f.definition().matchUpType).toBe(SINGLES);
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
  expect(f.resolve().success).toBe(true);
  expect(notices).toEqual([]);
  expect(tournamentEngine.modifyCollectionDefinition({ ...f.params, resetMatchUpTypeChoice: true }).success).toBe(true);
  notices.length = 0;
  expect(tournamentEngine.modifyCollectionDefinition({ ...f.params, resetMatchUpTypeChoice: true }).success).toBe(true);
  expect(notices).toEqual([]);
});

it.each(['assign', 'replace', 'lineups', 'drawLineup', 'score', 'state', 'start', 'mixedSchedule'])(
  'refuses unresolved %s without writes/notices',
  (method) => {
    const f = fixture();
    const before = structuredClone(f.state());
    const notices: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
    const lineUp = [
      {
        participantId: f.playerIds[0],
        collectionAssignments: [{ collectionId: f.collection.collectionId, collectionPosition: 1 }],
      },
    ];
    const target = { drawId: f.drawId, tieMatchUpId: f.children[0].matchUpId, sideNumber: 1 };
    let result: any;
    if (method === 'assign')
      result = tournamentEngine.assignTieMatchUpParticipantId({ ...target, participantId: f.playerIds[0] });
    if (method === 'replace')
      result = tournamentEngine.replaceTieMatchUpParticipantId({
        ...target,
        existingParticipantId: f.playerIds[0],
        newParticipantId: f.playerIds[1],
      });
    if (method === 'lineups')
      result = tournamentEngine.applyLineUps({ drawId: f.drawId, matchUpId: f.parent.matchUpId, lineUps: [lineUp] });
    if (method === 'drawLineup')
      result = tournamentEngine.updateTeamLineUp({
        drawId: f.drawId,
        participantId: f.team.participantId,
        lineUp,
        tieFormat: f.event.tieFormat,
      });
    if (method === 'score')
      result = tournamentEngine.setMatchUpStatus({
        drawId: f.drawId,
        matchUpId: f.children[0].matchUpId,
        disableScoreValidation: true,
        outcome: {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          score: {
            sets: [
              { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
              { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
            ],
          },
        },
      });
    if (method === 'state')
      result = tournamentEngine.setMatchUpState({
        drawId: f.drawId,
        matchUpId: f.children[0].matchUpId,
        matchUpStatus: IN_PROGRESS,
      });
    if (method === 'start')
      result = tournamentEngine.addMatchUpStartTime({
        drawId: f.drawId,
        matchUpId: f.children[0].matchUpId,
        startTime: '10:00',
      });
    if (method === 'mixedSchedule')
      result = tournamentEngine.addMatchUpScheduleItems({
        drawId: f.drawId,
        matchUpId: f.children[0].matchUpId,
        schedule: { scheduledDate: '2026-11-03', scheduledTime: '10:00', startTime: '10:01' },
      });
    expect(result.error).toBeDefined();
    expect(f.state()).toEqual(before);
    expect(notices).toEqual([]);
  },
);

it.each([SINGLES, DOUBLES])('uses normal participant cardinality after choosing %s', (type) => {
  const f = fixture();
  expect(f.resolve(type).success).toBe(true);
  for (const participantId of f.playerIds.slice(0, type === DOUBLES ? 2 : 1)) {
    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      drawId: f.drawId,
      tieMatchUpId: f.children[0].matchUpId,
      sideNumber: 1,
      participantId,
    });
    expect(result.success).toBe(true);
  }
  const line = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(line.matchUpType).toBe(type);
  if (type === SINGLES) expect(line.sides[0].participantId).toBe(f.playerIds[0]);
  else expect(line.sides[0].participant.individualParticipantIds).toEqual(f.playerIds);
});

it('allows normal scoring after selection', () => {
  const f = fixture();
  expect(f.resolve().success).toBe(true);
  let result: any = tournamentEngine.setMatchUpStatus({
    drawId: f.drawId,
    matchUpId: f.children[0].matchUpId,
    outcome: {
      matchUpStatus: COMPLETED,
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
        ],
      },
    },
  });
  expect(result).toMatchObject({ success: true });
  expect(f.stored().tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).winningSide).toBe(1);
});

it('requires explicit assignment clearing for reset and never restores inherited players in pending queries', () => {
  const f = fixture();
  expect(f.resolve().success).toBe(true);
  let result: any = tournamentEngine.assignTieMatchUpParticipantId({
    drawId: f.drawId,
    tieMatchUpId: f.children[0].matchUpId,
    sideNumber: 1,
    participantId: f.playerIds[0],
  });
  expect(result.success).toBe(true);
  const before = structuredClone(f.state());
  result = tournamentEngine.modifyCollectionDefinition({ ...f.params, resetMatchUpTypeChoice: true });
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  expect(f.state()).toEqual(before);
  result = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    resetMatchUpTypeChoice: true,
    clearCollectionAssignments: true,
  });
  expect(result.success).toBe(true);
  const line = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(line.matchUpType).toBeUndefined();
  expect(line.sides.some((s) => s.participantId)).toBe(false);
});

it('never carries a previous encounter selection or inherited assignments into a different pending encounter', () => {
  const f = fixture();
  f.draw.lineUps = {
    [f.team.participantId]: [
      {
        participantId: f.playerIds[0],
        collectionAssignments: [{ collectionId: f.collection.collectionId, collectionPosition: 1 }],
      },
    ],
  };
  f.load();
  const line = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === f.children[0].matchUpId);
  expect(line.matchUpType).toBeUndefined();
  expect(line.sides.some((s) => s.participantId)).toBe(false);
});

it.each([IN_PROGRESS, COMPLETED])('refuses reselect/reset after an affected rubber becomes %s', (status) => {
  const f = fixture();
  expect(f.resolve().success).toBe(true);
  const loaded = structuredClone(f.state());
  const parent = loaded.drawDefinitions[0].structures
    .flatMap((s) => s.matchUps ?? [])
    .find((m) => m.matchUpId === f.parent.matchUpId);
  parent.tieMatchUps.find((m) => m.matchUpId === f.children[0].matchUpId).matchUpStatus = status;
  const record = structuredClone(f.record);
  record.events = [loaded];
  tournamentEngine.setState(record);
  const before = structuredClone(f.state());
  let result: any = f.resolve(DOUBLES);
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  result = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    resetMatchUpTypeChoice: true,
    clearCollectionAssignments: true,
    updateInProgressMatchUps: true,
  });
  expect(result.error).toBe(CANNOT_MODIFY_TIEFORMAT);
  expect(f.state()).toEqual(before);
});

it('retains the declaration and selection through a real JSON save/reload', () => {
  const f = fixture();
  expect(f.resolve(DOUBLES).success).toBe(true);
  const record = structuredClone(f.record);
  record.events = [f.state()];
  const json = JSON.stringify(record);
  tournamentEngine.setState(JSON.parse(json));
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(f.definition().matchUpType).toBe(DOUBLES);
});

it('refuses conflicting reset/selection requests', () => {
  const f = fixture();
  let result: any = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    resetMatchUpTypeChoice: true,
    matchUpType: SINGLES,
  });
  expect(result.error).toBe(INVALID_VALUES);
});

it.each(['addMatchUpStartTime', 'addMatchUpEndTime', 'addMatchUpStopTime', 'addMatchUpResumeTime'])(
  'refuses unresolved %s atomically',
  (method) => {
    const f = fixture();
    const before = structuredClone(f.state());
    const key = {
      addMatchUpStartTime: 'startTime',
      addMatchUpEndTime: 'endTime',
      addMatchUpStopTime: 'stopTime',
      addMatchUpResumeTime: 'resumeTime',
    }[method];
    let result: any = tournamentEngine[method]({
      drawId: f.drawId,
      matchUpId: f.children[0].matchUpId,
      [key!]: '10:00',
    });
    expect(result.error).toBe(INVALID_VALUES);
    expect(f.state()).toEqual(before);
  },
);

it('refuses delegated scores on an unresolved rubber', () => {
  const f = fixture();
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.setDelegatedOutcome({
    drawId: f.drawId,
    matchUpId: f.children[0].matchUpId,
    outcome: { winningSide: 1, score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 0 }] } },
  });
  expect(result.error).toBe(INVALID_VALUES);
  expect(f.state()).toEqual(before);
});

it('refuses AD_HOC direct side assignment to an unresolved rubber', () => {
  const f = fixture();
  f.draw.drawType = 'AD_HOC';
  for (const parent of f.parents) delete parent.roundPosition;
  f.load();
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.assignMatchUpSideParticipant({
    drawId: f.drawId,
    matchUpId: f.children[0].matchUpId,
    participantId: f.playerIds[0],
    sideNumber: 1,
  });
  expect(result.error).toBe(INVALID_VALUES);
  expect(f.state()).toEqual(before);
});

it('does not let general format editing or reset bypass choice-specific protections', () => {
  const f = fixture();
  const modifiedTieFormat = structuredClone(f.event.tieFormat!);
  modifiedTieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId)!.matchUpType =
    SINGLES;
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.modifyTieFormat({
    drawId: f.drawId,
    matchUpId: f.parent.matchUpId,
    modifiedTieFormat,
  });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(before);
  expect(f.resolve().success).toBe(true);
  const selected = structuredClone(f.state());
  result = tournamentEngine.resetTieFormat({ drawId: f.drawId, matchUpId: f.parent.matchUpId });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(selected);
});

it('requires origin-supplied identity when a shared declaration forks', () => {
  const f = fixture();
  const format = structuredClone(f.event.tieFormat!);
  format.tieFormatId = 'choice-template';
  f.event.tieFormats = [format];
  f.event.tieFormatId = format.tieFormatId;
  delete f.event.tieFormat;
  f.parent.tieFormatId = format.tieFormatId;
  f.load();
  const before = structuredClone(f.state());
  let result: any = f.resolve();
  expect(result.error).toBe(INVALID_VALUES);
  expect(f.state()).toEqual(before);
  result = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    matchUpType: SINGLES,
    tieFormatUuids: ['encounter-choice'],
  });
  expect(result.success).toBe(true);
  expect(f.stored().tieFormatId).toBe('encounter-choice');
  expect(result.tieFormat.tieFormatId).toBe('encounter-choice');
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(
    tournamentEngine
      .getTieFormat({ drawId: f.drawId })
      .tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
  ).toBeUndefined();
});

it('announces the selected parent and all children with retained choice metadata', () => {
  const f = fixture();
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payload) => notices.push(...payload) } });
  expect(f.resolve(DOUBLES).success).toBe(true);
  expect(new Set(notices.map(({ matchUp }) => matchUp.matchUpId))).toEqual(
    new Set([f.parent.matchUpId, ...f.children.map((c) => c.matchUpId)]),
  );
  const parent = notices.find(({ matchUp }) => matchUp.matchUpId === f.parent.matchUpId).matchUp;
  const definition = parent.tieFormat.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId);
  expect(definition.matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(definition.matchUpType).toBe(DOUBLES);
  expect(
    notices
      .filter(({ matchUp }) => matchUp.matchUpId !== f.parent.matchUpId)
      .every(({ matchUp }) => matchUp.matchUpType === DOUBLES),
  ).toBe(true);
});

it('refuses choice selection and reset at draw-template scope', () => {
  const f = fixture();
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.modifyCollectionDefinition({
    drawId: f.drawId,
    collectionId: f.collection.collectionId,
    matchUpType: SINGLES,
  });
  expect(result.error).toBeDefined();
  result = tournamentEngine.modifyCollectionDefinition({
    drawId: f.drawId,
    collectionId: f.collection.collectionId,
    resetMatchUpTypeChoice: true,
  });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(before);
});

it('does not carry selection into the next round when the team advances', () => {
  const f = fixture();
  expect(f.resolve(DOUBLES).success).toBe(true);
  let result: any = tournamentEngine.setMatchUpStatus({
    drawId: f.drawId,
    matchUpId: f.parent.matchUpId,
    disableAutoCalc: true,
    outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
  });
  expect(result).toMatchObject({ success: true });
  const otherParents = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.filter((m) => m.matchUpId !== f.parent.matchUpId);
  for (const other of otherParents) {
    const effective = tournamentEngine.getTieFormat({ drawId: f.drawId, matchUpId: other.matchUpId }).tieFormat;
    expect(
      effective.collectionDefinitions.find((c) => c.collectionId === f.collection.collectionId).matchUpType,
    ).toBeUndefined();
  }
});

it('lets scorecard cleanup clear pending rubbers without selecting them', () => {
  const f = fixture();
  let result: any = tournamentEngine.resetScorecard({ drawId: f.drawId, matchUpId: f.parent.matchUpId });
  expect(result).toMatchObject({ success: true });
  expect(f.definition().matchUpType).toBeUndefined();
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
});

it('can select a reported-results collection without manufacturing child rubbers', () => {
  const f = fixture();
  f.event.tieFormat!.scoreSource = 'REPORTED';
  for (const parent of f.parents) parent.tieMatchUps = [];
  f.load();
  expect(f.resolve(DOUBLES).success).toBe(true);
  expect(f.definition().matchUpType).toBe(DOUBLES);
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
  expect(f.stored().tieMatchUps).toEqual([]);
});

it('keeps pending choice rubbers out of concrete-type filters', () => {
  const f = fixture();
  const singles = () =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [SINGLES] } }).matchUps;
  expect(singles().some((m) => f.children.some((c) => c.matchUpId === m.matchUpId))).toBe(false);
  expect(f.resolve(SINGLES).success).toBe(true);
  expect(singles().filter((m) => f.children.some((c) => c.matchUpId === m.matchUpId))).toHaveLength(f.children.length);
});

it('keeps structural-index placeholders untyped and without fabricated players', () => {
  const f = fixture();
  const indexed = buildStructuralIndex({
    tournamentRecord: f.record,
    drawDefinition: f.draw,
    event: f.event,
    team: true,
  });
  expect(indexed.unsupported).toBeUndefined();
  const lines = indexed.matchUps.filter((m) => f.children.some((c) => c.matchUpId === m.matchUpId));
  expect(lines).toHaveLength(f.children.length);
  expect(lines.every((m) => m.matchUpType === undefined && m.sides?.every((side) => !side.participantId))).toBe(true);
});

it('does not combine a choice decision with changing the team score value model', () => {
  const f = fixture();
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.modifyCollectionDefinition({
    ...f.params,
    matchUpType: SINGLES,
    matchUpValue: 99,
  });
  expect(result.error).toBe(INVALID_VALUES);
  expect(f.state()).toEqual(before);
});

it('refuses a general tiebreak reset before clearing choice-encounter scores', () => {
  const f = fixture();
  expect(f.resolve().success).toBe(true);
  let result: any = tournamentEngine.setMatchUpStatus({
    drawId: f.drawId,
    matchUpId: f.children[0].matchUpId,
    outcome: {
      matchUpStatus: COMPLETED,
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 0, winningSide: 1 },
        ],
      },
    },
  });
  expect(result.success).toBe(true);
  const before = structuredClone(f.state());
  result = tournamentEngine.resetScorecard({ drawId: f.drawId, matchUpId: f.parent.matchUpId, tiebreakReset: true });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(before);
});

it('permits independent value edits without implicitly resolving the choice', () => {
  const f = fixture();
  let result: any = tournamentEngine.modifyCollectionDefinition({ ...f.params, matchUpValue: 2 });
  expect(result.success).toBe(true);
  expect(f.definition().matchUpType).toBeUndefined();
  expect(f.definition().matchUpTypeOptions).toEqual([SINGLES, DOUBLES]);
});

it('validates real CODES storage after pending, selected and reset JSON round trips', () => {
  const schema = JSON.parse(readFileSync('./src/global/schema/tournament.schema.json', 'utf8'));
  const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const f = fixture();
  for (const phase of ['pending', 'selected', 'reset']) {
    if (phase === 'selected') expect(f.resolve(DOUBLES).success).toBe(true);
    if (phase === 'reset')
      expect(tournamentEngine.modifyCollectionDefinition({ ...f.params, resetMatchUpTypeChoice: true }).success).toBe(
        true,
      );
    const record = structuredClone(f.record);
    record.events = [f.state()];
    const json = JSON.stringify(record);
    const saved = JSON.parse(json);
    expect(validate(saved), JSON.stringify(validate.errors)).toBe(true);
    saved.events[0].tieFormat.collectionDefinitions.find(
      (c) => c.collectionId === f.collection.collectionId,
    ).matchUpTypeOptions = [SINGLES, TEAM];
    expect(validate(saved)).toBe(false);
  }
});

it('does not let mixed event and match scope preselect an inherited template', () => {
  const f = fixture();
  const before = structuredClone(f.state());
  let result: any = tournamentEngine.addCollectionDefinition({
    drawId: f.drawId,
    eventId: f.eventId,
    matchUpId: f.parent.matchUpId,
    collectionDefinition: {
      collectionId: 'new-choice',
      matchUpCount: 1,
      matchUpValue: 1,
      matchUpFormat: 'SET3-S:6/TB7',
      matchUpTypeOptions: [SINGLES, DOUBLES],
      matchUpType: SINGLES,
    },
  });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(before);
  const modifiedTieFormat = structuredClone(f.event.tieFormat!);
  modifiedTieFormat.collectionDefinitions.push({
    collectionId: 'another-choice',
    matchUpCount: 1,
    matchUpValue: 1,
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpTypeOptions: [SINGLES, DOUBLES],
    matchUpType: DOUBLES,
  });
  result = tournamentEngine.modifyTieFormat({
    drawId: f.drawId,
    eventId: f.eventId,
    matchUpId: f.parent.matchUpId,
    modifiedTieFormat,
  });
  expect(result.error).toBeDefined();
  expect(f.state()).toEqual(before);
});
