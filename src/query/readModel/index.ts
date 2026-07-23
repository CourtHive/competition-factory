// Read-model builder toolkit — the single source for TODS → read-model rows,
// shared by `cast()` (full rebuild) and the CFS incremental producer (per-draw),
// so both paths emit byte-identical rows. Exposed on the package as
// `readModel` (`import { readModel } from 'tods-competition-factory'`).

export { cast } from './cast';
export { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
export { resolveMatchUpPublishState } from './readModelPublish';
export type { MatchUpPublishState } from './readModelPublish';
export { isFactoryUuid, resolvePersonLink, LINK_PROVIDER_ID, LINK_UNRESOLVED } from './personRule';
export type { PersonLink } from './personRule';
export {
  tournamentRow,
  venueRow,
  entryRows,
  matchUpRowSet,
  matchUpResultRow,
  rubberTieValue,
} from './readModelRows';
export type { MatchUpRowContext, MatchUpRowSet } from './readModelRows';
