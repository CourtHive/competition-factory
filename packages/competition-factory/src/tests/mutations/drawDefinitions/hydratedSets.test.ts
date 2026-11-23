import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

test('inContext matchUp score.sets include timed boolean for timed sets', () => {
  const mockProfile = {
    // round robin: SET3-S:T20 can end level, so an elimination draw refuses it (spec § 9.7 rule 4)
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET3-S:T20' }],
    completeAllMatchUps: true,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  // T20 is a timed format, not a tiebreak-only format
  matchUps[0].score.sets.forEach((set) => expect(set.timed).toEqual(true));
});

test('inContext matchUp score.sets include tiebreakSet boolean for tiebreak-only sets', () => {
  const mockProfile = {
    drawProfiles: [{ drawSize: 4, matchUpFormat: 'SET3-S:TB20' }],
    completeAllMatchUps: true,
  };
  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  // TB20 is a tiebreak-only format
  matchUps[0].score.sets.forEach((set) => expect(set.tiebreakSet).toEqual(true));
});
