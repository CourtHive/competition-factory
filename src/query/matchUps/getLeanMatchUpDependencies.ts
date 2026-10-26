import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { structuresOf } from '@Acquire/structureMembers';

// types
import type { TournamentRecords } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * The dependency graph without hydrating the competition: what `getMatchUpDependencies({ tournamentRecords, drawIds })`
 * returns when no participant dependencies are asked, read from the stored draws. Each draw's matchUps come from the
 * structural index (the stored matchUp, its structure's context and its sides from the position assignments: what the
 * graph reads of a matchUp), with the stage and stage sequence that order them; a draw the index does not cover (TEAM)
 * is hydrated alone. Edges a draw does not store are derived as `getMatchUpDependencies` derives them.
 *
 * Every draw is indexed, as the hydrated graph hydrates every draw: a position link is read over all of them. Only the
 * draws named (all when none is) are processed. Pinned to the hydrated graph by `leanMatchUpDependencies.test.ts`.
 */
export function getLeanMatchUpDependencies({
  tournamentRecords,
  drawIds,
}: {
  tournamentRecords: TournamentRecords;
  drawIds?: string[];
}): ReturnType<typeof getMatchUpDependencies> {
  const matchUps: HydratedMatchUp[] = [];
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { tournamentId } = tournamentRecord;
    for (const event of tournamentRecord.events ?? []) {
      const { eventId } = event;
      for (const drawDefinition of event.drawDefinitions ?? []) {
        const index = buildStructuralIndex({ tournamentRecord, drawDefinition, event });
        if (index.unsupported) {
          const hydrated =
            allDrawMatchUps({ tournamentRecord, drawDefinition, event, inContext: true, nextMatchUps: true })
              .matchUps ?? [];
          matchUps.push(...hydrated.map((matchUp) => ({ ...matchUp, tournamentId, eventId })));
          continue;
        }
        // a structure's stage and stage sequence, a round robin group's being its container's
        const stages = new Map<string, { stage?: string; stageSequence?: number }>();
        for (const structure of drawDefinition.structures ?? []) {
          const { stage, stageSequence } = structure;
          stages.set(structure.structureId, { stage, stageSequence });
          for (const group of structuresOf(structure) ?? []) stages.set(group.structureId, { stage, stageSequence });
        }
        for (const matchUp of index.matchUps)
          matchUps.push({ ...stages.get(matchUp.structureId), ...matchUp, tournamentId, eventId } as HydratedMatchUp);
      }
    }
  }
  return getMatchUpDependencies({ tournamentRecords, matchUps, drawIds, coversAllDraws: true });
}
