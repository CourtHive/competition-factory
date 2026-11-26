import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants and types
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TieFormat } from '@Types/tournamentTypes';

/**
 * The tieFormat a mocks league uses when its profile names none: three doubles rubbers sharing one point and six
 * singles worth a point each, first to four. A concrete object, so the mocksEngine does not reach into the tie
 * format catalogue for its default. It is the value `tieFormatDefaults({ namedFormat: COLLEGE_DEFAULT })` builds,
 * key order included, so generated records are unchanged; `src/tests/mocks/mockLeagueTieFormat.test.ts` holds the two equal.
 */
const MOCK_LEAGUE_TIE_FORMAT = {
  winCriteria: { valueGoal: 4 },
  collectionDefinitions: [
    {
      matchUpFormat: 'SET1-S:6/TB7',
      collectionName: 'Doubles',
      matchUpType: DOUBLES,
      collectionValue: 1,
      matchUpCount: 3,
    },
    {
      matchUpFormat: FORMAT_STANDARD,
      collectionName: 'Singles',
      matchUpType: SINGLES,
      matchUpCount: 6,
      matchUpValue: 1,
    },
  ],
  tieFormatName: 'College Default',
};

/**
 * A fresh copy of the mocks league default, with collectionIds minted as `tieFormatDefaults` mints them: from the
 * eventId for a mock record (`<eventId>-COL-<n>`), otherwise a UUID.
 */
export function mockLeagueTieFormat({ eventId, isMock }: { eventId?: string; isMock?: boolean }): TieFormat {
  const tieFormat = makeDeepCopy(MOCK_LEAGUE_TIE_FORMAT, false, true);
  tieFormat.collectionDefinitions = tieFormat.collectionDefinitions.map((collectionDefinition, index) => ({
    collectionId: isMock ? `${eventId}-COL-${index + 1}` : UUID(),
    ...collectionDefinition,
  }));
  return tieFormat;
}
