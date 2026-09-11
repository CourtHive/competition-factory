import { describe, expect, it } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function seedTournament() {
  const result = mocksEngine.generateTournamentRecord({
    inContext: true,
    setState: true,
    drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
  });
  const drawId = result.drawIds[0];
  const matchUpId = result.tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0].matchUpId;
  return { drawId, matchUpId };
}

function outcome(scoreString = '6-3 6-4', winningSide = 1) {
  return mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome;
}

describe('schedule.scoredTime — auto-capture on score entry', () => {
  it('stamps scoredTime as an ISO string the first time a matchUp is scored', () => {
    const { drawId, matchUpId } = seedTournament();

    const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: outcome() });
    expect(result.success).toEqual(true);

    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.scoredTime).toMatch(ISO_RE);
  });

  it('keeps the original scoredTime when a score is later corrected', () => {
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: outcome('6-3 6-4', 1) });
    const firstStamp = tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule?.scoredTime;
    expect(firstStamp).toMatch(ISO_RE);

    // correction — same winner, different score
    tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: outcome('6-3 7-6(3)', 1) });
    const secondStamp = tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule?.scoredTime;
    expect(secondStamp).toEqual(firstStamp);
  });

  it('clears scoredTime when the score is removed (reset to TO_BE_PLAYED)', () => {
    const { drawId, matchUpId } = seedTournament();

    tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: outcome() });
    expect(tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule?.scoredTime).toMatch(ISO_RE);

    tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { matchUpStatus: TO_BE_PLAYED, winningSide: undefined, score: undefined },
    });
    expect(tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule?.scoredTime).toBeUndefined();
  });

  it('does not stamp scoredTime on an unscored matchUp', () => {
    const { matchUpId } = seedTournament();
    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp?.schedule?.scoredTime).toBeUndefined();
  });
});
