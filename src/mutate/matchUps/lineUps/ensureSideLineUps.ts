import { modifyMatchUpNotice } from '../../notifications/drawNotifications';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { findExtension } from '@Acquire/findExtension';

import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type EnsureSideLineUpsArgs = {
  inContextDualMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  tournamentId?: string;
  dualMatchUp?: MatchUp;
  eventId?: string;
};
export function ensureSideLineUps({
  inContextDualMatchUp,
  drawDefinition,
  tournamentId,
  dualMatchUp,
  eventId,
}: EnsureSideLineUpsArgs) {
  if (dualMatchUp) {
    if (!inContextDualMatchUp) {
      inContextDualMatchUp = findDrawMatchUp({
        matchUpId: dualMatchUp.matchUpId,
        inContext: true,
        drawDefinition,
      })?.matchUp;
    }

    const { extension } = findExtension({
      element: drawDefinition,
      name: LINEUPS,
    });

    const lineUps = makeDeepCopy(extension?.value ?? {}, false, true);

    const extractSideDetail = ({ displaySideNumber, drawPosition, sideNumber }) => ({
      drawPosition,
      sideNumber,
      displaySideNumber,
    });

    dualMatchUp.sides = inContextDualMatchUp?.sides?.map((contextSide: any) => {
      const participantId = contextSide.participantId;
      const referenceLineUp = (participantId && lineUps[participantId]) || undefined;
      const { lineUp: noContextLineUp, ...noContextSideDetail } =
        dualMatchUp.sides?.find(({ sideNumber }) => sideNumber === contextSide.sideNumber) ?? {};
      const lineUp = noContextLineUp?.length ? noContextLineUp : referenceLineUp;
      return {
        ...extractSideDetail(contextSide),
        ...noContextSideDetail,
        lineUp,
      };
    });

    modifyMatchUpNotice({
      context: 'ensureSidLineUps',
      matchUp: dualMatchUp,
      drawDefinition,
      tournamentId,
      eventId,
    });
  }
}
