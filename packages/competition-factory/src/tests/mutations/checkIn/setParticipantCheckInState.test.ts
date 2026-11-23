import { setParticipantCheckInState } from '@Mutate/timeItems/matchUps/setParticipantCheckInState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { DECLARED_ATTRIBUTION, CHECKED_IN, CHECKED_OUT } from '@Constants/presenceConstants';
import { POLICY_TYPE_SANCTIONING } from '@Constants/policyConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import type { PresenceRules } from '@Types/presencePolicyTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import {
  INVALID_ACTION,
  INVALID_ATTESTATION_SUBJECT,
  INVALID_ATTRIBUTION,
  INVALID_PARTICIPANT_ID,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

/**
 * Explicit presence intentions. Two desks that both see a player absent and both press "check in" must
 * leave ONE attestation, by the first attester; the toggle's second flip undid the first.
 */
const SELF_ONLY: PresenceRules = {
  COMPETITOR: {
    matchCheckIn: {
      expectation: 'advisory',
      attribution: { allowedRelationships: [ContactRelationshipEnum.SELF], onInvalid: 'reject' },
    },
  },
};

const PARENT = {
  attributionType: DECLARED_ATTRIBUTION,
  relationship: ContactRelationshipEnum.PARENT,
  name: 'A. Guardian',
};

const SELF = {
  attributionType: DECLARED_ATTRIBUTION,
  relationship: ContactRelationshipEnum.SELF,
  name: 'The Player',
};

function seeded({ presence }: { presence?: PresenceRules } = {}) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, eventType: DOUBLES }] });

  if (presence) {
    tournamentRecord.extensions = [
      ...(tournamentRecord.extensions ?? []),
      { name: 'appliedPolicies', value: { [POLICY_TYPE_SANCTIONING]: { policyName: 'test', presence } } },
    ];
  }
  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const side = matchUp.sides[0];
  const participantId = side.participant.individualParticipants[0].participantId;
  return { drawId, matchUpId: matchUp.matchUpId, participantId, pairParticipantId: side.participantId };
}

function history({ drawId, matchUpId }: { drawId: string; matchUpId: string }) {
  return (tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId }) as any).checkIns;
}

it('converges two identical arrivals on one attestation by the first attester', () => {
  const { drawId, matchUpId, participantId } = seeded();

  let result: any = tournamentEngine.setParticipantCheckInState({
    attributedTo: SELF,
    checkedIn: true,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject({ ...SUCCESS, checkedIn: true, changed: true });

  // the second desk saw the player absent too; its intention is redundant, not a new fact
  result = tournamentEngine.setParticipantCheckInState({
    attributedTo: PARENT,
    checkedIn: true,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject({ ...SUCCESS, checkedIn: true, changed: false });

  const checkIns = history({ drawId, matchUpId });
  expect(checkIns.length).toEqual(1);
  expect(checkIns[0].state).toEqual(CHECKED_IN);
  expect(checkIns[0].attributedTo.name).toEqual('The Player');
});

it('converges two identical departures on one departure', () => {
  const { drawId, matchUpId, participantId } = seeded();
  tournamentEngine.setParticipantCheckInState({ checkedIn: true, participantId, matchUpId, drawId });

  let result: any = tournamentEngine.setParticipantCheckInState({ checkedIn: false, participantId, matchUpId, drawId });
  expect(result).toMatchObject({ ...SUCCESS, checkedIn: false, changed: true });

  result = tournamentEngine.setParticipantCheckInState({ checkedIn: false, participantId, matchUpId, drawId });
  expect(result).toMatchObject({ ...SUCCESS, checkedIn: false, changed: false });

  const checkIns = history({ drawId, matchUpId });
  expect(checkIns.map((attestation: any) => attestation.state)).toEqual([CHECKED_IN, CHECKED_OUT]);
});

it('treats a check-out of a player never checked in as a no-op, where the strict API refuses', () => {
  const { drawId, matchUpId, participantId } = seeded();

  const result: any = tournamentEngine.setParticipantCheckInState({
    checkedIn: false,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject({ ...SUCCESS, checkedIn: false, changed: false });
  expect(history({ drawId, matchUpId }).length).toEqual(0);

  const strict: any = tournamentEngine.checkOutParticipant({ participantId, matchUpId, drawId });
  expect(strict.error).toBeDefined();
});

it('keeps the legacy toggle semantics: two toggles cancel', () => {
  const { drawId, matchUpId, participantId } = seeded();

  tournamentEngine.toggleParticipantCheckInState({ participantId, matchUpId, drawId });
  tournamentEngine.toggleParticipantCheckInState({ participantId, matchUpId, drawId });

  const state: any = tournamentEngine.getMatchUpCheckInState({ matchUpId, drawId });
  expect(state.participants.find((p: any) => p.participantId === participantId).checkedIn).toEqual(false);
  expect(history({ drawId, matchUpId }).length).toEqual(2);
});

it('carries a supplied attestationId and occurredAt on a transition', () => {
  const { drawId, matchUpId, participantId } = seeded();
  const occurredAt = '2026-11-12T09:05:00.000Z';
  const attestationId = 'server-stamped-attestation';

  tournamentEngine.setParticipantCheckInState({
    checkedIn: true,
    attestationId,
    participantId,
    occurredAt,
    matchUpId,
    drawId,
  });

  const [attestation] = history({ drawId, matchUpId });
  expect(attestation).toMatchObject({ attestationId, occurredAt });
});

it('validates attribution on an actual arrival but not on a no-op', () => {
  const { drawId, matchUpId, participantId } = seeded({ presence: SELF_ONLY });

  let result: any = tournamentEngine.setParticipantCheckInState({
    attributedTo: PARENT,
    checkedIn: true,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_ATTRIBUTION);
  expect(history({ drawId, matchUpId }).length).toEqual(0);

  result = tournamentEngine.setParticipantCheckInState({
    attributedTo: SELF,
    checkedIn: true,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result.changed).toEqual(true);

  // the player is already in: nothing is written, so there is no attestation whose attester to judge
  result = tournamentEngine.setParticipantCheckInState({
    attributedTo: PARENT,
    checkedIn: true,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject({ ...SUCCESS, changed: false });
});

it('refuses a check-out once scoring has begun, even when the player is already out', () => {
  const { drawId, matchUpId, participantId } = seeded();

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 1 }] } },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setParticipantCheckInState({ checkedIn: false, participantId, matchUpId, drawId });
  expect(result.error).toEqual(INVALID_ACTION);
});

it('validates the subject and the requested state', () => {
  const { drawId, matchUpId, participantId, pairParticipantId } = seeded();

  let result: any = tournamentEngine.setParticipantCheckInState({
    participantId: 'unknown',
    checkedIn: true,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_ID);

  // presence is an individual fact; a pair's state is derived from its members
  for (const checkedIn of [true, false]) {
    result = tournamentEngine.setParticipantCheckInState({
      participantId: pairParticipantId,
      checkedIn,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_ATTESTATION_SUBJECT);
  }

  result = tournamentEngine.setParticipantCheckInState({ checkedIn: 'yes', participantId, matchUpId, drawId } as any);
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setParticipantCheckInState({ participantId, matchUpId, drawId } as any);
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setParticipantCheckInState({ checkedIn: true, participantId, matchUpId: 'none', drawId });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);

  result = tournamentEngine.setParticipantCheckInState({ checkedIn: true, participantId, drawId } as any);
  expect(result.error).toBeDefined();

  expect(history({ drawId, matchUpId }).length).toEqual(0);
});

it('requires a tournament record when called directly', () => {
  const result: any = setParticipantCheckInState({
    drawDefinition: {} as any,
    participantId: 'p',
    checkedIn: true,
    matchUpId: 'm',
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('converges two desks submitting the same intention through executionQueue', () => {
  const { drawId, matchUpId, participantId } = seeded();
  const intention = {
    method: 'setParticipantCheckInState',
    params: { checkedIn: true, participantId, matchUpId, drawId },
  };

  const result: any = tournamentEngine.executionQueue([intention, intention]);
  expect(result.success).toEqual(true);
  expect(result.results.map((r: any) => r.changed)).toEqual([true, false]);
  expect(history({ drawId, matchUpId }).length).toEqual(1);
});
