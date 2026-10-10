import { getRotatingPartnerRoundPreview } from '@Query/drawDefinition/getRotatingPartnerRoundPreview';
import { setSubscriptions, deleteNotices, getPayloads, setDeepCopy } from '@Global/state/globalState';
import { generateRotatingPartnerRound } from '@Mutate/drawDefinitions/generateRotatingPartnerRound';
import { removeCompetitionProfile } from '@Mutate/drawDefinitions/competitionProfile';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import schema from '@Global/schema/tournament.schema.json';
import { matchUpsOf } from '@Acquire/structureMembers';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import Ajv from 'ajv';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { ADD_PARTICIPANTS, ADD_MATCHUPS } from '@Constants/topicConstants';
import type { CompetitionProfile } from '@Types/competitionProfile';
import {
  EXISTING_MATCHUP_ID,
  EXISTING_MATCHUPS,
  INVALID_VALUES,
  MUTATION_LOCKED,
} from '@Constants/errorConditionConstants';

const profile: CompetitionProfile = {
  version: 1,
  format: 'AMERICANO',
  entrantScope: 'INDIVIDUAL',
  matchUpType: 'DOUBLES',
  scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'ALLOW' } },
  standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
  pairing: { seed: 42, algorithmVersion: 1 },
  completion: { kind: 'PARTNERSHIP_COVERAGE' },
};
function setup(count = 8) {
  const participantIds = Array.from({ length: count }, (_, index) => `p${index}`);
  const drawDefinition: DrawDefinition = {
    drawId: 'rotating',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    competitionProfile: structuredClone(profile),
    entries: participantIds.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' })),
    structures: [{ structureId: 's', matchUps: [] }],
  };
  const event: Event = {
    eventId: 'doubles',
    eventType: 'DOUBLES',
    drawDefinitions: [drawDefinition],
    entries: participantIds.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' })),
  };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    events: [event],
    participants: participantIds.map((participantId) => ({
      participantId,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
      participantName: participantId,
    })),
  };
  return { tournamentRecord, event, drawDefinition, roundNumber: 1 };
}
function request(context: ReturnType<typeof setup>, requestId = `round-${context.roundNumber}`) {
  const preview = getRotatingPartnerRoundPreview(context);
  expect(preview.error).toBeUndefined();
  return { ...context, requestId, expectedFingerprint: preview.sourceFingerprint! };
}
afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setDeepCopy(true, {});
});

writeModeMatrix(() => {
  it('previews without mutation and atomically applies a replayable full Americano rotation', () => {
    const context = setup();
    const before = structuredClone(context.tournamentRecord);
    const first = request(context);
    expect(context.tournamentRecord).toEqual(before);
    const applied = generateRotatingPartnerRound(first);
    expect(applied.error).toBeUndefined();
    expect(applied.matchUps).toHaveLength(2);
    const snapshot = structuredClone(context.tournamentRecord);
    expect(generateRotatingPartnerRound(first)).toMatchObject({ success: true, existingRound: true });
    expect(context.tournamentRecord).toEqual(snapshot);
    applied.roundRecord!.participantIds.push('external');
    expect(context.drawDefinition.competitionRounds![0].participantIds).not.toContain('external');
    for (let roundNumber = 2; roundNumber <= 7; roundNumber++) {
      context.roundNumber = roundNumber;
      expect(generateRotatingPartnerRound(request(context)).error).toBeUndefined();
    }
    expect(context.drawDefinition.competitionRounds).toHaveLength(7);
    expect(matchUpsOf(context.drawDefinition.structures![0])).toHaveLength(14);
    const pairs = context.tournamentRecord.participants!.filter(
      (participant) => participant.participantType === 'PAIR',
    );
    expect(pairs).toHaveLength(28);
    expect(new Set(pairs.map((pair) => pair.individualParticipantIds!.toSorted().join('|'))).size).toBe(28);
    context.roundNumber = 8;
    expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
    expect(context.event.entries!.every((entry) => entry.entryStatus === 'UNGROUPED')).toBe(true);
  });
});

it('reuses existing PAIR membership and publishes notices only after success', () => {
  const context = setup();
  const preview = getRotatingPartnerRoundPreview(context);
  context.tournamentRecord.participants!.push({
    participantId: 'existing-pair',
    participantType: 'PAIR',
    participantRole: 'COMPETITOR',
    individualParticipantIds: [...preview.round![0][0]].reverse(),
  });
  setSubscriptions({ subscriptions: { [ADD_PARTICIPANTS]: () => undefined, [ADD_MATCHUPS]: () => undefined } });
  deleteNotices();
  const applied = generateRotatingPartnerRound(request(context));
  expect(applied.error).toBeUndefined();
  expect(applied.matchUps![0].sides![0].participantId).toBe('existing-pair');
  expect(getPayloads({ topic: ADD_PARTICIPANTS })[0].participants).toHaveLength(3);
  expect(getPayloads({ topic: ADD_MATCHUPS })[0].matchUps).toHaveLength(2);
});

it('a late matchUp ID collision leaves no orphan PAIRs, matches, provenance or notices', () => {
  const context = setup();
  context.event.drawDefinitions!.push({
    drawId: 'other',
    structures: [
      { structureId: 'other-s', matchUps: [{ matchUpId: 'rotating-rp-round-1-1-m0', matchUpStatus: 'TO_BE_PLAYED' }] },
    ],
  });
  const args = request(context);
  const before = structuredClone(context.tournamentRecord);
  setSubscriptions({ subscriptions: { [ADD_PARTICIPANTS]: () => undefined, [ADD_MATCHUPS]: () => undefined } });
  deleteNotices();
  expect(generateRotatingPartnerRound(args).error).toBe(EXISTING_MATCHUP_ID);
  expect(context.tournamentRecord).toEqual(before);
  expect(getPayloads({ topic: ADD_PARTICIPANTS })).toEqual([]);
  expect(getPayloads({ topic: ADD_MATCHUPS })).toEqual([]);
});

it('rejects stale previews, request reuse and changed rosters without writes', () => {
  const context = setup();
  const args = request(context);
  context.drawDefinition.competitionProfile = { ...profile, pairing: { seed: 43, algorithmVersion: 1 } };
  const before = structuredClone(context.tournamentRecord);
  expect(generateRotatingPartnerRound(args).error).toBe(INVALID_VALUES);
  expect(context.tournamentRecord).toEqual(before);
  const current = request(context);
  expect(generateRotatingPartnerRound(current).error).toBeUndefined();
  expect(generateRotatingPartnerRound({ ...current, roundNumber: 2 }).error).toBe(INVALID_VALUES);
  context.roundNumber = 2;
  context.drawDefinition.entries!.pop();
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
});

it.each([3, 6, 132])('refuses unsupported roster size %i without mutation', (count) => {
  const context = setup(count);
  const before = structuredClone(context.tournamentRecord);
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
  expect(context.tournamentRecord).toEqual(before);
});

it('requires saved scoring configuration and refuses skipped rounds', () => {
  const context = setup();
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBe(INVALID_VALUES);
  const savedProfile = context.drawDefinition.competitionProfile!;
  if (savedProfile.format !== 'LADDER') delete savedProfile.scoring.selectedVariant;
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
});

it('materializes seeded Mexicano round one and refuses later rounds until standings exist', () => {
  const context = setup();
  context.drawDefinition.competitionProfile = {
    ...profile,
    format: 'MEXICANO',
    pairing: { seed: 42, algorithmVersion: 1, groupBy: 'ADJACENT_STANDINGS', partners: 'FIRST_FOURTH_SECOND_THIRD' },
    completion: { kind: 'ROUND_COUNT', rounds: 7 },
  };
  const applied = generateRotatingPartnerRound(request(context));
  expect(applied.roundRecord).toMatchObject({ format: 'MEXICANO', baseSeed: 42, roundNumber: 1 });
  expect(applied.roundRecord!.seedUsed).not.toBe(42);
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBe(INVALID_VALUES);
});

it('server/client replay produces identical participant and matchUp identities', () => {
  const context = setup();
  const mirror = structuredClone(context);
  const first = generateRotatingPartnerRound(request(context));
  const second = generateRotatingPartnerRound(request(mirror));
  expect(first.roundRecord).toEqual(second.roundRecord);
  expect(first.matchUps!.map((matchUp) => ({ matchUpId: matchUp.matchUpId, sides: matchUp.sides }))).toEqual(
    second.matchUps!.map((matchUp) => ({ matchUpId: matchUp.matchUpId, sides: matchUp.sides })),
  );
});

it('round provenance passes the closed schema and survives serialized reload', () => {
  const context = setup();
  const args = request(context);
  generateRotatingPartnerRound(args);
  const validate = new Ajv({ allowUnionTypes: true }).compile({
    $ref: '#/definitions/RotatingPartnerRoundRecord',
    definitions: schema.definitions,
  });
  expect(validate(context.drawDefinition.competitionRounds![0])).toBe(true);
  expect(validate({ ...context.drawDefinition.competitionRounds![0], unexpected: true })).toBe(false);
  const serialized = JSON.stringify(context.tournamentRecord);
  tournamentEngine.setState(JSON.parse(serialized));
  expect(
    tournamentEngine.generateRotatingPartnerRound({
      drawId: context.drawDefinition.drawId,
      roundNumber: 1,
      requestId: args.requestId,
      expectedFingerprint: args.expectedFingerprint,
    }),
  ).toMatchObject({ success: true, existingRound: true });
});

it.each(['draw', 'event', 'tournament'])('public materialization honours DRAWS locks at %s scope', (level) => {
  const context = setup();
  tournamentEngine.setState(context.tournamentRecord);
  const drawId = context.drawDefinition.drawId;
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId, roundNumber: 1 });
  const scopeParams: { drawId?: string; eventId?: string } = {};
  if (level === 'draw') scopeParams.drawId = drawId;
  if (level === 'event') scopeParams.eventId = context.event.eventId;
  expect(tournamentEngine.addMutationLock({ ...scopeParams, scope: 'DRAWS', lockToken: 'round-lock' }).success).toBe(
    true,
  );
  expect(
    tournamentEngine.generateRotatingPartnerRound({
      drawId,
      roundNumber: 1,
      requestId: 'locked',
      expectedFingerprint: preview.sourceFingerprint!,
    }).error,
  ).toBe(MUTATION_LOCKED);
});

it('atomic staging and returned provenance stay isolated when query copying is disabled', () => {
  const context = setup();
  context.event.drawDefinitions!.push({
    drawId: 'other',
    structures: [
      { structureId: 'other-s', matchUps: [{ matchUpId: 'rotating-rp-round-1-1-m0', matchUpStatus: 'TO_BE_PLAYED' }] },
    ],
  });
  setDeepCopy(false, {});
  const args = request(context);
  const before = structuredClone(context.tournamentRecord);
  expect(generateRotatingPartnerRound(args).error).toBe(EXISTING_MATCHUP_ID);
  expect(context.tournamentRecord).toEqual(before);
});

it('refuses replay and continuation after PAIR membership or applied matches change', () => {
  const context = setup();
  const args = request(context);
  const applied = generateRotatingPartnerRound(args);
  const pairId = applied.matchUps![0].sides![0].participantId;
  const pair = context.tournamentRecord.participants!.find((participant) => participant.participantId === pairId)!;
  pair.individualParticipantIds = ['p0', 'p1'];
  if (
    JSON.stringify(pair.individualParticipantIds.toSorted()) ===
    JSON.stringify(applied.roundRecord!.pairings[0][0].toSorted())
  )
    pair.individualParticipantIds = ['p2', 'p3'];
  expect(generateRotatingPartnerRound(args).error).toBe(INVALID_VALUES);
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBe(INVALID_VALUES);
  pair.individualParticipantIds = [...applied.roundRecord!.pairings[0][0]];
  matchUpsOf(context.drawDefinition.structures![0])!.pop();
  expect(generateRotatingPartnerRound(args).error).toBe(INVALID_VALUES);
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBe(INVALID_VALUES);
});

it('respects participant locks while creating scaffolding, with an explicit token override', () => {
  const context = setup();
  tournamentEngine.setState(context.tournamentRecord);
  const drawId = context.drawDefinition.drawId;
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId, roundNumber: 1 });
  expect(tournamentEngine.addMutationLock({ scope: 'PARTICIPANTS', lockToken: 'pair-lock' }).success).toBe(true);
  const params = { drawId, roundNumber: 1, requestId: 'locked-pairs', expectedFingerprint: preview.sourceFingerprint! };
  expect(tournamentEngine.generateRotatingPartnerRound(params).error).toBe(MUTATION_LOCKED);
  expect(tournamentEngine.generateRotatingPartnerRound({ ...params, lockToken: 'pair-lock' }).success).toBe(true);
});

it.each([4, 12, 32])('materializes a full logical round for %i players', (count) => {
  const context = setup(count);
  const applied = generateRotatingPartnerRound(request(context));
  expect(applied.error).toBeUndefined();
  expect(applied.matchUps).toHaveLength(count / 4);
  expect(new Set(applied.roundRecord!.pairings.flat(2)).size).toBe(count);
});

it('applied provenance keeps the profile locked even after generic match removal', () => {
  const context = setup();
  generateRotatingPartnerRound(request(context));
  matchUpsOf(context.drawDefinition.structures![0])!.length = 0;
  context.drawDefinition.entries = [];
  expect(removeCompetitionProfile(context).error).toBe(EXISTING_MATCHUPS);
});
