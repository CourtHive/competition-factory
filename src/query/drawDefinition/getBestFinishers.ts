import { numericSort } from '@Tools/sorting';

/**
 * Selects participants for a bestOf playoff group from round robin results.
 *
 * Strategy:
 * 1. Collect ALL participants from the guaranteed finishingPositions (e.g., all group winners)
 * 2. If more participants are needed to reach `bestOf` count, collect from the next
 *    finishing position(s) and rank them by GEMscore (or the specified rankBy metric)
 * 3. Take the top N from the ranked pool to fill the remaining slots
 *
 * @param participantResults - Map of participantId → { groupOrder, GEMscore, provisionalOrder, ... }
 *   organized by RR group structureId
 * @param finishingPositions - The guaranteed finishing positions (e.g., [1])
 * @param bestOf - Total number of participants desired
 * @param rankBy - Ranking method for cross-group comparison (default: 'GEMscore')
 * @param groupCount - Number of RR groups
 * @param provisionalPositioning - Whether to use provisional ordering
 *
 * @returns Array of { participantId, GEMscore, finishingPosition, groupingValue, isBestFinisher }
 */
type ParticipantResult = {
  groupOrder?: number;
  provisionalOrder?: number;
  GEMscore?: number;
  [key: string]: any;
};

type GroupResults = {
  structureId: string;
  results: { [participantId: string]: ParticipantResult };
};

type BestFinishersArgs = {
  groupResults: GroupResults[];
  finishingPositions: number[];
  bestOf: number;
  rankBy?: string;
  provisionalPositioning?: boolean;
};

type SelectedParticipant = {
  participantId: string;
  GEMscore?: number;
  finishingPosition: number;
  groupingValue: string;
  isBestFinisher: boolean; // true if selected via cross-group ranking (not guaranteed)
};

export function getBestFinishers({
  provisionalPositioning,
  rankBy = 'GEMscore',
  finishingPositions,
  groupResults,
  bestOf,
}: BestFinishersArgs): {
  selectedParticipants: SelectedParticipant[];
  consumedPositions: { [finishingPosition: number]: number };
} {
  const candidatePool: SelectedParticipant[] = [];
  const guaranteed: SelectedParticipant[] = [];

  const sortedFinishingPositions = [...finishingPositions].sort(numericSort);
  const maxGuaranteedPos = Math.max(...sortedFinishingPositions);

  // Collect participants from each RR group
  for (const { structureId, results } of groupResults) {
    for (const [participantId, result] of Object.entries(results)) {
      const finishingPosition = result.groupOrder || (provisionalPositioning && result.provisionalOrder);
      if (!finishingPosition) continue;

      const entry: SelectedParticipant = {
        groupingValue: structureId,
        GEMscore: result.GEMscore,
        isBestFinisher: false,
        finishingPosition,
        participantId,
      };

      if (sortedFinishingPositions.includes(finishingPosition)) {
        // Guaranteed: this participant's finishing position is in the specified list
        guaranteed.push(entry);
      } else if (finishingPosition > maxGuaranteedPos) {
        // Candidate: could be selected as a "best finisher" from a lower position
        candidatePool.push(entry);
      }
    }
  }

  const selectedParticipants = [...guaranteed];
  const remaining = bestOf - guaranteed.length;

  if (remaining > 0 && candidatePool.length > 0) {
    // Sort candidates: first by finishing position (prefer 2nd over 3rd),
    // then by GEMscore descending within same position
    const sortedCandidates = candidatePool.toSorted((a, b) => {
      if (a.finishingPosition !== b.finishingPosition) {
        return a.finishingPosition - b.finishingPosition;
      }
      // Higher GEMscore is better
      if (rankBy === 'GEMscore') {
        return (b.GEMscore ?? 0) - (a.GEMscore ?? 0);
      }
      return 0;
    });

    const bestFinishers = sortedCandidates.slice(0, remaining);
    bestFinishers.forEach((entry) => {
      entry.isBestFinisher = true;
      selectedParticipants.push(entry);
    });
  }

  // Build consumption map: how many participants were taken from each finishing position
  const consumedPositions: { [finishingPosition: number]: number } = {};
  for (const participant of selectedParticipants) {
    const pos = participant.finishingPosition;
    consumedPositions[pos] = (consumedPositions[pos] || 0) + 1;
  }

  return { selectedParticipants, consumedPositions };
}
