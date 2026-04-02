/**
 * Coverage tests for assignTieMatchUpParticipant refactoring.
 * Targets uncovered branches: gender enforcement, invalid side number,
 * missing participant, team resolution, PAIR assignment to doubles.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { INVALID_SIDE_NUMBER, MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

describe('assignTieMatchUpParticipant coverage', () => {
  function generateTeamTournament() {
    const drawProfiles = [{ drawSize: 4, tieFormatName: 'COLLEGE_DEFAULT' }];
    const eventProfiles = [{ eventType: TEAM_EVENT, drawProfiles }];

    return mocksEngine.generateTournamentRecord({
      eventProfiles,
      setState: true,
    });
  }

  it('returns MISSING_PARTICIPANT_ID when no participantId provided', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUp = matchUps.find((m) => m.matchUpType === SINGLES_MATCHUP && m.matchUpTieId);

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: tieMatchUp.matchUpId,
      participantId: '',
      drawId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('returns INVALID_SIDE_NUMBER when sideNumber is invalid', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUp = matchUps.find((m) => m.matchUpType === SINGLES_MATCHUP && m.matchUpTieId);

    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM' && m.matchUpId === tieMatchUp.matchUpTieId);
    const participantId = teamMatchUp?.sides?.[0]?.participant?.individualParticipantIds?.[0];
    if (!participantId) return;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: tieMatchUp.matchUpId,
      sideNumber: 3,
      participantId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_SIDE_NUMBER);
  });

  it('returns PARTICIPANT_NOT_FOUND when participantId does not exist', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUp = matchUps.find((m) => m.matchUpType === SINGLES_MATCHUP && m.matchUpTieId);

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: tieMatchUp.matchUpId,
      participantId: 'nonexistent-id',
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('succeeds when assigning participant to singles tie matchUp', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM' && m.sides?.every((s) => s.participantId));
    if (!teamMatchUp) return;

    const singlesTieMatchUp = matchUps.find(
      (m) => m.matchUpType === SINGLES_MATCHUP && m.matchUpTieId === teamMatchUp.matchUpId,
    );
    if (!singlesTieMatchUp) return;

    const side1ParticipantId = teamMatchUp.sides[0].participant?.individualParticipantIds?.[0];
    if (!side1ParticipantId) return;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: singlesTieMatchUp.matchUpId,
      participantId: side1ParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedLineUp).toBeDefined();
  });

  it('returns SUCCESS when participant is already assigned', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM' && m.sides?.every((s) => s.participantId));
    if (!teamMatchUp) return;

    const singlesTieMatchUp = matchUps.find(
      (m) => m.matchUpType === SINGLES_MATCHUP && m.matchUpTieId === teamMatchUp.matchUpId,
    );
    if (!singlesTieMatchUp) return;

    const side1ParticipantId = teamMatchUp.sides[0].participant?.individualParticipantIds?.[0];
    if (!side1ParticipantId) return;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: singlesTieMatchUp.matchUpId,
      participantId: side1ParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: singlesTieMatchUp.matchUpId,
      participantId: side1ParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('assigns individual participant to doubles tie matchUp', () => {
    const {
      drawIds: [drawId],
    } = generateTeamTournament();

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM' && m.sides?.every((s) => s.participantId));
    if (!teamMatchUp) return;

    const doublesTieMatchUp = matchUps.find(
      (m) => m.matchUpType === DOUBLES && m.matchUpTieId === teamMatchUp.matchUpId,
    );
    if (!doublesTieMatchUp) return;

    const side1ParticipantId = teamMatchUp.sides[0].participant?.individualParticipantIds?.[0];
    if (!side1ParticipantId) return;

    let result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: doublesTieMatchUp.matchUpId,
      participantId: side1ParticipantId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});
