import { checkMergeConsistency } from '@Query/participants/individualMerge/integrity';
import { defined } from '@Tests/helpers/defined';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import type { IndividualMergeBlocker } from '@Types/individualParticipantMerge';

test('detects a newly introduced participant-type mismatch against the baseline', () => {
  const { tournamentRecord: before } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [{ drawSize: 4 }],
  });
  const after = structuredClone(before);
  defined(after.events, 'events')[0].eventType = 'DOUBLES';
  const blockers: IndividualMergeBlocker[] = [];
  checkMergeConsistency(before, after, 'source', 'target', blockers);
  expect(blockers).toContainEqual(
    expect.objectContaining({
      code: 'INTEGRITY_CONFLICT',
      drawId: defined(defined(before.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0].drawId,
    }),
  );
});
