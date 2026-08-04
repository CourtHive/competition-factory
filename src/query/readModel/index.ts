// Read-model builder toolkit — the single source for TODS → read-model rows,
// shared by `cast()` (full rebuild) and the CFS incremental producer (per-draw),
// so both paths emit byte-identical rows. Exposed on the package as
// `readModel` (`import { readModel } from 'tods-competition-factory'`).

export { cast } from './cast';
export { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
export { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
export { resolveMatchUpPublishState } from './readModelPublish';
export type { MatchUpPublishState } from './readModelPublish';
export { isFactoryUuid, resolvePersonLink, LINK_PROVIDER_ID, LINK_UNRESOLVED } from './personRule';
export type { PersonLink } from './personRule';
export {
  tournamentRow,
  eventRow,
  drawRow,
  structureRow,
  seedRow,
  venueRow,
  courtRow,
  orderOfPlayRow,
  schedulingProfileRows,
  participantPublishRow,
  entryRows,
  matchUpRowSet,
  matchUpResultRow,
  rubberTieValue,
} from './readModelRows';
export type {
  MatchUpRowContext,
  MatchUpRowSet,
  SeedRowContext,
  StructureRowContext,
  CourtRowContext,
} from './readModelRows';
export type {
  ReadModelEventRow,
  ReadModelSeedRow,
  ReadModelDrawRow,
  ReadModelStructureRow,
  ReadModelCourtRow,
  ReadModelOrderOfPlayRow,
  ReadModelSchedulingProfileRow,
  ReadModelParticipantPublishRow,
} from '@Types/readModelTypes';
