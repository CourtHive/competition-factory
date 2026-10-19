import { POLICY_COMPETITION_STANDARD } from '@Fixtures/policies/POLICY_COMPETITION_STANDARD';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, test } from 'vitest';
import { nextPowerOf2 } from '@Tools/math';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import { EXISTING_DRAFT, EXISTING_PARTICIPANT, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { AD_HOC, LADDER, MAIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { DROP, RESULT } from '@Constants/ladderConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { RANKING } from '@Constants/scaleConstants';
import { ASC } from '@Constants/sortingConstants';

/**
 * Batch A of "every mutation fires a notice": the draw and structure writers that changed the
 * record and announced nothing (measured with NOTICE_COVERAGE=1 on dev 1c33898bd8). Each case
 * asserts the notice a subscriber needs to persist the change, and that a refused or no-op call
 * sends none: a notice is a statement that the record changed.
 *
 * Payloads are counted, not callbacks: a subscriber is called once per flush with an array.
 */
const TOPICS = [MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS];

function capture(run: () => any) {
  const captured: Record<string, any[]> = {};
  const subscriptions = Object.fromEntries(
    TOPICS.map((topic) => [topic, (payloads: any[]) => (captured[topic] ??= []).push(...payloads)]),
  );
  setSubscriptions({ subscriptions });
  const result = run();
  setSubscriptions({ subscriptions: {} });
  const of = (topic: string) => captured[topic] ?? [];
  return { result, of, total: TOPICS.reduce((sum, topic) => sum + of(topic).length, 0) };
}

const drawIdsOf = (payloads: any[]) => payloads.map((payload) => payload.drawDefinition?.drawId ?? payload.drawId);
const matchUpIdsOf = (payloads: any[]) => payloads.map((payload) => payload.matchUp?.matchUpId);

function seedsOnlyDraw(participantsCount = 16) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: nextPowerOf2(participantsCount), participantsCount, seedsCount: 4, automated: { seedsOnly: true } },
    ],
    participantsProfile: { participantsCount },
    setState: true,
  });
  return drawId;
}

describe('draft', () => {
  test('initializeDraft announces the draw; a refused re-initialization announces nothing', () => {
    const drawId = seedsOnlyDraw();

    const init = capture(() => tournamentEngine.initializeDraft({ drawId, tierCount: 2 }));
    expect(init.result.success).toEqual(true);
    expect(drawIdsOf(init.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const again = capture(() => tournamentEngine.initializeDraft({ drawId, tierCount: 2 }));
    expect(again.result.error).toEqual(EXISTING_DRAFT);
    expect(again.total).toEqual(0);
  });

  test('setDrawPositionPreferences announces a change of preferences and nothing for a repeat', () => {
    const drawId = seedsOnlyDraw();
    const { tiers, unassignedDrawPositions } = tournamentEngine.initializeDraft({ drawId, tierCount: 2 });
    const participantId = tiers[0].participantIds[0];
    const preferences = unassignedDrawPositions.slice(0, 2);

    const set = capture(() => tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences }));
    expect(set.result.success).toEqual(true);
    expect(drawIdsOf(set.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    // the same preferences again: accepted, and nothing changed
    const repeat = capture(() => tournamentEngine.setDrawPositionPreferences({ drawId, participantId, preferences }));
    expect(repeat.result.success).toEqual(true);
    expect(repeat.total).toEqual(0);

    const refused = capture(() =>
      tournamentEngine.setDrawPositionPreferences({ drawId, participantId: 'nobody', preferences }),
    );
    expect(refused.result.error).toBeDefined();
    expect(refused.total).toEqual(0);
  });

  test('a preview resolution changes nothing, so the real resolution still places every tier', () => {
    const drawId = seedsOnlyDraw();
    const { tiers } = tournamentEngine.initializeDraft({ drawId, tierCount: 2 });
    const unseeded = tiers.flatMap((tier: any) => tier.participantIds);

    const preview = capture(() => tournamentEngine.resolveDraftPositions({ drawId, applyResults: false }));
    expect(preview.result.success).toEqual(true);
    expect(preview.total).toEqual(0);
    // a preview that marked the stored tiers resolved made the real resolution below skip all of them
    const { draftState } = tournamentEngine.getDraftState({ drawId });
    expect(draftState.tiers.map((tier: any) => tier.resolved)).toEqual([false, false]);

    const applied = capture(() => tournamentEngine.resolveDraftPositions({ drawId }));
    expect(applied.result.success).toEqual(true);
    expect(drawIdsOf(applied.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const placed = drawDefinition.structures[0].positionAssignments.map((assignment: any) => assignment.participantId);
    unseeded.forEach((participantId: string) => expect(placed).toContain(participantId));
  });
});

describe('competition state', () => {
  function competitionDraw() {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: AD_HOC, drawSize: 8, automated: true, roundsCount: 1 }],
      setState: true,
    });
    tournamentEngine.attachPolicies({ drawId, policyDefinitions: POLICY_COMPETITION_STANDARD });
    const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
    return { drawId, participantIds };
  }

  test('initialize, process a round and reset each announce the draw once, and only when it changed', () => {
    const { drawId, participantIds } = competitionDraw();
    expect(tournamentEngine.getCompetitionPolicy({ drawId }).competitionPolicy).toBeDefined();

    const init = capture(() => tournamentEngine.initializeCompetitionState({ drawId, participantIds }));
    expect(init.result.success).toEqual(true);
    expect(drawIdsOf(init.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const round = capture(() => tournamentEngine.processCompetitionRound({ drawId, roundNumber: 1, matchUps: [] }));
    expect(round.result.success).toEqual(true);
    expect(drawIdsOf(round.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    // a round already processed is left as it is
    const again = capture(() => tournamentEngine.processCompetitionRound({ drawId, roundNumber: 1, matchUps: [] }));
    expect(again.result.success).toEqual(true);
    expect(again.total).toEqual(0);

    const reset = capture(() => tournamentEngine.resetCompetitionState({ drawId }));
    expect(reset.result.success).toEqual(true);
    expect(drawIdsOf(reset.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const resetAgain = capture(() => tournamentEngine.resetCompetitionState({ drawId }));
    expect(resetAgain.result.success).toEqual(true);
    expect(resetAgain.total).toEqual(0);
  });
});

describe('ladder', () => {
  const ISO = (day: number) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;

  function ladder(policy?: any) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: LADDER, drawSize: 4 }],
      setState: true,
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const { drawId } = drawDefinition;
    const structureId = drawDefinition.structures[0].structureId;
    if (policy) tournamentEngine.attachPolicies({ drawId, policyDefinitions: { [POLICY_TYPE_LADDER]: policy } });
    const participantIds = tournamentRecord.participants.slice(0, 4).map((p: any) => p.participantId);
    return { drawId, structureId, participantIds };
  }

  function seat(drawId: string, participantIds: string[]) {
    for (const participantId of participantIds) {
      expect(tournamentEngine.addLadderParticipant({ participantId, addedAt: ISO(1), drawId }).success).toEqual(true);
    }
  }

  const standing = (drawId: string) => tournamentEngine.getLadderStanding({ drawId }).map((s: any) => s.participantId);

  test('seating and removal announce the standing; seating someone twice announces nothing', () => {
    const { drawId, structureId, participantIds } = ladder();

    const seated = capture(() =>
      tournamentEngine.addLadderParticipant({ participantId: participantIds[0], addedAt: ISO(1), drawId }),
    );
    expect(seated.result.success).toEqual(true);
    expect(seated.of(MODIFY_POSITION_ASSIGNMENTS).map((payload) => payload.structureId)).toEqual([structureId]);
    expect(drawIdsOf(seated.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const twice = capture(() =>
      tournamentEngine.addLadderParticipant({ participantId: participantIds[0], addedAt: ISO(1), drawId }),
    );
    expect(twice.result.error).toEqual(EXISTING_PARTICIPANT);
    expect(twice.total).toEqual(0);

    seat(drawId, participantIds.slice(1));
    const removed = capture(() =>
      tournamentEngine.removeLadderParticipant({ participantId: participantIds[1], removedAt: ISO(2), drawId }),
    );
    expect(removed.result.success).toEqual(true);
    expect(removed.of(MODIFY_POSITION_ASSIGNMENTS).map((payload) => payload.structureId)).toEqual([structureId]);
    expect(standing(drawId)).not.toContain(participantIds[1]);
  });

  test('each step of a challenge announces its matchUp, and the movement announces the standing', () => {
    const { drawId, structureId, participantIds } = ladder();
    seat(drawId, participantIds);
    const [defender, challenger] = standing(drawId);

    const { matchUpId } = tournamentEngine.issueChallenge({
      challengerParticipantId: challenger,
      defenderParticipantId: defender,
      issuedAt: ISO(1),
      drawId,
    });

    const steps: [string, () => any][] = [
      ['acceptChallenge', () => tournamentEngine.acceptChallenge({ matchUpId, respondedAt: ISO(2), drawId })],
      [
        'submitResult',
        () =>
          tournamentEngine.submitResult({
            participantId: challenger,
            outcome: { winningSide: 1 },
            submittedAt: ISO(3),
            matchUpId,
            drawId,
          }),
      ],
      [
        'confirmResult',
        () => tournamentEngine.confirmResult({ participantId: defender, confirmedAt: ISO(4), matchUpId, drawId }),
      ],
    ];
    for (const [method, run] of steps) {
      const step = capture(run);
      expect([method, step.result.success]).toEqual([method, true]);
      expect([method, matchUpIdsOf(step.of(MODIFY_MATCHUP))]).toEqual([method, [matchUpId]]);
      expect(step.of(MODIFY_MATCHUP)[0].structureId).toEqual(structureId);
    }

    // refused: already accepted, so nothing changed and nothing is announced
    const refused = capture(() => tournamentEngine.acceptChallenge({ matchUpId, respondedAt: ISO(5), drawId }));
    expect(refused.result.error).toEqual(INVALID_VALUES);
    expect(refused.total).toEqual(0);

    const moved = capture(() =>
      tournamentEngine.applyLadderMovement({ trigger: RESULT, appliedAt: ISO(5), matchUpId, drawId }),
    );
    expect(moved.result.moved).toEqual(true);
    expect(moved.of(MODIFY_POSITION_ASSIGNMENTS).map((payload) => payload.structureId)).toEqual([structureId]);

    const disputed = capture(() =>
      tournamentEngine.disputeResult({ participantId: defender, disputedAt: ISO(6), matchUpId, drawId }),
    );
    expect(disputed.result.success).toEqual(true);
    expect(matchUpIdsOf(disputed.of(MODIFY_MATCHUP))).toEqual([matchUpId]);
  });

  test('a decline announces its matchUp, and a lapse that drops the defender announces the standing', () => {
    const { drawId, structureId, participantIds } = ladder({ lapsePolicy: { allowance: 0, consequence: DROP } });
    seat(drawId, participantIds);
    const [defender, challenger] = standing(drawId);

    const { matchUpId } = tournamentEngine.issueChallenge({
      challengerParticipantId: challenger,
      defenderParticipantId: defender,
      issuedAt: ISO(1),
      drawId,
    });

    const declined = capture(() => tournamentEngine.declineChallenge({ matchUpId, respondedAt: ISO(2), drawId }));
    expect(declined.result.applied).toEqual(true);
    expect(matchUpIdsOf(declined.of(MODIFY_MATCHUP))).toEqual([matchUpId]);
    expect(declined.of(MODIFY_POSITION_ASSIGNMENTS).map((payload) => payload.structureId)).toEqual([structureId]);
    expect(standing(drawId).indexOf(defender)).toEqual(1);
  });
});

describe('TEAM draws', () => {
  function teamDraw() {
    const categoryName = '18U';
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      participantsProfile: { category: { categoryName }, scaleAllParticipants: true },
      drawProfiles: [{ category: { ageCategoryCode: categoryName }, eventType: TEAM_EVENT, drawSize: 4 }],
      setState: true,
    });
    return { drawId, scaleAccessor: { scaleName: categoryName, scaleType: RANKING, sortOrder: ASC } };
  }

  test('generateLineUps announces the draw only when it attaches the lineUps', () => {
    const { drawId, scaleAccessor } = teamDraw();

    const generated = capture(() => tournamentEngine.generateLineUps({ drawId, scaleAccessor, singlesOnly: true }));
    expect(generated.result.success).toEqual(true);
    expect(generated.of(MODIFY_DRAW_DEFINITION)).toEqual([]);

    const attached = capture(() =>
      tournamentEngine.generateLineUps({ drawId, scaleAccessor, singlesOnly: true, attach: true }),
    );
    expect(attached.result.success).toEqual(true);
    expect(drawIdsOf(attached.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);
  });

  test('disableTieAutoCalc announces the matchUp, and nothing when it is already disabled', () => {
    const { drawId } = teamDraw();
    const { matchUpId } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps[0];

    const disabled = capture(() => tournamentEngine.disableTieAutoCalc({ drawId, matchUpId }));
    expect(disabled.result.success).toEqual(true);
    expect(matchUpIdsOf(disabled.of(MODIFY_MATCHUP))).toEqual([matchUpId]);

    const again = capture(() => tournamentEngine.disableTieAutoCalc({ drawId, matchUpId }));
    expect(again.result.success).toEqual(true);
    expect(again.total).toEqual(0);
  });
});

describe('draw extensions', () => {
  const extension = { name: 'batchA', value: { a: 1 } };

  test('add and remove announce the draw when it changed, and nothing for a repeat', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });

    const added = capture(() => tournamentEngine.addDrawDefinitionExtension({ drawId, extension }));
    expect(added.result.success).toEqual(true);
    expect(drawIdsOf(added.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const addedAgain = capture(() => tournamentEngine.addDrawDefinitionExtension({ drawId, extension }));
    expect(addedAgain.result.success).toEqual(true);
    expect(addedAgain.total).toEqual(0);

    const removed = capture(() => tournamentEngine.removeDrawDefinitionExtension({ drawId, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(drawIdsOf(removed.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const removedAgain = capture(() =>
      tournamentEngine.removeDrawDefinitionExtension({ drawId, name: extension.name }),
    );
    expect(removedAgain.result.success).toEqual(true);
    expect(removedAgain.total).toEqual(0);
  });

  test('setDrawParticipantRepresentativeIds still honours disableNotice', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const representativeParticipantIds = [drawDefinition.entries[0].participantId];

    const silent = capture(() =>
      tournamentEngine.setDrawParticipantRepresentativeIds({
        drawId,
        representativeParticipantIds,
        disableNotice: true,
      }),
    );
    expect(silent.result.success).toEqual(true);
    expect(silent.total).toEqual(0);
  });

  test('the engine addExtension announces a stored drawDefinition element, and not a copy', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 4 } }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 4 });
    expect(tournamentEngine.addDrawDefinition({ eventId, drawDefinition }).success).toEqual(true);
    const { drawId } = drawDefinition;

    // getEvent hands out a copy: writing to it changes no record and announces nothing
    const copy = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const onCopy = capture(() => tournamentEngine.addExtension({ element: copy, extension }));
    expect(onCopy.result.success).toEqual(true);
    expect(onCopy.total).toEqual(0);

    const stored = capture(() => tournamentEngine.addExtension({ element: drawDefinition, extension }));
    expect(stored.result.success).toEqual(true);
    expect(drawIdsOf(stored.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const removed = capture(() => tournamentEngine.removeExtension({ element: drawDefinition, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(drawIdsOf(removed.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);
  });
});

describe('structures attached to a draw', () => {
  function mainDraw(drawSize = 16) {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, drawType: SINGLE_ELIMINATION }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const main = drawDefinition.structures.find((structure: any) => structure.stage === MAIN);
    const roundOne = main.matchUps.filter((matchUp: any) => matchUp.roundNumber === 1).map((m: any) => m.matchUpId);
    return { drawId, structureId: main.structureId, roundOne };
  }

  test('addLinkedConsolationStructure announces every main matchUp that now sends its loser on', () => {
    const { drawId, structureId, roundOne } = mainDraw();

    const added = capture(() =>
      tournamentEngine.addLinkedConsolationStructure({
        links: [{ sourceRoundNumber: 1, targetRoundNumber: 1 }],
        structureType: SINGLE_ELIMINATION,
        drawSize: 8,
        structureId,
        drawId,
      }),
    );
    expect(added.result.success).toEqual(true);
    expect(matchUpIdsOf(added.of(MODIFY_MATCHUP)).sort()).toEqual([...roundOne].sort());
    added.of(MODIFY_MATCHUP).forEach((payload) => expect(payload.matchUp.loserMatchUpId).toBeDefined());
  });

  test('generateAndPopulatePlayoffStructures leaves the record alone; attaching it announces the edges', () => {
    const { drawId, structureId, roundOne } = mainDraw();
    const storedEdges = () =>
      tournamentEngine
        .allDrawMatchUps({ drawId, inContext: false })
        .matchUps.filter((matchUp: any) => roundOne.includes(matchUp.matchUpId))
        .map((matchUp: any) => matchUp.loserMatchUpId);

    const generated = capture(() =>
      tournamentEngine.generateAndPopulatePlayoffStructures({ roundProfiles: [{ 1: 1 }], structureId, drawId }),
    );
    expect(generated.result.success).toEqual(true);
    expect(generated.total).toEqual(0);
    // nothing attached, so no stored matchUp may point into the generated structure
    expect(storedEdges().filter(Boolean)).toEqual([]);

    const attached = capture(() => tournamentEngine.attachPlayoffStructures({ drawId, ...generated.result }));
    expect(attached.result.success).toEqual(true);
    expect(
      matchUpIdsOf(attached.of(MODIFY_MATCHUP))
        .filter((id) => roundOne.includes(id))
        .sort(),
    ).toEqual([...roundOne].sort());
    expect(storedEdges().every(Boolean)).toEqual(true);
  });
});
