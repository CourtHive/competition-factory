import { settlementOutcome, isRotatingPartnerSettlement } from '@Validators/rotatingPartnerSettlement';
import { getRotatingPartnerRoundPreview } from '@Query/drawDefinition/getRotatingPartnerRoundPreview';
import { generateRotatingPartnerRound } from '@Mutate/drawDefinitions/generateRotatingPartnerRound';
import { getRotatingPartnerTallyPolicy } from '@Query/drawDefinition/getRotatingPartnerTallyPolicy';
import { settleRotatingPartnerResult } from '@Mutate/drawDefinitions/settleRotatingPartnerResult';
import { getRotatingPartnerStandings } from '@Query/drawDefinition/getRotatingPartnerStandings';
import { isRotatingPartnerTallyPolicy } from '@Validators/rotatingPartnerTallyPolicy';
import schema from '@Global/schema/tournament.schema.json';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';
import Ajv from 'ajv';

// constants and types
import { INVALID_SCORE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

const policy: RotatingPartnerTallyPolicy = {
  version: 1,
  decidingPoints: 'INCLUDE',
  overtimePoints: 'INCLUDE',
  statusTreatments: {},
};
function setup(
  format: 'AMERICANO' | 'MEXICANO' = 'AMERICANO',
  tieResolution: 'ALLOW' | 'DECIDING_POINT' | 'WIN_BY_MARGIN' = 'ALLOW',
) {
  const ids = Array.from({ length: 8 }, (_, index) => `p${index}`);
  const drawDefinition: DrawDefinition = {
    drawId: 'd',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' })),
    structures: [{ structureId: 's', matchUps: [] }],
    competitionProfile: {
      version: 1,
      entrantScope: 'INDIVIDUAL',
      matchUpType: 'DOUBLES',
      scoring: {
        combinedPointTotal: 32,
        selectedVariant: { tieResolution, ...(tieResolution === 'WIN_BY_MARGIN' ? { winningMargin: 2 } : {}) },
      },
      standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
      ...(format === 'AMERICANO'
        ? {
            format,
            pairing: { seed: 42, algorithmVersion: 1 },
            completion: { kind: 'PARTNERSHIP_COVERAGE' },
          }
        : {
            format,
            pairing: {
              seed: 42,
              algorithmVersion: 1,
              groupBy: 'ADJACENT_STANDINGS',
              partners: 'FIRST_FOURTH_SECOND_THIRD',
            },
            completion: { kind: 'ROUND_COUNT', rounds: 3 },
          }),
    },
  };
  const event: Event = {
    eventId: 'e',
    eventType: 'DOUBLES',
    drawDefinitions: [drawDefinition],
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' })),
  };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    events: [event],
    participants: ids.map((participantId) => ({
      participantId,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
    })),
  };
  return { tournamentRecord, drawDefinition, event, roundNumber: 1 };
}
function apply(context: ReturnType<typeof setup>) {
  const preview = getRotatingPartnerRoundPreview(context);
  expect(preview.error).toBeUndefined();
  const request = {
    ...context,
    requestId: `r${context.roundNumber}`,
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  const result = generateRotatingPartnerRound(request);
  expect(result.error).toBeUndefined();
  return { preview, result, request };
}
function settle(context: ReturnType<typeof setup>, a = 17, b = 15) {
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'COMPLETED';
    match.score = {
      sets: [{ setNumber: 1, side1Score: a, side2Score: b, ...(a === b ? {} : { winningSide: a > b ? 1 : 2 }) }],
    };
    match.winningSide = a > b ? 1 : 2;
    if (a === b) delete match.winningSide;
  }
}
function attach(context: ReturnType<typeof setup>, value: unknown) {
  context.drawDefinition.extensions = [{ name: APPLIED_POLICIES, value: { rotatingPartnerTally: value } }];
}

it('credits actual side points to both individuals, shares ranks and never mutates queried data', () => {
  const context = setup();
  const { result } = apply(context);
  settle(context);
  const before = structuredClone(context.tournamentRecord);
  const standings = getRotatingPartnerStandings(context);
  expect(standings.error).toBeUndefined();
  expect(standings.standings?.map((row) => row.pointsScored)).toEqual([17, 17, 17, 17, 15, 15, 15, 15]);
  expect(standings.standings?.map((row) => row.rank)).toEqual([1, 1, 1, 1, 5, 5, 5, 5]);
  expect(standings.contributions).toHaveLength(8);
  expect(
    standings.contributions
      ?.filter((row) => result.roundRecord!.pairings[0][0].includes(row.participantId))
      .map((row) => row.pointsScored),
  ).toEqual([17, 17]);
  expect(context.tournamentRecord).toEqual(before);
  standings.contributions![0].opponentIds.push('external');
  expect(context.tournamentRecord).toEqual(before);
});

it('counts completed shared ties and recomputes score corrections and clears immediately', () => {
  const context = setup();
  apply(context);
  settle(context, 16, 16);
  expect(getRotatingPartnerStandings(context).standings?.every((row) => row.matchesTied === 1 && row.rank === 1)).toBe(
    true,
  );
  settle(context, 20, 12);
  expect(getRotatingPartnerStandings(context).standings?.[0].pointsScored).toBe(20);
  const match = context.drawDefinition.structures![0].matchUps![0];
  match.matchUpStatus = 'TO_BE_PLAYED';
  delete match.score;
  delete match.winningSide;
  const result = getRotatingPartnerStandings(context);
  expect(result.unresolved).toHaveLength(1);
  expect(result.contributions).toHaveLength(4);
});

it.each(['DECIDING_POINT', 'WIN_BY_MARGIN'] as const)('explicitly includes or excludes %s extra points', (variant) => {
  for (const choice of ['INCLUDE', 'EXCLUDE'] as const) {
    const context = setup('AMERICANO', variant);
    attach(context, { ...policy, decidingPoints: choice, overtimePoints: choice });
    apply(context);
    settle(context, variant === 'DECIDING_POINT' ? 17 : 18, 16);
    const result = getRotatingPartnerStandings(context);
    expect(result.error).toBeUndefined();
    const terminalPoints = variant === 'DECIDING_POINT' ? 17 : 18;
    expect(result.standings?.[0].pointsScored).toBe(choice === 'EXCLUDE' ? 16 : terminalPoints);
    expect(result.contributions?.[0].extraPoints).toBe(variant === 'DECIDING_POINT' ? 1 : 2);
    expect(result.standings?.[0].matchesWon).toBe(1);
  }
});

it('preserves historical policy while applying a replacement only to the next round', () => {
  const context = setup('AMERICANO', 'DECIDING_POINT');
  apply(context);
  settle(context, 17, 16);
  attach(context, { ...policy, decidingPoints: 'EXCLUDE' });
  expect(getRotatingPartnerStandings(context).standings?.[0].pointsScored).toBe(17);
  context.roundNumber = 2;
  const second = apply(context);
  expect(second.result.roundRecord?.tallyContract.decidingPoints).toBe('EXCLUDE');
  expect(context.drawDefinition.competitionRounds![0].tallyContract.decidingPoints).toBe('INCLUDE');
});

it('keeps terminal nonstandard statuses unresolved by default and only settles explicit treatments', () => {
  for (const status of [
    'RETIRED',
    'WALKOVER',
    'DEFAULTED',
    'ABANDONED',
    'CANCELLED',
    'DOUBLE_WALKOVER',
    'DOUBLE_DEFAULT',
    'DEAD_RUBBER',
  ] as const) {
    const context = setup();
    apply(context);
    context.drawDefinition.structures![0].matchUps![0].matchUpStatus = status;
    expect(getRotatingPartnerStandings(context).unresolved).toHaveLength(2);
  }
  const excluded = setup();
  attach(excluded, { ...policy, statusTreatments: { CANCELLED: { kind: 'EXCLUDE' } } });
  apply(excluded);
  for (const match of excluded.drawDefinition.structures![0].matchUps!) match.matchUpStatus = 'CANCELLED';
  expect(getRotatingPartnerStandings(excluded).unresolved).toHaveLength(0);
  expect(getRotatingPartnerStandings(excluded).contributions).toHaveLength(0);
  const credited = setup();
  attach(credited, {
    ...policy,
    statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: 20, losingPoints: 0 } },
  });
  apply(credited);
  for (const match of credited.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'WALKOVER';
    match.winningSide = 1;
  }
  const result = getRotatingPartnerStandings(credited);
  expect(result.contributions?.[0]).toMatchObject({ playedPoints: 0, creditedPoints: 20, treatment: 'CREDIT' });
  expect(result.standings?.[0]).toMatchObject({ pointsScored: 20, matchesPlayed: 0, matchesWon: 1 });
  delete credited.drawDefinition.structures![0].matchUps![0].winningSide;
  expect(getRotatingPartnerStandings(credited).error).toBe(INVALID_SCORE);
});

it('attributes partial retirement scores only under an explicit played-points rule', () => {
  const context = setup();
  attach(context, { ...policy, statusTreatments: { RETIRED: { kind: 'PLAYED_POINTS' } } });
  apply(context);
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'RETIRED';
    match.winningSide = 2;
    match.score = { sets: [{ side1Score: 8, side2Score: 6 }] };
  }
  const result = getRotatingPartnerStandings(context);
  expect(result.error).toBeUndefined();
  expect(result.standings?.[0].pointsScored).toBe(8);
  expect(result.contributions?.[0].treatment).toBe('PLAYED_POINTS');
});

it('refuses missing historical contracts, invalid scores and altered pair membership', () => {
  const context = setup();
  apply(context);
  settle(context);
  const contract = context.drawDefinition.competitionRounds![0].tallyContract;
  let result: any = context.drawDefinition.competitionRounds![0];
  delete result.tallyContract;
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
  context.drawDefinition.competitionRounds![0].tallyContract = contract;
  context.drawDefinition.structures![0].matchUps![0].score!.sets![0].side1Score = 99;
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_SCORE);
  settle(context);
  context.tournamentRecord.participants!.find(
    (participant) => participant.participantType === 'PAIR',
  )!.individualParticipantIds = ['p0', 'p0'];
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
});

it('generates later Mexicano rounds from exact settled source standings and retains prior pairings on correction', () => {
  const context = setup('MEXICANO');
  apply(context);
  context.roundNumber = 2;
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
  settle(context);
  const second = apply(context);
  expect(second.result.roundRecord?.standingsThroughRoundNumber).toBe(1);
  expect(second.result.roundRecord?.standingsSnapshot).toEqual(
    getRotatingPartnerStandings({ ...context, throughRoundNumber: 1 }).standings!.map(
      ({ participantId, pointsScored }) => ({ participantId, pointsScored }),
    ),
  );
  expect(generateRotatingPartnerRound(second.request).existingRound).toBe(true);
  const stored = structuredClone(second.result.roundRecord);
  settle(context, 16, 16);
  expect(context.drawDefinition.competitionRounds![1]).toEqual(stored);
  context.roundNumber = 3;
  expect(apply(context).result.error).toBeUndefined();
});

it('rechecks Mexicano approved pairings after score corrections without rejecting irrelevant changes', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  context.roundNumber = 2;
  const preview = getRotatingPartnerRoundPreview(context);
  const request = {
    ...context,
    requestId: 'r2',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  settle(context, 15, 17);
  expect(generateRotatingPartnerRound(request).error).toBe(INVALID_VALUES);
  expect(context.drawDefinition.competitionRounds).toHaveLength(1);
  const accepted = apply(context);
  expect(accepted.result.roundRecord?.standingsSnapshot).not.toEqual(preview.standingsSnapshot);
});

it('resolves whole policies through tournament/event/draw/structure and exposes the public engine queries', () => {
  const context = setup();
  const extension = [
    { name: APPLIED_POLICIES, value: { rotatingPartnerTally: { ...policy, decidingPoints: 'EXCLUDE' } } },
  ];
  context.tournamentRecord.extensions = extension;
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.decidingPoints).toBe('EXCLUDE');
  context.event.extensions = [{ name: APPLIED_POLICIES, value: { rotatingPartnerTally: policy } }];
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.decidingPoints).toBe('INCLUDE');
  attach(context, { ...policy, overtimePoints: 'EXCLUDE' });
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.overtimePoints).toBe('EXCLUDE');
  const structure = context.drawDefinition.structures![0];
  structure.extensions = extension;
  expect(getRotatingPartnerTallyPolicy({ ...context, structure }).tallyPolicy?.decidingPoints).toBe('EXCLUDE');
  apply(context);
  settle(context);
  tournamentEngine.setState(context.tournamentRecord);
  let result: any = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd', throughRoundNumber: 1 });
  expect(result.standings).toHaveLength(8);
  result = tournamentEngine.getRotatingPartnerTallyPolicy({ drawId: 'd', structureId: 's' });
  expect(result.tallyPolicy.decidingPoints).toBe('EXCLUDE');
});

it('keeps runtime and closed JSON-schema tally validation in agreement', () => {
  const ajv = new Ajv({ strict: false });
  ajv.addSchema(schema, 'tournament');
  const validate = ajv.compile({ $ref: 'tournament#/definitions/RotatingPartnerTallyPolicy' });
  for (const value of [
    policy,
    { ...policy, statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: 20.5, losingPoints: 0 } } },
    null,
    {},
    { ...policy, version: 2 },
    { ...policy, overtimePoints: 'OTHER' },
    { ...policy, statusTreatments: { COMPLETED: { kind: 'EXCLUDE' } } },
    { ...policy, statusTreatments: { IN_PROGRESS: { kind: 'EXCLUDE' } } },
    { ...policy, extra: true },
    { ...policy, statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: -1, losingPoints: 0 } } },
  ]) {
    expect(isRotatingPartnerTallyPolicy(value)).toBe(validate(value));
  }
});

it('accepts score corrections that leave approved Mexicano pairings unchanged and saves the new source snapshot', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  context.roundNumber = 2;
  const preview = getRotatingPartnerRoundPreview(context);
  settle(context, 18, 14);
  expect(getRotatingPartnerRoundPreview(context).round).toEqual(preview.round);
  const result = generateRotatingPartnerRound({
    ...context,
    requestId: 'r2',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  });
  expect(result.error).toBeUndefined();
  expect(result.roundRecord?.standingsSnapshot).not.toEqual(preview.standingsSnapshot);
});

it('refuses invalid cutoffs, missing rounds, duplicate match IDs and malformed saved memberships', () => {
  for (const cutoff of [-1, 0.5, 2, Number.NaN]) {
    const context = setup();
    apply(context);
    expect(getRotatingPartnerStandings({ ...context, throughRoundNumber: cutoff }).error).toBe(INVALID_VALUES);
  }
  for (const corrupt of [
    (round: any) => {
      round.roundNumber = 2;
    },
    (round: any) => {
      round.pairings[0] = ['p0', 'p1', 'p2', 'p3'];
    },
    (round: any) => {
      round.matchUpIds[1] = round.matchUpIds[0];
    },
    (round: any) => {
      round.algorithmVersion = 2;
    },
    (round: any) => {
      round.tallyContract.decidingPoints = 'OTHER';
    },
  ]) {
    const context = setup();
    apply(context);
    corrupt(context.drawDefinition.competitionRounds![0]);
    expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
  }
});

it('rejects malformed inherited tally rules before applying any part of a round', () => {
  const context = setup();
  attach(context, { ...policy, decidingPoints: 'OTHER' });
  const before = structuredClone(context.tournamentRecord);
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
  expect(
    generateRotatingPartnerRound({
      ...context,
      requestId: 'bad',
      expectedPairings: [],
      expectedScoringContract: { combinedPointTotal: 32, tieResolution: 'ALLOW' },
    }).error,
  ).toBe(INVALID_VALUES);
  expect(context.tournamentRecord).toEqual(before);
});

it('separates awarded credits from an actual partial score kept on a retirement', () => {
  const context = setup();
  attach(context, { ...policy, statusTreatments: { RETIRED: { kind: 'CREDIT', winningPoints: 20, losingPoints: 0 } } });
  apply(context);
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'RETIRED';
    match.winningSide = 1;
    match.score = { sets: [{ side1Score: 8, side2Score: 6 }] };
  }
  const result = getRotatingPartnerStandings(context);
  expect(result.error).toBeUndefined();
  expect(result.contributions?.[0]).toMatchObject({
    played: true,
    playedPoints: 8,
    creditedPoints: 20,
    pointsScored: 20,
  });
  expect(result.standings?.[0].matchesPlayed).toBe(1);
});

function settlementRequest(context: ReturnType<typeof setup>, requestId = 'settlement-1') {
  const match = context.drawDefinition.structures![0].matchUps![0];
  return {
    ...context,
    matchUpId: match.matchUpId,
    requestId,
    expectedOutcome: settlementOutcome(match),
    treatment: { kind: 'EXCLUDE' as const },
    reason: 'Director excludes unplayed match',
    recordedBy: 'director-1',
    recordedAt: '2026-10-10T20:00:00.000Z',
  };
}

it('audited settlement unlocks Mexicano without rewriting round contracts or later snapshots', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  const match = context.drawDefinition.structures![0].matchUps![0];
  match.matchUpStatus = 'WALKOVER';
  delete match.score;
  const contract = structuredClone(context.drawDefinition.competitionRounds![0].tallyContract);
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).error).toBeDefined();
  const request = settlementRequest(context);
  const result = settleRotatingPartnerResult(request);
  expect(result.success).toBe(true);
  expect(settleRotatingPartnerResult(request).existingSettlement).toBe(true);
  expect(context.drawDefinition.competitionSettlements).toHaveLength(1);
  expect(context.drawDefinition.competitionRounds![0].tallyContract).toEqual(contract);
  const next = apply({ ...context, roundNumber: 2 });
  const snapshot = structuredClone(next.result.roundRecord!.standingsSnapshot);
  const revised = {
    ...request,
    requestId: 'settlement-2',
    supersedesRequestId: request.requestId,
    treatment: { kind: 'CREDIT' as const, winningPoints: 20, losingPoints: 12 },
  };
  expect(settleRotatingPartnerResult(revised).success).toBe(true);
  expect(context.drawDefinition.competitionRounds![1].standingsSnapshot).toEqual(snapshot);
  expect(context.drawDefinition.competitionSettlements).toHaveLength(2);
  const standings = getRotatingPartnerStandings({ ...context, throughRoundNumber: 1 });
  expect(standings.contributions?.filter((row) => row.matchUpId === match.matchUpId)).toHaveLength(4);
  expect(standings.contributions?.find((row) => row.matchUpId === match.matchUpId)?.settlementRequestId).toBe(
    'settlement-2',
  );
});

it('settlement corrections become stale and require explicit supersession or audited revocation', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  const match = context.drawDefinition.structures![0].matchUps![0];
  match.matchUpStatus = 'RETIRED';
  match.score = { sets: [{ setNumber: 1, side1Score: 8, side2Score: 6 }] };
  const request = { ...settlementRequest(context), treatment: { kind: 'PLAYED_POINTS' as const } };
  expect(settleRotatingPartnerResult(request).success).toBe(true);
  expect(getRotatingPartnerStandings(context).unresolved).toHaveLength(0);
  match.score.sets![0].side1Score = 9;
  expect(getRotatingPartnerStandings(context).staleSettlementIds).toEqual([request.requestId]);
  expect(getRotatingPartnerStandings(context).unresolved).toHaveLength(1);
  const before = structuredClone(context.tournamentRecord);
  expect(
    settleRotatingPartnerResult({ ...request, requestId: 'stale', supersedesRequestId: request.requestId }).error,
  ).toBeDefined();
  expect(context.tournamentRecord).toEqual(before);
  const fresh = {
    ...request,
    requestId: 'fresh',
    supersedesRequestId: request.requestId,
    expectedOutcome: settlementOutcome(match),
  };
  expect(settleRotatingPartnerResult(fresh).success).toBe(true);
  expect(settleRotatingPartnerResult({ ...fresh, reason: 'conflicting retry' }).error).toBeDefined();
  const revoke = {
    ...fresh,
    requestId: 'revoke',
    supersedesRequestId: 'fresh',
    treatment: { kind: 'UNRESOLVED' as const },
  };
  expect(settleRotatingPartnerResult(revoke).success).toBe(true);
  expect(getRotatingPartnerStandings(context).unresolved).toHaveLength(1);
  expect(context.drawDefinition.competitionSettlements).toHaveLength(3);
});

it('invalid settlements and corrupt audit history refuse without a write', () => {
  const context = setup();
  apply(context);
  settle(context);
  const match = context.drawDefinition.structures![0].matchUps![0];
  expect(settleRotatingPartnerResult(settlementRequest(context)).error).toBeDefined();
  match.matchUpStatus = 'DEFAULTED';
  delete match.winningSide;
  const request = settlementRequest(context);
  const before = structuredClone(context.tournamentRecord);
  expect(
    settleRotatingPartnerResult({ ...request, treatment: { kind: 'CREDIT', winningPoints: 20, losingPoints: 12 } })
      .error,
  ).toBeDefined();
  expect(settleRotatingPartnerResult({ ...request, reason: ' ' }).error).toBeDefined();
  expect(settleRotatingPartnerResult({ ...request, supersedesRequestId: 'missing' }).error).toBeDefined();
  expect(context.tournamentRecord).toEqual(before);
  expect(settleRotatingPartnerResult(request).success).toBe(true);
  context.drawDefinition.competitionSettlements!.push(
    structuredClone(context.drawDefinition.competitionSettlements![0]),
  );
  expect(getRotatingPartnerStandings(context).error).toBeDefined();
});

it.each(['draw', 'event', 'tournament'])('settlement engine API respects a DRAWS lock at %s scope', (level) => {
  const context = setup();
  apply(context);
  settle(context);
  context.drawDefinition.structures![0].matchUps![0].matchUpStatus = 'WALKOVER';
  const { tournamentRecord, drawDefinition, event, roundNumber, ...request } = settlementRequest(context);
  tournamentEngine.setState(tournamentRecord);
  const scopeParams: { drawId?: string; eventId?: string } = {};
  if (level === 'draw') scopeParams.drawId = 'd';
  if (level === 'event') scopeParams.eventId = 'e';
  expect(
    tournamentEngine.addMutationLock({ ...scopeParams, scope: 'DRAWS', lockToken: 'settlement-lock' }).success,
  ).toBe(true);
  const before = structuredClone(tournamentEngine.getState().tournamentRecords);
  expect(tournamentEngine.settleRotatingPartnerResult({ drawId: 'd', ...request }).error).toBeDefined();
  expect(tournamentEngine.getState().tournamentRecords).toEqual(before);
  expect(
    tournamentEngine.settleRotatingPartnerResult({ drawId: 'd', ...request, lockToken: 'settlement-lock' }).success,
  ).toBe(true);
});

it('settlement runtime and closed schema validators agree', () => {
  const context = setup();
  apply(context);
  context.drawDefinition.structures![0].matchUps![0].matchUpStatus = 'WALKOVER';
  const result = settleRotatingPartnerResult(settlementRequest(context));
  expect(result.success).toBe(true);
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  ajv.addSchema(schema, 'tournament');
  const validate = ajv.compile({ $ref: 'tournament#/definitions/RotatingPartnerSettlement' });
  const valid = result.settlement!;
  for (const record of [
    valid,
    { ...valid, reason: ' ' },
    { ...valid, extra: 1 },
    { ...valid, recordedAt: 'bad' },
    { ...valid, treatment: { kind: 'CREDIT', winningPoints: -1, losingPoints: 0 } },
    { ...valid, expectedOutcome: { matchUpStatus: 'IN_PROGRESS' } },
  ]) {
    expect(isRotatingPartnerSettlement(record)).toBe(!!validate(record));
  }
});

it('a valid completed correction supersedes exit settlement and resumes the ordinary tally contract', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  const match = context.drawDefinition.structures![0].matchUps![0];
  match.matchUpStatus = 'RETIRED';
  match.score = { sets: [{ setNumber: 1, side1Score: 8, side2Score: 6 }] };
  const request = { ...settlementRequest(context), treatment: { kind: 'PLAYED_POINTS' as const } };
  expect(settleRotatingPartnerResult(request).success).toBe(true);
  match.matchUpStatus = 'COMPLETED';
  match.score = { sets: [{ setNumber: 1, side1Score: 20, side2Score: 12, winningSide: 1 }] };
  match.winningSide = 1;
  const standings = getRotatingPartnerStandings(context);
  expect(standings.success).toBe(true);
  expect(standings.unresolved).toHaveLength(0);
  expect(standings.staleSettlementIds).toEqual([request.requestId]);
  const contributions = standings.contributions!.filter((row) => row.matchUpId === match.matchUpId);
  expect(contributions.map((row) => row.pointsScored).toSorted((a, b) => a - b)).toEqual([12, 12, 20, 20]);
  expect(contributions.every((row) => row.treatment === 'COMPLETED' && !row.settlementRequestId)).toBe(true);
  expect(getRotatingPartnerRoundPreview({ ...context, roundNumber: 2 }).success).toBe(true);
  expect(context.drawDefinition.competitionSettlements).toHaveLength(1);
});
