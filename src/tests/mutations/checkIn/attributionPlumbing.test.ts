import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DECLARED_ATTRIBUTION, USER_ATTRIBUTION } from '@Constants/presenceConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * Three gaps found while building the desk surface, each of which made attribution look supported
 * while being unusable end to end.
 */
const PARENT = {
  attributionType: DECLARED_ATTRIBUTION,
  relationship: ContactRelationshipEnum.PARENT,
  telephone: '+1 555 0100',
  name: 'A. Guardian',
};

function seeded() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, eventType: DOUBLES }] });
  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const participantId = matchUp.sides[0].participant.individualParticipants[0].participantId;
  return { drawId, matchUpId: matchUp.matchUpId, participantId };
}

it('forwards the attester through toggleParticipantCheckInState', () => {
  const { drawId, matchUpId, participantId } = seeded();

  // the toggle is the entry point every desk client uses — it is what decides the direction — so an
  // attester dropped here is dropped on the only path actually called
  const result: any = tournamentEngine.toggleParticipantCheckInState({
    attributedTo: PARENT,
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  const history: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId });
  expect(history.checkIns.length).toEqual(1);
  expect(history.checkIns[0].attributedTo.name).toEqual('A. Guardian');
  expect(history.checkIns[0].attributedTo.relationship).toEqual(ContactRelationshipEnum.PARENT);
});

it('forwards occurredAt through the toggle as well', () => {
  const { drawId, matchUpId, participantId } = seeded();
  const OCCURRED = '2026-09-19T09:05:00.000Z';

  tournamentEngine.toggleParticipantCheckInState({ occurredAt: OCCURRED, participantId, matchUpId, drawId });

  const history: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId });
  expect(history.checkIns[0].occurredAt).toEqual(OCCURRED);
  expect(history.checkIns[0].recordedAt).not.toEqual(OCCURRED);
});

it('attests the check-OUT too — somebody vouched that the player left', () => {
  const { drawId, matchUpId, participantId } = seeded();

  tournamentEngine.toggleParticipantCheckInState({ participantId, matchUpId, drawId });
  tournamentEngine.toggleParticipantCheckInState({ attributedTo: PARENT, participantId, matchUpId, drawId });

  const history: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId });
  expect(history.checkIns.length).toEqual(2);
  expect(history.checkIns[0].attributedTo).toBeUndefined();
  expect(history.checkIns.at(-1).attributedTo.name).toEqual('A. Guardian');
});

it('is the ONLY read that carries the attester', () => {
  const { drawId, matchUpId, participantId } = seeded();
  tournamentEngine.toggleParticipantCheckInState({ attributedTo: PARENT, participantId, matchUpId, drawId });

  // every bulk emission strips it (D-PRIV) — which left check-in attribution write-only until this
  // query existed
  const hydrated: any = tournamentEngine.findMatchUp({ inContext: true, matchUpId }).matchUp;
  expect(hydrated.checkIns[0].attributedTo).toBeUndefined();

  const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  expect(JSON.stringify(matchUps)).not.toContain('A. Guardian');

  const history: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId });
  expect(history.checkIns[0].attributedTo.name).toEqual('A. Guardian');
});

it('accepts a USER attester, which names an operator the record does not contain', () => {
  const { drawId, matchUpId, participantId } = seeded();

  // a desk operator is routinely not a Participant and has no CODES personId; forcing an auth id into
  // `personId` would put two vocabularies behind one field
  const result: any = tournamentEngine.toggleParticipantCheckInState({
    attributedTo: { attributionType: USER_ATTRIBUTION, userId: 'u-42', email: 'desk@example.com' },
    participantId,
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  const history: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId, drawId });
  expect(history.checkIns[0].attributedTo.attributionType).toEqual(USER_ATTRIBUTION);
  expect(history.checkIns[0].attributedTo.userId).toEqual('u-42');
});

it('reports a missing matchUp rather than an empty history', () => {
  const { drawId } = seeded();

  const result: any = tournamentEngine.getMatchUpCheckInHistory({ matchUpId: 'nope', drawId });
  expect(result.error).toBeDefined();
  expect(result.checkIns).toBeUndefined();
});
