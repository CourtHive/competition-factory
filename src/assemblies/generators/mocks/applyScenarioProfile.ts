import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { scheduleProfileGrid } from '@Mutate/matchUps/schedule/scheduleProfileGrid';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Anchors a generated schedule to a moment, so an example stays demonstrable whenever it is run.
 *
 * `mocksEngine` places matchUps from the venue's opening time — 08:00, say. `startDate: today` makes
 * the DATE current and leaves the CLOCK fixed, so a tournament generated at 16:00 has every matchUp
 * hours in the past and the surfaces that read the wall clock (a "now" strip, due-match calls,
 * running-late badges, recovery countdowns) have nothing live to act on. That is not a scheduling
 * bug; it is the absence of any way to say "relative to when this is generated".
 *
 * `minutesBeforeAnchor` places the FIRST scheduled matchUp that far before the anchor, and every
 * other matchUp keeps its spacing. The spacing is the part worth preserving — it comes from the
 * scheduler honouring matchUp average and recovery minutes — so this shifts the whole schedule
 * rigidly rather than re-deriving it.
 *
 * `anchor: 'NOW'` reads the clock at call time. Pass an ISO datetime instead for a deterministic
 * result; tests should, and the e2e convention of seeding `nonRandom: 1` exists for the same reason.
 *
 * Reading the clock is not a purity violation: the factory already defaults `startDate` to today.
 * What it must not do is reach the network, and this does not.
 */

type ScenarioProfile = {
  minutesBeforeAnchor?: number;
  assignCourts?: boolean;
  anchor?: string;
};

type ApplyScenarioProfileArgs = {
  scenarioProfile: ScenarioProfile;
  tournamentRecord: Tournament;
};

/** `YYYY-MM-DDTHH:MM` — the form `validTimeValue` accepts that carries a date as well as a time.
 * A space separator is REJECTED there, so this must use `T`. Measured, not assumed. */
function isoMinute(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** The instant a matchUp is scheduled for, from its own date + time rather than today's. */
function scheduledInstant(matchUp: any): Date | undefined {
  const { scheduledDate, scheduledTime } = matchUp?.schedule ?? {};
  if (!scheduledTime) return undefined;
  const time = scheduledTime.includes('T') ? scheduledTime.split('T')[1] : scheduledTime;
  const [h, m] = String(time).split(':');
  if (h === undefined || m === undefined) return undefined;
  const datePart = scheduledDate ? String(scheduledDate).split('T')[0] : undefined;
  if (!datePart) return undefined;
  const [y, mo, d] = datePart.split('-').map(Number);
  const instant = new Date(y, (mo ?? 1) - 1, d ?? 1, Number(h), Number(m));
  return isNaN(instant.getTime()) ? undefined : instant;
}

export function applyScenarioProfile({ tournamentRecord, scenarioProfile }: ApplyScenarioProfileArgs) {
  if (typeof scenarioProfile !== 'object' || scenarioProfile === null) return { error: INVALID_VALUES };

  const { anchor = 'NOW', minutesBeforeAnchor = 0, assignCourts } = scenarioProfile;

  if (typeof minutesBeforeAnchor !== 'number' || !isFinite(minutesBeforeAnchor)) return { error: INVALID_VALUES };

  const anchorDate = anchor === 'NOW' ? new Date() : new Date(anchor);
  if (isNaN(anchorDate.getTime())) return { error: INVALID_VALUES };

  // Courts first: the grid reads the schedule to order courts, and the shift below rewrites only
  // scheduledTime, leaving courtId/courtOrder untouched. Doing it the other way round would order
  // courts against times that are about to move.
  if (assignCourts) {
    const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
    const scheduleDates = [
      ...new Set(
        (allTournamentMatchUps({ tournamentRecord }).matchUps ?? [])
          .map((m: any) => m.schedule?.scheduledDate)
          .filter(Boolean)
          .map((d: any) => String(d).split('T')[0]),
      ),
    ];
    if (scheduleDates.length) scheduleProfileGrid({ tournamentRecords, scheduleDates } as any);
  }

  const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];
  const scheduled = matchUps
    .map((matchUp: any) => ({ matchUp, instant: scheduledInstant(matchUp) }))
    .filter((entry): entry is { matchUp: any; instant: Date } => !!entry.instant);

  // Nothing to anchor is a legitimate outcome, not an error: a caller may have generated without a
  // schedulingProfile. Say so in the result rather than silently succeeding at nothing.
  if (!scheduled.length) return { ...SUCCESS, shiftedCount: 0, anchoredTo: anchorDate.toISOString() };

  const earliest = Math.min(...scheduled.map((entry) => entry.instant.getTime()));
  const target = anchorDate.getTime() - minutesBeforeAnchor * 60_000;
  const deltaMs = target - earliest;

  const drawMap: Record<string, any> = {};
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) drawMap[drawDefinition.drawId] = drawDefinition;
  }

  let shiftedCount = 0;
  for (const { matchUp, instant } of scheduled) {
    const drawDefinition = drawMap[matchUp.drawId];
    if (!drawDefinition) continue;
    const result = addMatchUpScheduledTime({
      scheduledTime: isoMinute(new Date(instant.getTime() + deltaMs)),
      matchUpId: matchUp.matchUpId,
      disableNotice: true,
      tournamentRecord,
      drawDefinition,
    });
    if (!result?.error) shiftedCount += 1;
  }

  return {
    ...SUCCESS,
    anchoredTo: anchorDate.toISOString(),
    shiftMinutes: Math.round(deltaMs / 60_000),
    shiftedCount,
  };
}
