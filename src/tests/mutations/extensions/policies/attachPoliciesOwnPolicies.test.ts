import { setDeepCopy, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf } from '@Acquire/structureMembers';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { EXISTING_POLICY_TYPE } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

/**
 * attachPolicies WRITES ONLY THE POLICIES IT IS GIVEN (CA 2026-10-18: "fix the attachPolicies bug"). It read the
 * merged tournament + event + draw policies and wrote them back as the element's own, so attaching one policy to a
 * draw copied every inherited policy onto it, and a policy inherited from the tournament refused a draw- or
 * event-level attach with EXISTING_POLICY_TYPE. Now the element's own policies decide: one attached here overrides an
 * inherited one, and only a policy already attached to this element refuses (unless `allowReplacement`).
 *
 * With several records loaded, a record that already holds the policy is skipped: it returned EXISTING_POLICY_TYPE
 * after the records before it were written. Attaching to the tournament announces MODIFY_TOURNAMENT_DETAIL.
 *
 * And the engine's addExtension / removeExtension announce a stored structure (MODIFY_DRAW_DEFINITION) or matchUp
 * (MODIFY_MATCHUP), as they already did a stored draw, event, venue, participant or the tournament.
 */

afterEach(() => {
  setSubscriptions({});
  setDeepCopy(true, {});
});

const scoring = (policyName: string) => ({ [POLICY_TYPE_SCORING]: { policyName, requireAllPositionsAssigned: false } });
const avoidance = { [POLICY_TYPE_AVOIDANCE]: { policyName: 'own', roundsToSeparate: undefined, policyAttributes: [] } };

const ownPolicies = (element: any) =>
  element?.extensions?.find((extension: any) => extension.name === APPLIED_POLICIES)?.value ?? {};

function withTournamentScoring() {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  tournamentEngine.setState(tournamentRecord);
  const attached: any = tournamentEngine.attachPolicies({ policyDefinitions: scoring('tournament') });
  expect(attached.success).toEqual(true);
  return { drawId, eventId };
}

describe('attachPolicies reads and writes the element’s own policies', () => {
  it('attaching to a draw writes only the policy given, not the inherited ones', () => {
    const { drawId } = withTournamentScoring();
    const before = Object.keys(ownPolicies(tournamentEngine.getEvent({ drawId }).drawDefinition));
    expect(before).not.toContain(POLICY_TYPE_SCORING);

    const result: any = tournamentEngine.attachPolicies({ policyDefinitions: avoidance, drawId });
    expect(result.success).toEqual(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    // the draw's own (the generator's seeding policy) plus the one attached; the tournament's scoring is not copied
    expect(Object.keys(ownPolicies(drawDefinition)).toSorted()).toEqual([...before, POLICY_TYPE_AVOIDANCE].toSorted());
  });

  it('a policy inherited from the tournament does not refuse the event’s own, which then overrides it', () => {
    const { eventId } = withTournamentScoring();
    let result: any = tournamentEngine.attachPolicies({ policyDefinitions: scoring('event'), eventId });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getAppliedPolicies({ eventId }).appliedPolicies.scoring.policyName).toEqual('event');

    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('again'), eventId });
    expect(result.error).toEqual(EXISTING_POLICY_TYPE);
    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('again'), eventId, allowReplacement: true });
    expect(result.success).toEqual(true);
  });

  it('with several records, one that already holds the policy is skipped and the others take it', () => {
    const { tournamentRecord: first } = mocksEngine.generateTournamentRecord();
    const { tournamentRecord: second } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState([first, second]);
    tournamentEngine.setTournamentId(first.tournamentId);
    let result: any = tournamentEngine.attachPolicies({
      policyDefinitions: scoring('first'),
      tournamentId: first.tournamentId,
    });
    expect(result.success).toEqual(true);

    const details: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (notices: any[]) => details.push(...notices) } });
    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('all') });
    expect(result.success).toEqual(true);
    expect(details.map((payload) => payload.tournamentId)).toEqual([second.tournamentId]);

    const policyNameOf = (tournamentId: string) => {
      tournamentEngine.setTournamentId(tournamentId);
      return ownPolicies(tournamentEngine.getTournament().tournamentRecord)[POLICY_TYPE_SCORING]?.policyName;
    };
    expect(policyNameOf(first.tournamentId)).toEqual('first');
    expect(policyNameOf(second.tournamentId)).toEqual('all');

    // every record holds it now: refused, and nothing is written or announced
    details.length = 0;
    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('none') });
    expect(result.error).toEqual(EXISTING_POLICY_TYPE);
    expect(details).toEqual([]);
    expect(policyNameOf(second.tournamentId)).toEqual('all');
  });

  it('attaching to the tournament announces MODIFY_TOURNAMENT_DETAIL', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const details: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (notices: any[]) => details.push(...notices) } });
    const result: any = tournamentEngine.attachPolicies({ policyDefinitions: scoring('tournament') });
    expect(result.success).toEqual(true);
    expect(details).toHaveLength(1);
  });
});

describe('the engine addExtension on a stored structure or matchUp', () => {
  const extension = { name: 'onElement', value: { note: 'stored' } };

  function borrowed() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    tournamentEngine.setState(tournamentRecord, false);
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structure = drawDefinition.structures[0];
    return { structure, matchUp: (matchUpsOf(structure) ?? [])[0] };
  }

  function capture(run: () => any) {
    const captured: Record<string, any[]> = {};
    const topics = [MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP];
    setSubscriptions({
      subscriptions: Object.fromEntries(
        topics.map((topic) => [topic, (notices: any[]) => (captured[topic] ??= []).push(...notices)]),
      ),
    });
    const result = run();
    setSubscriptions({});
    return { result, of: (topic: string) => captured[topic] ?? [] };
  }

  it('a structure is announced with MODIFY_DRAW_DEFINITION naming it, and a copy is not', () => {
    const { structure } = borrowed();
    const onCopy = capture(() => tournamentEngine.addExtension({ element: structuredClone(structure), extension }));
    expect(onCopy.result.success).toEqual(true);
    expect(onCopy.of(MODIFY_DRAW_DEFINITION)).toEqual([]);

    const added = capture(() => tournamentEngine.addExtension({ element: structure, extension }));
    expect(added.result.success).toEqual(true);
    expect(added.of(MODIFY_DRAW_DEFINITION)).toHaveLength(1);

    const removed = capture(() => tournamentEngine.removeExtension({ element: structure, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(removed.of(MODIFY_DRAW_DEFINITION)).toHaveLength(1);
  });

  it('a matchUp is announced with MODIFY_MATCHUP', () => {
    const { matchUp } = borrowed();
    const added = capture(() => tournamentEngine.addExtension({ element: matchUp, extension }));
    expect(added.result.success).toEqual(true);
    expect(added.of(MODIFY_MATCHUP).map((payload) => payload.matchUp?.matchUpId)).toEqual([matchUp.matchUpId]);

    const removed = capture(() => tournamentEngine.removeExtension({ element: matchUp, name: extension.name }));
    expect(removed.result.success).toEqual(true);
    expect(removed.of(MODIFY_MATCHUP).map((payload) => payload.matchUp?.matchUpId)).toEqual([matchUp.matchUpId]);
  });
});
