import { ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SEPARATE, WATERFALL } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';

import type { SeedingPolicy } from '@Types/factoryTypes';

export const POLICY_SEEDING_DEFAULT = {
  [POLICY_TYPE_SEEDING]: {
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    seedingProfile: {
      drawTypes: {
        [ROUND_ROBIN_WITH_PLAYOFF]: { positioning: WATERFALL },
        [ROUND_ROBIN]: { positioning: WATERFALL },
      },
      positioning: SEPARATE,
    },
    policyName: 'USTA SEEDING',

    seedsCountThresholds: [
      { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 },
      { drawSize: 128, minimumParticipantCount: 96, seedsCount: 32 },
      { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 },
    ],
  },
} satisfies { [POLICY_TYPE_SEEDING]: SeedingPolicy };

export default POLICY_SEEDING_DEFAULT;
