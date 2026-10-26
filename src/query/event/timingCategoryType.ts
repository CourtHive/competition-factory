// types
import type { Category } from '@Types/tournamentTypes';

const JUNIOR = 'JUNIOR';

/** an under-age code: `U14`, `14U`, `U18` — the player is at most this age */
const UNDER_AGE = /^(?:U(\d{1,2})|(\d{1,2})U)$/i;

/**
 * The category type scheduling timing reads (recovery, average and overnight times by `categoryTypes`): the stated
 * `categoryType`, else the legacy `subType`, else JUNIOR detected from an under-age `ageCategoryCode` of 18 or younger
 * (`U14`, `18U`). A category stating a type keeps it; detection only fills a type nobody stated (CA 2026-10-25), since
 * the clients write `ageCategoryCode` alone. Anything else states no type.
 */
export function timingCategoryType(category?: Category | null): string | undefined {
  if (!category) return undefined;
  const stated = category.categoryType ?? (category as { subType?: string }).subType;
  if (stated) return stated;
  const match = UNDER_AGE.exec(category.ageCategoryCode ?? '');
  const age = match ? Number(match[1] ?? match[2]) : undefined;
  return age !== undefined && age <= 18 ? JUNIOR : undefined;
}
