import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, test } from 'vitest';

// constants
import { MAIN, QUALIFYING, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { CANCELLED } from '@Constants/tournamentConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { PAIR } from '@Constants/participantConstants';
import {
  ADD_MATCHUPS,
  ADD_PARTICIPANTS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT,
  MODIFY_MATCHUP,
  MODIFY_PARTICIPANTS,
  MODIFY_TOURNAMENT_DETAIL,
  MODIFY_VENUE,
} from '@Constants/topicConstants';

/**
 * Batch D of "every mutation fires a notice": the last writers that changed the record and announced
 * nothing (measured with NOTICE_COVERAGE=1 on dev 9653ee6e10). Each case asserts the notice a
 * subscriber needs to persist the change, and that a refused or no-op call sends none.
 *
 * Payloads are counted, not callbacks: a subscriber is called once per flush with an array.
 */
const TOPICS = [
  ADD_MATCHUPS,
  ADD_PARTICIPANTS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT,
  MODIFY_MATCHUP,
  MODIFY_PARTICIPANTS,
  MODIFY_TOURNAMENT_DETAIL,
  MODIFY_VENUE,
];

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
const byString = (a: string, b: string) => a.localeCompare(b);

/** A record loaded WITHOUT a copy, so the test holds the stored elements themselves. */
function storedRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles: [{ courtsCount: 1 }],
  });
  tournamentEngine.setState(tournamentRecord, false);
  return tournamentRecord;
}

describe('tournament', () => {
  test('setTournamentStatus announces the status; the same status again, or a refused one, sends nothing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ setState: true });
    const { tournamentId } = tournamentRecord;

    const set = capture(() => tournamentEngine.setTournamentStatus({ status: CANCELLED }));
    expect(set.result.success).toEqual(true);
    expect(set.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([
      expect.objectContaining({ tournamentId, tournamentStatus: CANCELLED }),
    ]);

    const again = capture(() => tournamentEngine.setTournamentStatus({ status: CANCELLED }));
    expect(again.result.success).toEqual(true);
    expect(again.total).toEqual(0);

    const refused = capture(() => tournamentEngine.setTournamentStatus({ status: 'UNKNOWN' }));
    expect(refused.result.error).toBeDefined();
    expect(refused.total).toEqual(0);
  });
});

describe('draw entries', () => {
  function vcDraw() {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, voluntaryConsolation: {} }],
      completeAllMatchUps: true,
      setState: true,
    });
    const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({ drawId });
    const participantIds = eligibleParticipants.slice(0, 3).map((p: any) => p.participantId);
    const added = tournamentEngine.addDrawEntries({
      entryStage: VOLUNTARY_CONSOLATION,
      entryStatus: DIRECT_ACCEPTANCE,
      ignoreStageSpace: true,
      participantIds,
      drawId,
    });
    expect(added.success).toEqual(true);
    return drawId;
  }

  const vcEntriesOf = (payload: any) =>
    payload.drawEntries.filter((entry: any) => entry.entryStage === VOLUNTARY_CONSOLATION);

  test('removeStageEntries announces the draw entries it removes; an empty stage sends nothing', () => {
    const drawId = vcDraw();

    const removed = capture(() => tournamentEngine.removeStageEntries({ entryStage: VOLUNTARY_CONSOLATION, drawId }));
    expect(removed.result.success).toEqual(true);
    const [payload] = removed.of(MODIFY_DRAW_ENTRIES);
    expect(removed.of(MODIFY_DRAW_ENTRIES).length).toEqual(1);
    expect(payload.drawId).toEqual(drawId);
    expect(payload.tournamentId).toBeDefined();
    expect(payload.eventId).toBeDefined();
    expect(vcEntriesOf(payload)).toEqual([]);

    const again = capture(() => tournamentEngine.removeStageEntries({ entryStage: VOLUNTARY_CONSOLATION, drawId }));
    expect(again.result.success).toEqual(true);
    expect(again.total).toEqual(0);
  });

  test('resetDrawDefinition announces the voluntary consolation entries it removes', () => {
    const drawId = vcDraw();

    const reset = capture(() => tournamentEngine.resetDrawDefinition({ drawId }));
    expect(reset.result.success).toEqual(true);
    const payloads = reset.of(MODIFY_DRAW_ENTRIES);
    expect(drawIdsOf(payloads)).toEqual([drawId]);
    expect(vcEntriesOf(payloads[0])).toEqual([]);

    // nothing left to remove: the draw is announced, its entries are not
    const again = capture(() => tournamentEngine.resetDrawDefinition({ drawId }));
    expect(again.result.success).toEqual(true);
    expect(again.of(MODIFY_DRAW_ENTRIES)).toEqual([]);
  });
});

describe('matchUps', () => {
  test('removeDelegatedOutcome announces the matchUp; one with no delegated outcome sends nothing', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    const { matchUpId } = matchUps[0];
    const outcome = { score: { scoreStringSide1: '6-1 6-1', scoreStringSide2: '1-6 1-6' }, winningSide: 1 };
    expect(tournamentEngine.setDelegatedOutcome({ matchUpId, outcome, drawId }).success).toEqual(true);

    const removed = capture(() => tournamentEngine.removeDelegatedOutcome({ matchUpId, drawId }));
    expect(removed.result.success).toEqual(true);
    expect(matchUpIdsOf(removed.of(MODIFY_MATCHUP))).toEqual([matchUpId]);
    expect(removed.of(MODIFY_MATCHUP)[0].tournamentId).toBeDefined();
    expect(removed.of(MODIFY_MATCHUP)[0].matchUp.delegatedOutcome).toBeUndefined();

    const again = capture(() => tournamentEngine.removeDelegatedOutcome({ matchUpId, drawId }));
    expect(again.result.success).toEqual(true);
    expect(again.of(MODIFY_MATCHUP)).toEqual([]);
  });

  test('pruneDrawDefinition announces each kept matchUp whose drawPositions it renumbers', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, participantsCount: 20, automated: false }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const main = drawDefinition.structures.find((structure: any) => structure.stage === MAIN);
    const participantIds = drawDefinition.entries.map((entry: any) => entry.participantId);
    // a match-play draw: two pairs seated in the middle of the bracket and played
    const seated = [9, 10, 17, 18];
    seated.forEach((drawPosition, i) => {
      const result = tournamentEngine.assignDrawPosition({
        participantId: participantIds[i],
        structureId: main.structureId,
        drawPosition,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
    const played = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.filter((matchUp: any) => matchUp.roundNumber === 1 && seated.includes(matchUp.drawPositions?.[0]));
    expect(played.length).toEqual(2);
    for (const { matchUpId } of played) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      expect(tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId }).success).toEqual(true);
    }

    const pruned = capture(() => tournamentEngine.pruneDrawDefinition({ drawId }));
    expect(pruned.result.success).toEqual(true);
    const keptIds = pruned.result.matchUps.map((matchUp: any) => matchUp.matchUpId).sort(byString);
    expect(keptIds).toEqual(played.map((matchUp: any) => matchUp.matchUpId).sort(byString));
    // renumbered 9/10 → 1/2 and 17/18 → 3/4: both kept matchUps changed
    expect(matchUpIdsOf(pruned.of(MODIFY_MATCHUP)).sort(byString)).toEqual(keptIds);
    expect(pruned.of(MODIFY_MATCHUP).map(({ matchUp }) => matchUp.drawPositions)).toEqual(
      expect.arrayContaining([
        [1, 2],
        [3, 4],
      ]),
    );
  });
});

describe('draw generation', () => {
  test('generateDrawDefinition for an existing draw leaves the record alone until addDrawDefinition commits it', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ qualifyingPlaceholder: true, participantsCount: 16, qualifiersCount: 4, drawSize: 32 }],
      participantsProfile: { participantsCount: 64 },
    });
    tournamentEngine.setState(tournamentRecord);
    const { participants } = tournamentEngine.getParticipants();
    const entered = new Set(tournamentEngine.getEvent({ drawId }).event.entries.map((e: any) => e.participantId));
    const qIds = participants
      .map((p: any) => p.participantId)
      .filter((id: string) => !entered.has(id))
      .slice(0, 16);
    expect(tournamentEngine.addEventEntries({ participantIds: qIds, entryStage: QUALIFYING, eventId }).success).toEqual(
      true,
    );
    const drawEntries = tournamentEngine
      .getEvent({ drawId })
      .event.entries.filter((entry: any) => entry.entryStage === QUALIFYING);
    const before = tournamentEngine.getEvent({ drawId }).drawDefinition;

    const generated = capture(() =>
      tournamentEngine.generateDrawDefinition({
        qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 16, stageSequence: 1 }] }],
        automated: true,
        drawEntries,
        drawSize: 32,
        eventId,
        drawId,
      }),
    );
    expect(generated.result.success).toEqual(true);
    const qualifying = generated.result.drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifying.matchUps.length).toBeGreaterThan(0);
    // a generator: the stored draw is as it was, and nothing claims otherwise
    expect(tournamentEngine.getEvent({ drawId }).drawDefinition).toEqual(before);
    expect(generated.of(ADD_MATCHUPS)).toEqual([]);

    const committed = capture(() =>
      tournamentEngine.addDrawDefinition({
        drawDefinition: generated.result.drawDefinition,
        allowReplacement: true,
        eventId,
      }),
    );
    expect(committed.result.success).toEqual(true);
    const addedIds = committed.of(ADD_MATCHUPS).flatMap(({ matchUps }) => matchUps.map((m: any) => m.matchUpId));
    expect(addedIds).toEqual(expect.arrayContaining(qualifying.matchUps.map((m: any) => m.matchUpId)));
    const stored = tournamentEngine.getEvent({ drawId }).drawDefinition;
    expect(stored.structures.find((s: any) => s.stage === QUALIFYING).matchUps.length).toEqual(
      qualifying.matchUps.length,
    );
  });

  test('generateDrawTypeAndModifyDrawDefinition announces the matchUps it adds to a stored draw, and a copy sends nothing', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          qualifyingProfiles: [
            { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingRoundNumber: 2 }] },
          ],
          ignoreDefaults: true,
        },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const copy = capture(() =>
      tournamentEngine.generateDrawTypeAndModifyDrawDefinition({ modifyOriginal: false, drawSize: 32, drawId }),
    );
    expect(copy.result.success).toEqual(true);
    expect(copy.total).toEqual(0);

    const modified = capture(() =>
      tournamentEngine.generateDrawTypeAndModifyDrawDefinition({ modifyOriginal: true, drawSize: 32, drawId }),
    );
    expect(modified.result.success).toEqual(true);
    const main = tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures.find((structure: any) => structure.stage === MAIN);
    expect(main.matchUps.length).toEqual(31);
    const addedIds = modified.of(ADD_MATCHUPS).flatMap(({ matchUps }) => matchUps.map((m: any) => m.matchUpId));
    expect(addedIds.sort(byString)).toEqual(main.matchUps.map((m: any) => m.matchUpId).sort(byString));
    expect(drawIdsOf(modified.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);
  });
});

describe('engine addExtension / removeExtension', () => {
  const extension = { name: 'batchD', value: { note: 'stored' } };

  test('an event element is announced with MODIFY_EVENT, and a copy of it is not', () => {
    const tournamentRecord = storedRecord();
    const event = tournamentRecord.events[0];

    const onCopy = capture(() => tournamentEngine.addExtension({ element: structuredClone(event), extension }));
    expect(onCopy.result.success).toEqual(true);
    expect(onCopy.total).toEqual(0);

    const added = capture(() => tournamentEngine.addExtension({ element: event, extension }));
    expect(added.result.success).toEqual(true);
    expect(added.of(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([event.eventId]);

    const removed = capture(() => tournamentEngine.removeExtension({ element: event, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(removed.of(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([event.eventId]);

    // nothing of that name is left: nothing changes, nothing is announced
    const absent = capture(() => tournamentEngine.removeExtension({ element: event, name: extension.name }));
    expect(absent.result.success).toEqual(true);
    expect(absent.total).toEqual(0);
  });

  test('a venue element is announced with MODIFY_VENUE', () => {
    const tournamentRecord = storedRecord();
    const venue = tournamentRecord.venues[0];

    const added = capture(() => tournamentEngine.addExtension({ element: venue, extension }));
    expect(added.result.success).toEqual(true);
    expect(added.of(MODIFY_VENUE).map((payload) => payload.venue.venueId)).toEqual([venue.venueId]);

    const removed = capture(() => tournamentEngine.removeExtension({ element: venue, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(removed.of(MODIFY_VENUE).map((payload) => payload.venue.venueId)).toEqual([venue.venueId]);
  });

  test('a participant element is announced with MODIFY_PARTICIPANTS', () => {
    const tournamentRecord = storedRecord();
    const participant = tournamentRecord.participants[0];
    const idsOf = (payloads: any[]) => payloads.flatMap((p) => p.participants.map((x: any) => x.participantId));

    const added = capture(() => tournamentEngine.addExtension({ element: participant, extension }));
    expect(added.result.success).toEqual(true);
    expect(idsOf(added.of(MODIFY_PARTICIPANTS))).toEqual([participant.participantId]);

    const removed = capture(() => tournamentEngine.removeExtension({ element: participant, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(idsOf(removed.of(MODIFY_PARTICIPANTS))).toEqual([participant.participantId]);
  });

  test('the tournament record as the element, and removeExtension with discover, announce the root extensions', () => {
    const tournamentRecord = storedRecord();
    const { tournamentId } = tournamentRecord;

    const added = capture(() => tournamentEngine.addExtension({ element: tournamentRecord, extension }));
    expect(added.result.success).toEqual(true);
    expect(added.of(MODIFY_TOURNAMENT_DETAIL).map((payload) => payload.tournamentId)).toEqual([tournamentId]);

    const removed = capture(() => tournamentEngine.removeExtension({ discover: true, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    const [payload] = removed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(payload.tournamentId).toEqual(tournamentId);
    expect(payload.extensions.some((e: any) => e.name === extension.name)).toEqual(false);

    const absent = capture(() => tournamentEngine.removeExtension({ discover: true, name: extension.name }));
    expect(absent.result.success).toEqual(true);
    expect(absent.total).toEqual(0);
  });
});

describe('removePolicy', () => {
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { policyName: 'TEST', someAttribute: 'someValue' } };

  function drawWithOwnAndInheritedPolicies() {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    expect(tournamentEngine.attachPolicies({ policyDefinitions, drawId }).success).toEqual(true);
    // then a tournament-level policy the draw inherits but does not hold
    const inherited = { avoidance: { policyName: 'INHERITED', policyAttributes: [] } };
    expect(tournamentEngine.attachPolicies({ policyDefinitions: inherited }).success).toEqual(true);
    return drawId;
  }

  test('on a draw: MODIFY_DRAW_DEFINITION; a policy the draw does not hold is refused and sends nothing', () => {
    const drawId = drawWithOwnAndInheritedPolicies();

    const removed = capture(() => tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING, drawId }));
    expect(removed.result.success).toEqual(true);
    expect(drawIdsOf(removed.of(MODIFY_DRAW_DEFINITION))).toEqual([drawId]);

    const again = capture(() => tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING, drawId }));
    expect(again.result.error).toEqual(POLICY_NOT_FOUND);
    expect(again.total).toEqual(0);
  });

  test('on a draw: the draw keeps its own policies, and the inherited ones are not written onto it', () => {
    const drawId = drawWithOwnAndInheritedPolicies();
    const own = (id: string) =>
      tournamentEngine
        .getEvent({ drawId: id })
        .drawDefinition.extensions?.find((e: any) => e.name === 'appliedPolicies')?.value ?? {};
    const kept = Object.keys(own(drawId)).filter((policyType) => policyType !== POLICY_TYPE_SCORING);

    expect(tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING, drawId }).success).toEqual(true);
    expect(Object.keys(own(drawId)).sort(byString)).toEqual(kept.sort(byString));
    expect(own(drawId).avoidance).toBeUndefined();
  });

  test('on the tournament: MODIFY_TOURNAMENT_DETAIL with the root extensions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ setState: true });
    expect(tournamentEngine.attachPolicies({ policyDefinitions }).success).toEqual(true);

    const removed = capture(() => tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING }));
    expect(removed.result.success).toEqual(true);
    const payloads = removed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(payloads.map((payload) => payload.tournamentId)).toEqual([tournamentRecord.tournamentId]);
    expect(Array.isArray(payloads[0].extensions)).toEqual(true);

    const again = capture(() => tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING }));
    expect(again.result.error).toEqual(POLICY_NOT_FOUND);
    expect(again.total).toEqual(0);
  });
});

describe('addEventEntryPairs', () => {
  test('sends ADD_PARTICIPANTS once, with the tournamentId, for the pairs it creates', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType: DOUBLES_EVENT }],
      participantsProfile: { participantsCount: 8 },
      setState: true,
    });
    const individualIds = tournamentRecord.participants
      .filter((participant: any) => participant.participantType === 'INDIVIDUAL')
      .slice(0, 4)
      .map((participant: any) => participant.participantId);
    const participantIdPairs = [individualIds.slice(0, 2), individualIds.slice(2, 4)];

    const added = capture(() => tournamentEngine.addEventEntryPairs({ participantIdPairs, eventId }));
    expect(added.result.success).toEqual(true);
    const payloads = added.of(ADD_PARTICIPANTS);
    expect(payloads.length).toEqual(1);
    expect(payloads[0].tournamentId).toEqual(tournamentRecord.tournamentId);
    expect(payloads[0].participants.map((p: any) => p.participantType)).toEqual([PAIR, PAIR]);
    expect(payloads[0].participants.map((p: any) => p.participantId).sort(byString)).toEqual(
      [...added.result.newParticipantIds].sort(byString),
    );

    // the same pairs again: they exist, so nothing is added and nothing is announced
    const again = capture(() => tournamentEngine.addEventEntryPairs({ participantIdPairs, eventId }));
    expect(again.result.success).toEqual(true);
    expect(again.of(ADD_PARTICIPANTS)).toEqual([]);
  });
});

describe('a caller that opts out', () => {
  test('removeDelegatedOutcome honours disableNotice, as setDelegatedOutcome does', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId }).matchUps[0];
    const outcome = { score: { scoreStringSide1: '6-1 6-1', scoreStringSide2: '1-6 1-6' }, winningSide: 1 };
    expect(tournamentEngine.setDelegatedOutcome({ matchUpId, outcome, drawId }).success).toEqual(true);

    const silent = capture(() => tournamentEngine.removeDelegatedOutcome({ matchUpId, drawId, disableNotice: true }));
    expect(silent.result.success).toEqual(true);
    expect(silent.total).toEqual(0);
  });
});
