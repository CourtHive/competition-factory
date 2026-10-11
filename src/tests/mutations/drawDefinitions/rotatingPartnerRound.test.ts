import { getRotatingPartnerRoundPreview } from '@Query/drawDefinition/getRotatingPartnerRoundPreview';
import { setSubscriptions, deleteNotices, getPayloads, setDeepCopy } from '@Global/state/globalState';
import { generateRotatingPartnerRound } from '@Mutate/drawDefinitions/generateRotatingPartnerRound';
import { removeCompetitionProfile } from '@Mutate/drawDefinitions/competitionProfile';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import schema from '@Global/schema/tournament.schema.json';
import { matchUpsOf } from '@Acquire/structureMembers';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';
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
  return { ...context, requestId, expectedPairings: preview.round!, expectedScoringContract: preview.scoringContract! };
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
    applied.roundRecord!.pairings[0][0].push('external');
    expect(context.drawDefinition.competitionRounds![0].pairings[0][0]).not.toContain('external');
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
      expectedPairings: args.expectedPairings,
      expectedScoringContract: args.expectedScoringContract,
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
      expectedPairings: preview.round!,
      expectedScoringContract: preview.scoringContract!,
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
  const params = {
    drawId,
    roundNumber: 1,
    requestId: 'locked-pairs',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
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

it.each(['matchUp', 'structure', 'draw', 'event'] as const)('locks applied round formats at %s scope', (scope) => {
  const context = setup();
  const applied = generateRotatingPartnerRound(request(context));
  tournamentEngine.setState(context.tournamentRecord);
  const params =
    scope === 'event'
      ? { eventId: context.event.eventId }
      : {
          drawId: context.drawDefinition.drawId,
          ...(scope === 'structure' ? { structureId: applied.roundRecord!.structureId } : {}),
          ...(scope === 'matchUp' ? { matchUpId: applied.matchUps![0].matchUpId } : {}),
        };
  const before = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentEngine.setMatchUpFormat({ ...params, matchUpFormat: 'SET3-S:6/TB7' }).error).toBeTruthy();
  const after = tournamentEngine.getTournament().tournamentRecord;
  expect(after.events).toEqual(before.events);
  expect(after.participants).toEqual(before.participants);
  context.drawDefinition.structures![0].matchUps![0].matchUpFormat = 'SET3-S:6/TB7';
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBeTruthy();
});

it('irrelevant scheduling and unrelated pairs do not invalidate approved pairings', () => {
  const context = setup();
  const first = generateRotatingPartnerRound(request(context));
  context.roundNumber = 2;
  const approved = request(context);
  first.matchUps![0].timeItems = [{ itemType: 'SCHEDULE.DATE', itemValue: '2026-10-12' }];
  context.drawDefinition.structures![0].matchUps![0].timeItems = first.matchUps![0].timeItems;
  context.tournamentRecord.participants!.push({
    participantId: 'other-pair',
    participantType: 'PAIR',
    individualParticipantIds: ['p0', 'p1'],
  });
  expect(generateRotatingPartnerRound(approved).error).toBeUndefined();
});

it('the scoring contract is part of approval even when pairings are unchanged', () => {
  const context = setup();
  const approved = request(context);
  if (context.drawDefinition.competitionProfile!.format !== 'LADDER')
    context.drawDefinition.competitionProfile!.scoring.combinedPointTotal = 24;
  const before = structuredClone(context.tournamentRecord);
  expect(generateRotatingPartnerRound(approved).error).toBeTruthy();
  expect(context.tournamentRecord).toEqual(before);
});

it('round record growth is bounded and linear for a full 32-player rotation', () => {
  const context = setup(32);
  const mapping = new Map(
    context.tournamentRecord.participants!.map((participant, index) => [
      participant.participantId,
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ]),
  );
  for (const participant of context.tournamentRecord.participants!)
    participant.participantId = mapping.get(participant.participantId)!;
  for (const entry of [...context.event.entries!, ...context.drawDefinition.entries!])
    entry.participantId = mapping.get(entry.participantId)!;
  const sizes: number[] = [];
  for (let roundNumber = 1; roundNumber <= 31; roundNumber++) {
    context.roundNumber = roundNumber;
    const applied = generateRotatingPartnerRound(request(context));
    expect(applied.error).toBeUndefined();
    sizes.push(JSON.stringify(applied.roundRecord).length);
    expect(applied.roundRecord).not.toHaveProperty('sourceFingerprint');
    expect(applied.roundRecord).not.toHaveProperty('participantIds');
  }
  expect(context.drawDefinition.competitionRoster).toHaveLength(32);
  expect(Math.max(...sizes)).toBeLessThan(4096);
  expect(Math.max(...sizes)).toBeLessThan(Math.min(...sizes) * 1.2);
  expect(JSON.stringify(context.drawDefinition.competitionRounds).length).toBeLessThan(31 * 4096);
});

it('300 unrelated partnerships have no effect on full-rotation round record size', () => {
  const baseline = setup(16);
  const unrelated = setup(16);
  for (let index = 0; index < 300; index++) {
    const ids = [`other-${index}-a`, `other-${index}-b`];
    unrelated.tournamentRecord.participants!.push(
      ...ids.map((participantId) => ({
        participantId,
        participantType: 'INDIVIDUAL' as const,
        participantRole: 'COMPETITOR' as const,
      })),
      { participantId: `other-pair-${index}`, participantType: 'PAIR', individualParticipantIds: ids },
    );
  }
  for (let roundNumber = 1; roundNumber <= 15; roundNumber++) {
    baseline.roundNumber = unrelated.roundNumber = roundNumber;
    expect(generateRotatingPartnerRound(request(baseline)).error).toBeUndefined();
    expect(generateRotatingPartnerRound(request(unrelated)).error).toBeUndefined();
  }
  expect(unrelated.drawDefinition.competitionRounds).toEqual(baseline.drawDefinition.competitionRounds);
});

it('retry identity includes pairings and score rules, and force cannot strip an applied format', () => {
  const context = setup();
  const approved = request(context);
  generateRotatingPartnerRound(approved);
  const changed = structuredClone(approved.expectedPairings);
  changed[0].reverse();
  expect(generateRotatingPartnerRound({ ...approved, expectedPairings: changed }).error).toBeTruthy();
  expect(
    generateRotatingPartnerRound({
      ...approved,
      expectedScoringContract: { ...approved.expectedScoringContract, combinedPointTotal: 24 },
    }).error,
  ).toBeTruthy();
  tournamentEngine.setState(context.tournamentRecord);
  expect(
    tournamentEngine.setMatchUpFormat({
      drawId: context.drawDefinition.drawId,
      matchUpFormat: 'SET1-S:P32',
      force: true,
    }).error,
  ).toBeTruthy();
});

it('uses code-unit roster ordering and identical saved rounds across English and Danish locales', () => {
  const participantIds = ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'a0', 'b0'].map(
    (prefix) => `${prefix}000000-0000-4000-8000-000000000001`,
  );
  const expected = participantIds.toSorted((a, b) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  expect(participantIds.toSorted((a, b) => a.localeCompare(b, 'da'))).not.toEqual(expected);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  const originalCompare = String.prototype.localeCompare;
  const compare = vi.spyOn(String.prototype, 'localeCompare');
  try {
    const outcomes = ['en', 'da'].map((locale) => {
      compare.mockImplementation(function (this: string, other: string) {
        return originalCompare.call(this, other, locale);
      });
      const context = setup();
      context.drawDefinition.entries!.forEach((entry, index) => (entry.participantId = participantIds[index]));
      context.event.entries!.forEach((entry, index) => (entry.participantId = participantIds[index]));
      context.tournamentRecord.participants!.forEach(
        (participant, index) => (participant.participantId = participantIds[index]),
      );
      const preview = getRotatingPartnerRoundPreview(context);
      expect(preview.participantIds).toEqual(expected);
      expect(generateRotatingPartnerRound(request(context)).error).toBeUndefined();
      context.roundNumber = 2;
      expect(generateRotatingPartnerRound(request(context)).error).toBeUndefined();
      expect(context.drawDefinition.competitionRoster).toEqual(expected);
      return context.tournamentRecord;
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
  } finally {
    compare.mockRestore();
    vi.useRealTimers();
  }
});
