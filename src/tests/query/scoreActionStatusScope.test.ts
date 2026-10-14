import { getDisabledMatchUpStatuses } from '@Query/matchUps/getDisabledMatchUpStatuses';
import { getDeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { SINGLE_ELIMINATION, DOUBLE_ELIMINATION, LADDER, AD_HOC } from '@Constants/drawDefinitionConstants';
import { CHALLENGED, DEAD_RUBBER, COMPLETED } from '@Constants/matchUpStatusConstants';
import { MATCHUP_STATUS_OUT_OF_SCOPE } from '@Constants/errorConditionConstants';
import { outcomePipelineModes } from '@Constants/outcomePipelineConstants';
import { matchUpStatusScopes } from '@Constants/matchUpStatusScopes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { SINGLES, DOUBLES, TEAM } from '@Constants/matchUpTypes';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { SCORE } from '@Constants/matchUpActionConstants';

type Kind = 'singles' | 'doubles' | 'dual' | 'rubber' | 'decider' | 'teamDecider' | 'ladder' | 'adHoc';
const kinds: Kind[] = ['singles', 'doubles', 'dual', 'rubber', 'decider', 'teamDecider', 'ladder', 'adHoc'];
const DRAW_TYPES = {
  singles: SINGLE_ELIMINATION,
  doubles: SINGLE_ELIMINATION,
  dual: SINGLE_ELIMINATION,
  rubber: SINGLE_ELIMINATION,
  decider: DOUBLE_ELIMINATION,
  teamDecider: DOUBLE_ELIMINATION,
  ladder: LADDER,
  adHoc: AD_HOC,
};
const SCORING_POLICY = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

function createFixture(kind: Kind) {
  const team = new Set<Kind>(['dual', 'rubber', 'teamDecider']).has(kind);
  const decider = kind === 'decider' || kind === 'teamDecider';
  const drawType = DRAW_TYPES[kind];
  const individualEventType = kind === 'doubles' ? DOUBLES : SINGLES;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType,
        eventType: team ? TEAM : individualEventType,
        ...(team ? { tieFormatName: COLLEGE_D3 } : {}),
      },
    ],
    completeAllMatchUps: decider,
    policyDefinitions: SCORING_POLICY,
    nonRandom: 1,
    setState: true,
  });
  let rubberId: string | undefined;
  if (kind === 'rubber') {
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const dual = matchUps.find((m) => !m.collectionId && m.sides?.every((side) => !!side.participantId));
    const rubber = matchUps.find((m) => m.matchUpTieId === dual.matchUpId && m.matchUpType === SINGLES);
    expect(rubber).toBeDefined();
    rubberId = rubber.matchUpId;
    for (const side of dual.sides) {
      const teamParticipant = tournamentRecord.participants.find((p) => p.participantId === side.participantId);
      expect(
        tournamentEngine.assignTieMatchUpParticipantId({
          drawId,
          tieMatchUpId: rubberId,
          teamParticipantId: teamParticipant.participantId,
          participantId: teamParticipant.individualParticipantIds[0],
          sideNumber: side.sideNumber,
        }).success,
      ).toBe(true);
    }
  }
  if (kind === 'ladder') {
    const participantIds = tournamentRecord.participants.slice(0, 2).map(({ participantId }) => participantId);
    participantIds.forEach((participantId) => {
      expect(
        tournamentEngine.addLadderParticipant({ participantId, drawId, addedAt: '2026-10-13T10:00:00Z' }).success,
      ).toBe(true);
    });
    expect(
      tournamentEngine.issueChallenge({
        drawId,
        challengerParticipantId: participantIds[1],
        defenderParticipantId: participantIds[0],
        issuedAt: '2026-10-13T11:00:00Z',
      }).success,
    ).toBe(true);
  }
  if (kind === 'adHoc') {
    const participantIds: [string, string] = [
      tournamentRecord.participants[0].participantId,
      tournamentRecord.participants[1].participantId,
    ];
    const generated = tournamentEngine.generateAdHocMatchUps({
      drawId,
      roundNumber: 1,
      participantIdPairings: [{ participantIds }],
    });
    expect(generated.error).toBeUndefined();
    expect(tournamentEngine.addAdHocMatchUps({ drawId, matchUps: generated.matchUps }).success).toBe(true);
  }
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const record = tournamentEngine.getTournament().tournamentRecord;
  const drawDefinition = record.events[0].drawDefinitions[0];
  // The test identifies the Decider independently by its pair of WINNER/LOSER feeds.
  const winnerFeed = drawDefinition.links?.find(
    (winner) =>
      winner.linkType === 'WINNER' &&
      drawDefinition.links.some(
        (loser) =>
          loser.linkType === 'LOSER' &&
          loser.source.structureId === winner.source.structureId &&
          loser.source.roundNumber === winner.source.roundNumber &&
          loser.target.structureId === winner.target.structureId,
      ),
  );
  const matchUp = matchUps.find((m) => {
    if (decider) return m.structureId === winnerFeed?.target.structureId && !m.collectionId;
    if (kind === 'rubber') return m.matchUpId === rubberId;
    return !m.collectionId && m.sides?.every((side) => !!side.participantId);
  });
  expect(matchUp).toBeDefined();
  if (!matchUp) throw new Error('Fixture has no matchUp');
  return { drawId, matchUp, drawDefinition, record };
}

const fixtureCache = new Map<Kind, ReturnType<typeof createFixture>>();

/** Every assertion receives independent state; expensive completed draws are generated once. */
function fixture(kind: Kind) {
  const cached = fixtureCache.get(kind);
  if (cached) {
    const fresh = structuredClone(cached);
    tournamentEngine.setState(fresh.record);
    return fresh;
  }
  const created = createFixture(kind);
  fixtureCache.set(kind, structuredClone(created));
  return created;
}

const SCOPED_STATUSES = [CHALLENGED, DEAD_RUBBER] as const;
const PARITY_KINDS: Kind[] = ['singles', 'rubber', 'decider', 'teamDecider', 'ladder'];
const parityCases = outcomePipelineModes.flatMap((mode) =>
  PARITY_KINDS.flatMap((kind) => SCOPED_STATUSES.map((status) => ({ mode, kind, status }))),
);

function scoreAction(drawId: string, matchUpId: string) {
  const result = tournamentEngine.matchUpActions({ drawId, matchUpId });
  expect(result.error).toBeUndefined();
  const action = result.validActions?.find(({ type }) => type === SCORE);
  expect(action, 'the fixture must actually offer SCORE').toBeDefined();
  return action;
}

/**
 * The Decider fixtures are reached by completing a whole draw, and the TEAM one completes every COLLEGE_D3 dual of a
 * DOUBLE_ELIMINATION 8: ~16 s alone, 39.5 s under CI coverage contention (#5420's coverage shard 3), past the 30 s
 * per-test budget of whichever test first asked for it. Built once here, outside any one test's budget.
 */
beforeAll(() => {
  fixture('decider');
  fixture('teamDecider');
}, 180_000);

afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({});
});

describe('SCORE scope metadata', () => {
  it.each(kinds)('advertises the registered scoped statuses for %s', (kind) => {
    const { drawId, matchUp } = fixture(kind);
    const statuses = scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses;
    const expected = kind === 'ladder' ? [] : [CHALLENGED];
    // The branch works before and after #5416: unregistered statuses must never be invented here.
    if (matchUpStatusScopes[DEAD_RUBBER] && !new Set<Kind>(['rubber', 'decider', 'teamDecider']).has(kind))
      expected.push(DEAD_RUBBER);
    expect(statuses).toEqual(expected.toSorted((a, b) => a.localeCompare(b, 'en')));
    expect(new Set(statuses).size).toBe(statuses.length);
    expect(statuses).not.toContain(COMPLETED);
    const actions = tournamentEngine.matchUpActions({ drawId, matchUpId: matchUp.matchUpId }).validActions;
    for (const action of actions.filter(({ type }) => type !== SCORE))
      expect(action.disabledMatchUpStatuses).toBeUndefined();
    expect(scoreAction(drawId, matchUp.matchUpId).payload.disabledMatchUpStatuses).toBeUndefined();
  });

  it.each(parityCases)('scope refusal: $mode / $kind / $status', ({ mode, kind, status }) => {
    const { drawId, matchUp } = fixture(kind);
    const disabled = new Set(scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses);
    setOutcomePipeline(mode);
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: matchUp.matchUpId,
      outcome: { matchUpStatus: status },
    });
    expect(result.error === MATCHUP_STATUS_OUT_OF_SCOPE).toBe(disabled.has(status));
    if (!disabled.has(status)) expect(result.error, 'an unrelated refusal invalidates the fixture').toBeUndefined();
  });

  it('is read-only and emits no notices', () => {
    const { drawId, matchUp } = fixture('singles');
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const notices: unknown[] = [];
    setSubscriptions({
      modifyMatchUp: (notice) => notices.push(notice),
      modifyDrawDefinition: (notice) => notices.push(notice),
    });
    scoreAction(drawId, matchUp.matchUpId);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
    expect(notices).toEqual([]);
  });

  it('does not infer a Decider from its name', () => {
    const { drawId, matchUp, record, drawDefinition } = fixture('singles');
    drawDefinition.structures[0].structureName = 'Decider';
    tournamentEngine.setState(record);
    expect(getDeciderSnapshot(drawDefinition).matchUpIds.has(matchUp.matchUpId)).toBe(false);
    expect(scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses).toContain(CHALLENGED);
    if (matchUpStatusScopes[DEAD_RUBBER])
      expect(scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses).toContain(DEAD_RUBBER);
  });

  it('keeps the real Decider exemption after renaming it', () => {
    const { drawId, matchUp, record, drawDefinition } = fixture('decider');
    const { structure } = findDrawMatchUp({ drawDefinition, matchUpId: matchUp.matchUpId });
    if (!structure) throw new Error('Fixture has no Decider structure');
    structure.structureName = 'Court final';
    tournamentEngine.setState(record);
    expect(getDeciderSnapshot(drawDefinition).matchUpIds.has(matchUp.matchUpId)).toBe(true);
    expect(scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses).not.toContain(DEAD_RUBBER);
  });

  it('does not grant the Decider exemption to Main or Backdraw', () => {
    const { drawId, drawDefinition } = fixture('decider');
    const deciders = getDeciderSnapshot(drawDefinition).matchUpIds;
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const others = matchUps.filter((m) => !deciders.has(m.matchUpId) && m.sides?.every((s) => !!s.participantId));
    expect(others.length).toBeGreaterThan(1);
    for (const matchUp of others) {
      const statuses = scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses;
      if (matchUpStatusScopes[DEAD_RUBBER]) expect(statuses).toContain(DEAD_RUBBER);
      else expect(statuses).not.toContain(DEAD_RUBBER);
    }
  });

  it.each(SCOPED_STATUSES)('does not treat saved %s as scope permission', (status) => {
    const { drawId, matchUp, drawDefinition, record } = fixture('singles');
    const stored = findDrawMatchUp({ drawDefinition, matchUpId: matchUp.matchUpId }).matchUp;
    if (!stored) throw new Error('Fixture has no stored matchUp');
    stored.matchUpStatus = status;
    tournamentEngine.setState(record);
    const statuses = scoreAction(drawId, matchUp.matchUpId).disabledMatchUpStatuses;
    if (matchUpStatusScopes[status]) expect(statuses).toContain(status);
    else expect(statuses).not.toContain(status);
  });

  it('returns an empty array when every registered scope allows the supplied context', () => {
    const { drawDefinition, matchUp } = fixture('rubber');
    const found = findDrawMatchUp({ drawDefinition, matchUpId: matchUp.matchUpId }).matchUp;
    if (!found) throw new Error('Fixture has no stored matchUp');
    // A focused helper context: LADDER satisfies CHALLENGED; collectionId satisfies DEAD_RUBBER.
    expect(
      getDisabledMatchUpStatuses({ drawDefinition: { ...drawDefinition, drawType: LADDER }, matchUp: found }),
    ).toEqual([]);
  });
  it('discovers a newly registered status without another producer list', () => {
    const { drawDefinition, matchUp } = fixture('singles');
    const previous = matchUpStatusScopes[COMPLETED];
    try {
      matchUpStatusScopes[COMPLETED] = { drawTypes: [LADDER], reason: 'Fixture exercises registration discovery' };
      expect(getDisabledMatchUpStatuses({ drawDefinition, matchUp })).toContain(COMPLETED);
    } finally {
      if (previous) matchUpStatusScopes[COMPLETED] = previous;
      else delete matchUpStatusScopes[COMPLETED];
    }
  });

  it('does not add SCORE metadata to an unassigned rubber with no SCORE action', () => {
    const { drawId } = fixture('dual');
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    const rubber = matchUps.find((m) => !!m.collectionId);
    const { validActions } = tournamentEngine.matchUpActions({ drawId, matchUpId: rubber.matchUpId });
    expect(validActions.find(({ type }) => type === SCORE)).toBeUndefined();
    for (const action of validActions) expect(action.disabledMatchUpStatuses).toBeUndefined();
  });
});
