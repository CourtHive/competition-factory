import tieFormatDefaults from '@Assemblies/generators/templates/tieFormatDefaults';
import { validateLineUp } from '@Validators/validateTeamLineUp';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const tieFormat = tieFormatDefaults();
const collectionId = tieFormat.collectionDefinitions[0].collectionId;

// prettier-ignore
const scenarios = [
  // valid
  { lineUp: [], tieFormat, expectation: true },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [] }], tieFormat, expectation: true, },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [{ collectionPosition: 5 }] }], tieFormat, expectation: true, },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [ { collectionPosition: 5, collectionId }, ], }], tieFormat, expectation: true },

  // invalid
  { lineUp: undefined, tieFormat, expectation: false },
  { lineUp: [''], tieFormat, expectation: false },
  { lineUp: [{}], tieFormat, expectation: false },
  { lineUp: [{ participantId: [] }], tieFormat, expectation: false },
  { lineUp: [{ participantId: '' }], tieFormat, expectation: false },
  { lineUp: [{ participantId: 'someId' }], tieFormat, expectation: false },
  { lineUp: [{ participantId: 'someId', collectionAssignments: '' }], tieFormat, expectation: false, },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [''] }], tieFormat, expectation: false, },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [{}] }], tieFormat, expectation: false, },
  { lineUp: [{ participantId: 'someId', collectionAssignments: [{ collectionPosition: '5' }] }], tieFormat, expectation: false, },
  {
    lineUp: [
      { participantId: 'someId', collectionAssignments: [{ collectionPosition: 1, collectionId }] },
      { participantId: 'someId', collectionAssignments: [{ collectionPosition: 2, collectionId }] },
    ],
    tieFormat,
    expectation: false,
  },
];

it.each(scenarios)('can validate a lineUp', (scenario: any) => {
  const { lineUp, tieFormat } = scenario;
  const validation = validateLineUp({ lineUp, tieFormat });
  expect(validation.valid).toEqual(scenario.expectation);
  if (!validation.valid) {
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.error).toEqual(INVALID_VALUES);
  }
});
