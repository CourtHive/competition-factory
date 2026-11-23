import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { globalState } from '../../..';
import { describe, expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_EVENT, MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { EXISTING_POLICY_TYPE, INVALID_VALUES, MISSING_POLICY_DEFINITION } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

/*
 * attachPolicies refuses before its first write: a refused call leaves the tournament, the event, the draw and its
 * structures exactly as they were, and announces nothing. It once created the element's empty `extensions` before
 * refusing, and with several records loaded wrote the earlier records before a later one refused.
 */

const SCORING = { scoring: { policyName: 'held', requireParticipantsForScoring: false } };
const SEEDING = { seeding: { policyName: 'new', seedingProfile: { positioning: 'CLUSTER' } } };

function subscribe() {
  const notices: string[] = [];
  const topic = (name: string) => () => notices.push(name);
  globalState.setSubscriptions({
    subscriptions: {
      [MODIFY_DRAW_DEFINITION]: topic(MODIFY_DRAW_DEFINITION),
      [MODIFY_TOURNAMENT_DETAIL]: topic(MODIFY_TOURNAMENT_DETAIL),
      [MODIFY_EVENT]: topic(MODIFY_EVENT),
    },
  });
  return notices;
}

const records = () => JSON.stringify(tournamentEngine.getState().tournamentRecords);

function setup() {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  // the event and the draw already hold the scoring policy, so attaching it again is refused EXISTING_POLICY_TYPE
  tournamentEngine.setState(tournamentRecord);
  for (const target of [{ eventId }, { drawId }, { tournamentId: tournamentRecord.tournamentId }]) {
    const result: any = tournamentEngine.attachPolicies({ policyDefinitions: SCORING, ...target });
    expect(result.success).toEqual(true);
  }
  // an element without extensions shows a stray `extensions: []` written by a refusal
  const { tournamentRecord: stored } = tournamentEngine.getTournament();
  const draw = stored.events[0].drawDefinitions[0];
  for (const element of [stored, stored.events[0], draw, ...draw.structures]) delete element.extensions;
  tournamentEngine.setState(stored);
  return { tournamentId: stored.tournamentId, eventId, drawId, structureId: draw.structures[0].structureId };
}

const refusals: [string, any, any][] = [
  ['no policies', {}, MISSING_POLICY_DEFINITION],
  ['a policy that is not an object', { avoidance: 'text' }, INVALID_VALUES],
  ['a policy type the element holds', SCORING, EXISTING_POLICY_TYPE],
  ['an invalid tally policy', { [POLICY_TYPE_ROUND_ROBIN_TALLY]: { groupOrderKey: 'gamesWonn' } }, INVALID_VALUES],
];

describe('a refused attachPolicies writes nothing and announces nothing', () => {
  for (const level of ['tournament', 'event', 'draw', 'structure'] as const) {
    it.each(refusals)(`at the ${level}: %s`, (_name, policyDefinitions, error) => {
      const { tournamentId, eventId, drawId, structureId } = setup();
      // a structure is not an element policies are attached to: a call naming one attaches to its draw
      const target = {
        tournament: { tournamentId },
        event: { eventId },
        draw: { drawId },
        structure: { drawId, structureId },
      }[level];
      const before = records();
      const notices = subscribe();
      let result: any = tournamentEngine.attachPolicies({ policyDefinitions, ...target });
      expect(result.error).toEqual(error);
      expect(records()).toEqual(before);
      expect(notices).toEqual([]);
    });
  }

  it('with several records and none named, an earlier record is not written before a later one refuses', () => {
    const first = mocksEngine.generateTournamentRecord().tournamentRecord;
    const second = mocksEngine.generateTournamentRecord().tournamentRecord;
    tournamentEngine.setState(first);
    let result: any = tournamentEngine.attachPolicies({ policyDefinitions: SCORING });
    expect(result.success).toEqual(true);
    const held = tournamentEngine.getTournament().tournamentRecord;
    tournamentEngine.setState([held, second]);

    const before = records();
    const notices = subscribe();
    // the first record holds scoring, so it skips the invalid scoring policy and would take seeding; the second
    // does not hold scoring and refuses it
    result = tournamentEngine.attachPolicies({ policyDefinitions: { scoring: 'text', ...SEEDING } });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(records()).toEqual(before);
    expect(notices).toEqual([]);

    // CONTROL: without the invalid policy both records take seeding
    result = tournamentEngine.attachPolicies({ policyDefinitions: SEEDING });
    expect(result.success).toEqual(true);
    expect(result.applied).toEqual(['seeding', 'seeding']);
  });
});
