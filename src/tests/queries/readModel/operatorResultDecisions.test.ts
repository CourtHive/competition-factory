import { createScoreEntryModel, enteredSets, setCell } from '../../../scoreEntryState';
import { operatorResultDecisions } from '@Query/readModel/operatorResultDecisions';
import { toEngineOutcome } from '../../../scoreEntryState/engineOutcome';
import { resultEntryContext } from '@Query/matchUp/resultEntryContext';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as readModel from '@Query/readModel';
import { describe, expect, it } from 'vitest';

// constants and types
import { TO_BE_PLAYED, IN_PROGRESS, SUSPENDED, COMPLETED } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import type { OperatorPresentationAudience } from '@Types/operatorPresentation';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';

function fixture(completeAllMatchUps = false, drawSize = 8, participantsCount = drawSize) {
  let result: any = mocksEngine.generateTournamentRecord({
    nonRandom: 20261120,
    setState: true,
    completeAllMatchUps,
    startDate: '2026-11-20',
    endDate: '2026-11-21',
    drawProfiles: [{ drawSize, participantsCount, matchUpFormat: 'SET3-S:6/TB7' }],
  });
  expect(result.error).toBeUndefined();
  return tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
}

function record(): Tournament {
  return tournamentEngine.getTournament().tournamentRecord;
}

function project(matchUp, audience: OperatorPresentationAudience = 'recorder') {
  let result: any = operatorResultDecisions({
    tournamentRecord: record(),
    drawId: matchUp.drawId,
    matchUpId: matchUp.matchUpId,
    audience,
  });
  expect(result.error).toBeUndefined();
  return result.candidates;
}

function outcome(winningSide = 1) {
  const matchUpFormat = 'SET3-S:6/TB7';
  let model = createScoreEntryModel({ matchUpFormat });
  for (const setIndex of [0, 1]) {
    model = setCell(model, { setIndex, side: 1, kind: 'games' }, winningSide === 1 ? 6 : 2 + setIndex);
    model = setCell(model, { setIndex, side: 2, kind: 'games' }, winningSide === 2 ? 6 : 2 + setIndex);
  }
  return toEngineOutcome({ winningSide, sets: enteredSets(model) }, matchUpFormat);
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

describe('internal operator result decisions — canonical actions, not v1 wire offers', () => {
  it('does not expose the candidate from the public readModel entry', () => {
    expect(readModel).not.toHaveProperty('operatorResultDecisions');
  });
  it('classifies an initial result and the accepted result actually advances the winning participant', () => {
    const matches = fixture();
    const match = matches.find((item) => item.roundNumber === 1 && item.roundPosition === 1)!;
    const winnerId = match.sides!.find((side) => side.sideNumber === 1)!.participantId;
    expect(
      matches.some((item) => item.roundNumber === 2 && item.sides?.some((side) => side.participantId === winnerId)),
    ).toBe(false);
    const candidate = project(match);
    expect(candidate.wireReady).toBe(false);
    expect(candidate.resultEntry).toEqual({
      state: 'candidate',
      intent: 'record-initial-result',
      concurrency: 're-evaluate',
    });
    expect(candidate.clearResult.state).toBe('unavailable');
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: match.drawId,
      matchUpId: match.matchUpId,
      outcome: outcome(),
    });
    expect(result.error).toBeUndefined();
    const after = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
    expect(after.find((item) => item.matchUpId === match.matchUpId)?.winningSide).toBe(1);
    expect(
      after.some((item) => item.roundNumber === 2 && item.sides?.some((side) => side.participantId === winnerId)),
    ).toBe(true);
    expect(project(match).resultEntry).toEqual({
      state: 'candidate',
      intent: 'correct-result',
      concurrency: 'verify-reviewed',
    });
  });

  it.each(['recorder', 'director'] as const)(
    'projects executable final correction and clear candidates for %s',
    (audience) => {
      const matches = fixture(true);
      const final = matches.toSorted((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0))[0];
      const candidate = project(final, audience);
      expect(candidate.resultEntry.intent).toBe('correct-result');
      expect(candidate.clearResult).toEqual({
        state: 'candidate',
        intent: 'clear-result',
        concurrency: 'verify-reviewed',
      });
      expect(final.score?.sets?.map((set) => [set.side1Score, set.side2Score])).not.toEqual(
        outcome(final.winningSide).score.sets.map((set) => [set.side1Score, set.side2Score]),
      );
      let result: any = tournamentEngine.setMatchUpStatus({
        drawId: final.drawId,
        matchUpId: final.matchUpId,
        outcome: outcome(final.winningSide),
      });
      expect(result.error).toBeUndefined();
      const corrected = tournamentEngine
        .allTournamentMatchUps({ inContext: true })
        .matchUps.find((item) => item.matchUpId === final.matchUpId)!;
      expect(corrected.score?.sets?.map((set) => [set.side1Score, set.side2Score])).toEqual(
        outcome(final.winningSide).score.sets.map((set) => [set.side1Score, set.side2Score]),
      );
      result = tournamentEngine.setMatchUpStatus({
        drawId: final.drawId,
        matchUpId: final.matchUpId,
        outcome: toEngineOutcome({ cleared: true }),
      });
      expect(result.error).toBeUndefined();
      const cleared = tournamentEngine
        .allTournamentMatchUps({ inContext: true })
        .matchUps.find((item) => item.matchUpId === final.matchUpId)!;
      expect(cleared.winningSide).toBeUndefined();
      expect(cleared.matchUpStatus).toBe(TO_BE_PLAYED);
      expect(cleared.score?.sets ?? []).toEqual([]);
      expect(project(final).resultEntry.intent).toBe('record-initial-result');
    },
  );

  it('withholds a clear where canonical downstream protection refuses it, while retaining correction', () => {
    const matches = fixture(true);
    const first = matches.find((item) => item.roundNumber === 1)!;
    expect(project(first).clearResult.state).toBe('unavailable');
    expect(project(first).resultEntry.intent).toBe('correct-result');
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: first.drawId,
      matchUpId: first.matchUpId,
      outcome: toEngineOutcome({ cleared: true }),
    });
    expect(result.error).toBeDefined();
  });

  it('uses canonical absence for an unfilled match, instead of enabling from status', () => {
    const matches = fixture();
    const unfilled = matches.find((item) => item.roundNumber === 3)!;
    expect(unfilled.matchUpStatus).toBe(TO_BE_PLAYED);
    const candidate = project(unfilled);
    expect(candidate.resultEntry).toEqual({ state: 'unavailable', reasonCode: 'ACTION_UNAVAILABLE' });
    expect(candidate.clearResult.state).toBe('unavailable');
  });

  it('preserves canonical action presence and status restrictions across a completed draw', () => {
    const matches = fixture(true);
    for (const match of matches) {
      const canonical = tournamentEngine.matchUpActions({ drawId: match.drawId, matchUpId: match.matchUpId });
      expect(canonical.error).toBeUndefined();
      const score = canonical.validActions?.find((action) => action.type === SCORE);
      const candidate = project(match);
      expect(candidate.resultEntry.state === 'candidate').toBe(!!score);
      expect(candidate.clearResult.state === 'candidate').toBe(
        !!canonical.validActions?.some((action) => action.type === CLEAR_SCORE),
      );
      expect(candidate.disabledMatchUpStatuses).toEqual(score?.disabledMatchUpStatuses ?? []);
    }
  });

  it('retains canonical BYE exclusion', () => {
    const match = fixture(false, 8, 6).find((item) => item.matchUpStatus === 'BYE')!;
    expect(match).toBeDefined();
    expect(project(match).resultEntry.state).toBe('unavailable');
    expect(project(match).clearResult.state).toBe('unavailable');
  });

  it('preserves the documented SCORE policy exception instead of inventing a new restriction', () => {
    const match = fixture()[0];
    let result: any = tournamentEngine.attachPolicies({
      drawId: match.drawId,
      policyDefinitions: {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [{ stages: [], stageSequences: [], enabledActions: [], disabledActions: [SCORE] }],
        },
      },
    });
    expect(result.error).toBeUndefined();
    const canonical = tournamentEngine.matchUpActions({ drawId: match.drawId, matchUpId: match.matchUpId });
    expect(canonical.validActions?.some((action) => action.type === SCORE)).toBe(true);
    expect(project(match).resultEntry.state).toBe('candidate');
  });

  it('qualifies a doubles first-result candidate through canonical scoring', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'DOUBLES', matchUpFormat: 'SET3-S:6/TB7' }],
      nonRandom: 9,
      setState: true,
    });
    const match = tournamentEngine.allTournamentMatchUps().matchUps.find((item) => item.roundNumber === 1)!;
    expect(project(match).resultEntry.intent).toBe('record-initial-result');
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: match.drawId,
      matchUpId: match.matchUpId,
      outcome: outcome(),
    });
    expect(result.error).toBeUndefined();
    expect(project(match).resultEntry.intent).toBe('correct-result');
  });

  it('uses canonical hierarchical format resolution and refuses malformed format', () => {
    const match = fixture()[0];
    const source = structuredClone(record());
    const draw = source.events![0].drawDefinitions![0];
    const stored = draw
      .structures!.flatMap((structure) => structure.matchUps ?? [])
      .find((item) => item.matchUpId === match.matchUpId)!;
    delete stored.matchUpFormat;
    draw.matchUpFormat = 'SET3-S:6NOAD/TB7-F:TB10';
    let result: any = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result.error).toBeUndefined();
    expect(result.candidates.matchUpFormat).toBe(draw.matchUpFormat);
    stored.matchUpFormat = 'not-a-format';
    result = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result).toEqual({ error: NOT_IMPLEMENTED });
  });

  it('requires review for an imported partial score without widening canonical clear eligibility', () => {
    const match = fixture()[0];
    const source = structuredClone(record());
    const stored = source
      .events![0].drawDefinitions![0].structures!.flatMap((structure) => structure.matchUps ?? [])
      .find((item) => item.matchUpId === match.matchUpId)!;
    stored.score = { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] };
    let result: any = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result.error).toBeUndefined();
    expect(result.candidates.resultEntry.intent).toBe('correct-result');
    expect(result.candidates.clearResult.state).toBe('unavailable');
  });

  it('leaves final outcome validation authoritative, despite a scoring candidate', () => {
    const match = fixture()[0];
    expect(project(match).resultEntry.state).toBe('candidate');
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: match.drawId,
      matchUpId: match.matchUpId,
      outcome: { winningSide: 1, matchUpFormat: 'not-a-format', score: { sets: [] } },
    });
    expect(result.error).toBeDefined();
    expect(project(match).resultEntry.intent).toBe('record-initial-result');
  });

  it('keeps a scoreless live match on the initial-entry path', () => {
    const match = fixture()[0];
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: match.drawId,
      matchUpId: match.matchUpId,
      outcome: toEngineOutcome({ matchUpStatus: IN_PROGRESS }),
    });
    expect(result.error).toBeUndefined();
    expect(project(match).resultEntry).toEqual({
      state: 'candidate',
      intent: 'record-initial-result',
      concurrency: 're-evaluate',
    });
  });

  it('keeps input immutable even when deeply frozen, and emits no raw records or executable payloads', () => {
    const match = fixture()[0];
    const source = structuredClone(record());
    source.participants![0].person = {
      personId: 'protected-id',
      birthDate: 'private-birth-date',
      contacts: [{ emailAddress: 'private-contact' }],
    };
    const before = JSON.stringify(source);
    freeze(source);
    let result: any = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(source)).toBe(before);
    const wire = JSON.stringify(result.candidates);
    for (const forbidden of [
      'protected-id',
      'private-birth-date',
      'private-contact',
      'participantName',
      'payload',
      'method',
      'dependencyToken',
    ])
      expect(wire).not.toContain(forbidden);
    expect(wire).not.toContain('"offered"');
  });

  it('resolves the supplied tournament while an unrelated tournament is globally loaded', () => {
    const match = fixture()[0];
    const source = structuredClone(record());
    const expected = project(match);
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], nonRandom: 17, setState: true });
    let result: any = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result.error).toBeUndefined();
    expect(result.candidates).toEqual(expected);
  });

  it.each([undefined, 'public', '__proto__', 'constructor'])(
    'refuses undeclared audience %s without any candidates',
    (audience) => {
      const match = fixture()[0];
      let result: any = operatorResultDecisions({
        tournamentRecord: record(),
        drawId: match.drawId!,
        matchUpId: match.matchUpId,
        audience: audience as OperatorPresentationAudience,
      });
      expect(result).toEqual({ error: INVALID_VALUES });
    },
  );

  it('refuses missing source, missing scope, unknown draw and unknown match without a partial result', () => {
    expect(operatorResultDecisions()).toEqual({ error: INVALID_VALUES });
    const match = fixture()[0];
    for (const changed of [{ drawId: '' }, { matchUpId: '' }, { drawId: 'unknown' }, { matchUpId: 'unknown' }]) {
      let result: any = operatorResultDecisions({
        tournamentRecord: record(),
        drawId: match.drawId!,
        matchUpId: match.matchUpId,
        audience: 'recorder',
        ...changed,
      });
      expect(result.error).toBeDefined();
      expect(result.candidates).toBeUndefined();
    }
  });

  it('refuses team scope rather than projecting a rubber as an independent result', () => {
    const match = fixture()[0];
    const source = structuredClone(record());
    source.events![0].eventType = 'TEAM';
    let result: any = operatorResultDecisions({
      tournamentRecord: source,
      drawId: match.drawId!,
      matchUpId: match.matchUpId,
      audience: 'recorder',
    });
    expect(result).toEqual({ error: NOT_IMPLEMENTED });
  });
});

describe('shared result-entry context', () => {
  it.each([
    [{ matchUpStatus: TO_BE_PLAYED }, false, false],
    [{ matchUpStatus: IN_PROGRESS }, true, false],
    [{ matchUpStatus: SUSPENDED }, true, false],
    [{ matchUpStatus: COMPLETED, winningSide: 1 }, true, true],
    [{ matchUpStatus: TO_BE_PLAYED, score: { sets: [{ side1Score: 3, side2Score: 2 }] } }, false, true],
  ] as [Partial<MatchUp>, boolean, boolean][])(
    'classifies recorded state %j',
    (matchUp, hasOutcomeToRemove, requiresReview) => {
      expect(resultEntryContext(matchUp)).toEqual({ hasOutcomeToRemove, requiresReview });
    },
  );
});
