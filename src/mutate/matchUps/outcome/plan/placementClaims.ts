import type { HydratedMatchUp } from '@Types/hydrated';

/** A participant holds a seat only at the claimed draw position. */
export function holdsPosition(
  matchUp: HydratedMatchUp | undefined,
  participantId?: string,
  position?: number,
): boolean {
  return (
    !!participantId &&
    !!position &&
    !!matchUp?.sides?.some((side) => side.participantId === participantId && side.drawPosition === position)
  );
}

export function hasSourceOrigin(matchUps: HydratedMatchUp[], sourceId: string): boolean {
  return matchUps.some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some((origin) => origin?.sourceMatchUpId === sourceId),
  );
}
