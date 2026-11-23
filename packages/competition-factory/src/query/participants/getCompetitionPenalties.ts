import { getTournamentPenalties } from './getTournamentPenalties';

// constants and types
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { Penalty } from '@Types/tournamentTypes';

type GetCompetitionPenaltiesArgs = {
  tournamentRecords: TournamentRecords;
};
export function getCompetitionPenalties({ tournamentRecords }: GetCompetitionPenaltiesArgs) {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const allPenalties: Penalty[] = [];
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { penalties } = getTournamentPenalties({ tournamentRecord });
    allPenalties.push(...(penalties ?? []));
  }

  return { penalties: allPenalties };
}
