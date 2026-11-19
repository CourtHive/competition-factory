import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

// The default status profile weights DOUBLE_WALKOVER and DOUBLE_DEFAULT at 1 % each, and a double exit has no winner:
// asked for winningSide 1, about 2 in 100 outcomes came back with none, and a draw "completed" that way never advanced.
it('a forced winningSide always comes back as the winner with the default status profile', () => {
  for (let i = 0; i < 2000; i++) {
    const { outcome } = mocksEngine.generateOutcome({ winningSide: 1 });
    expect(outcome.winningSide).toEqual(1);
  }
});

it('without a forced winningSide the default profile still produces double exits', () => {
  const statuses = new Set(Array.from({ length: 2000 }, () => mocksEngine.generateOutcome({}).outcome.matchUpStatus));
  expect(statuses.has(DOUBLE_WALKOVER) || statuses.has(DOUBLE_DEFAULT)).toEqual(true);
});

// A caller's own profile is honoured: winningSide names the winner of whatever has one (completeDrawMatchUps forces
// side 1 alongside the profile it was given).
it.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])(
  'a profile weighting %s still yields it with a forced winningSide',
  (status) => {
    const { outcome } = mocksEngine.generateOutcome({ matchUpStatusProfile: { [status]: 100 }, winningSide: 2 });
    expect(outcome.matchUpStatus).toEqual(status);
    expect(outcome.winningSide).toBeUndefined();
  },
);
