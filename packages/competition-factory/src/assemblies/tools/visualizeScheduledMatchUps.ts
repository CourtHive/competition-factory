import { printGlobalLog, purgeGlobalLog, pushGlobalLog } from '@Functions/global/globalLog';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { extractTime } from '@Tools/dateTime';

import type { HydratedMatchUp } from '@Types/hydrated';

type VisualizeScheduledMatchUpsArgs = { scheduledMatchUps: HydratedMatchUp[]; showGlobalLog?: boolean };

/** Writes the scheduled matchUps, by structure and round, to the global log; prints it when `showGlobalLog`. */
export function visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog }: VisualizeScheduledMatchUpsArgs) {
  purgeGlobalLog();
  const structureIds = scheduledMatchUps?.reduce(
    (structureIds, { structureId }) =>
      structureIds.includes(structureId) ? structureIds : structureIds.concat(structureId),
    [] as string[],
  );

  const structureNames = Array.isArray(structureIds) && {
    ...structureIds.map((structureId) => {
      const { structureName, matchUpType } = scheduledMatchUps.find((matchUp) => matchUp.structureId === structureId)!;
      return {
        [structureId]: `${structureName} ${matchUpType}`,
      };
    }),
  };

  structureIds?.forEach((structureId) => {
    pushGlobalLog(
      {
        color: 'blue',
        method: 'draw',
        structure: structureNames[structureId],
        keyColors: {
          structure: 'magenta',
        },
      },
      true,
    );
    const structureMatchUps = scheduledMatchUps.filter((matchUp) => matchUp.structureId === structureId);
    const roundMatchUps =
      getRoundMatchUps({
        matchUps: structureMatchUps,
      })?.roundMatchUps ?? [];
    Object.keys(roundMatchUps).forEach((roundNumber) => {
      pushGlobalLog(
        {
          roundNumber,
          keyColors: {
            roundNumber: 'brightcyan',
          },
        },
        true,
      );
      roundMatchUps[roundNumber].forEach(({ matchUpId, schedule }) => {
        const scheduledTime = extractTime(schedule.scheduledTime);
        pushGlobalLog(
          {
            matchUpId,
            time: scheduledTime,
            date: schedule.scheduledDate,
            venue: schedule.venueId,
            keyColors: {
              time: 'brightcyan',
              date: 'brightcyan',
              matchUpId: 'yellow',
              venue: 'magenta',
            },
          },
          true,
        );
      });
    });
  });

  if (showGlobalLog) printGlobalLog();
}
