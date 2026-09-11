import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// Constants
import { DOUBLES } from '@Constants/eventConstants';

test('contextProfile can specify inferGender - works with SINGLES', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 64 }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);
  let { matchUps } = tournamentEngine.allTournamentMatchUps({ contextProfile: { inferGender: true } });

  expect(matchUps.map((m) => m.inferredGender).filter(Boolean).length).toBeGreaterThanOrEqual(1);

  matchUps = tournamentEngine.allDrawMatchUps({
    contextProfile: { inferGender: true },
    inContext: true,
    drawId,
  }).matchUps;

  let igMatchUps = matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toBeGreaterThanOrEqual(1);

  // without contextProfile there are no inferredGender matchUps
  let result = tournamentEngine.getParticipants({ withMatchUps: true });
  igMatchUps = result.matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toEqual(0);

  result = tournamentEngine.getParticipants({ contextProfile: { inferGender: true }, withMatchUps: true });

  igMatchUps = result.matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toBeGreaterThanOrEqual(1);
});

// `nonRandom: 1` seeds participant sexes and draw positioning. Without it this
// test sat on a probabilistic floor: inferredGender requires BOTH pairs to be
// single-sex AND to agree, so P is 1/2 x 1/2 x 1/2 = 12.5% per matchUp. Measured
// over 240 unseeded generations of exactly this scenario the mean was ~7.9 of 63
// matchUps (as predicted) but the tail reached 1, and the 63 matchUps are
// correlated because the same pairs recur through the rounds — so `>= 1` failed
// on CI run 31758113547. Seeded, it lands on 12. The SINGLES case above needs no
// seed: side gender is the individual's own sex, so P is 1/2 per matchUp.
test('contextProfile can specify inferGender - works with DOUBLES', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 64, eventType: DOUBLES }],
    completeAllMatchUps: true,
    nonRandom: 1,
  });

  tournamentEngine.setState(tournamentRecord);
  let { matchUps } = tournamentEngine.allTournamentMatchUps({ contextProfile: { inferGender: true } });

  expect(matchUps.map((m) => m.inferredGender).filter(Boolean).length).toBeGreaterThanOrEqual(1);

  matchUps = tournamentEngine.allDrawMatchUps({
    contextProfile: { inferGender: true },
    inContext: true,
    drawId,
  }).matchUps;

  let igMatchUps = matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toBeGreaterThanOrEqual(1);

  // without contextProfile there are no inferredGender matchUps
  let result = tournamentEngine.getParticipants({ withMatchUps: true });
  igMatchUps = result.matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toEqual(0);

  result = tournamentEngine.getParticipants({
    contextProfile: { inferGender: true },
    withMatchUps: true,
  });

  igMatchUps = result.matchUps.map((m) => m.inferredGender).filter(Boolean);
  expect(igMatchUps.length).toBeGreaterThanOrEqual(1);
});
