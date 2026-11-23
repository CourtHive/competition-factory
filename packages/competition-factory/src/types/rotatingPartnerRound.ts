import type { RotatingPartnerScoreContractWithTimed } from './rotatingPartnerScoring';
import type { RotatingPartnerTallyPolicy } from './rotatingPartnerTally';

/** Applied-round provenance, separate from competitionProfile configuration. */
export type RotatingPartnerRoundRecord = {
  version: 1;
  requestId: string;
  roundNumber: number;
  structureId: string;
  format: 'AMERICANO' | 'MEXICANO';
  algorithmVersion: 1;
  baseSeed: number;
  seedUsed: number;
  matchUpIds: string[];
  pairings: [[string, string], [string, string]][];
  tallyContract: RotatingPartnerTallyPolicy;
  standingsThroughRoundNumber?: number;
  scoringContract: RotatingPartnerScoreContractWithTimed;
  standingsSnapshot?: { participantId: string; pointsScored: number }[];
};
