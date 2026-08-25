import { getExtensionAnomalies } from '@Query/tournaments/getExtensionAnomalies';
import { getParticipants } from '@Query/participants/getParticipants';
import { analyzeDraws } from '@Query/tournaments/analyzeDraws';
import { checkIsDual } from '@Query/tournaments/checkIsDual';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function analyzeTournament({ tournamentRecord }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { drawsAnalysis } = analyzeDraws({ tournamentRecord });

  const analysis: any = {
    isDual: checkIsDual(tournamentRecord),
    drawsAnalysis,
  };

  const participantResult = getParticipants({ tournamentRecord });
  if (participantResult.missingParticipantIds?.length) {
    analysis.missingParticipantIds = participantResult.missingParticipantIds;
  }

  // Extensions after the first of a given name are unreachable — every reader resolves with
  // `.find()`. Only present when there is something to report, matching `missingParticipantIds`.
  const extensionAnomalies = getExtensionAnomalies({ tournamentRecord });
  if (extensionAnomalies.length) {
    analysis.extensionAnomalies = extensionAnomalies;
  }

  return { ...SUCCESS, analysis };
}
