import { parseCategoryAgeDetails } from '@Helpers/categories/parseCategoryAgeDetails';
import { competitionToday } from '@Query/tournaments/competitionToday';

// types
import { Category, Tournament } from '@Types/tournamentTypes';

type GetCategoryAgeDetailsArgs = {
  consideredDate?: string;
  category?: Category;
  /** Supplied by the engine; frames "today" when no `consideredDate` is given. */
  tournamentRecord?: Tournament;
};

/** A category's age range as dates. "today" is the tournament's calendar day (UTC when it names no zone), never the host's. */
export function getCategoryAgeDetails(params: GetCategoryAgeDetailsArgs) {
  const { category, consideredDate, tournamentRecord } = params;
  return parseCategoryAgeDetails({ category, consideredDate, today: () => competitionToday({ tournamentRecord }) });
}
