import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { ErrorType, SHARED_INDIVIDUAL_PARTICIPANT } from '@Constants/errorConditionConstants';
import { NOT_ON_TEAM_ROSTER, TEAM } from '@Constants/participantConstants';
import type { ResultWarning } from '@Types/factoryTypes';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { LINEUPS } from '@Constants/extensionConstants';

/** individualId -> the teams of an event it belongs to: by roster (entered, not withdrawn) or by a draw's lineUp */
export type TeamMemberships = Map<string, Set<string>>;

/**
 * One player, one team, per event (CA 2026-10-29): an individual on one team's roster, or in one team's lineUp
 * in any of the event's draws, may not appear in another team's lineUp in the same event.
 *
 * Rosters are read from the event's TEAM entries other than WITHDRAWN. Event entries may overlap (they are a
 * pool; the draw is the committed field, which `addDrawEntries` already guards), so the lineUp is where
 * the rule is enforced, by every method that writes one.
 */
export function getTeamMemberships({
  tournamentRecord,
  event,
}: {
  tournamentRecord?: Tournament;
  event?: Event;
}): TeamMemberships {
  const memberships: TeamMemberships = new Map();
  const add = (individualId: string, teamId: string) => {
    if (!memberships.has(individualId)) memberships.set(individualId, new Set());
    memberships.get(individualId)?.add(teamId);
  };

  const enteredTeamIds = new Set(
    (event?.entries ?? [])
      .filter(({ entryStatus }) => entryStatus !== WITHDRAWN)
      .map(({ participantId }) => participantId),
  );
  for (const participant of tournamentRecord?.participants ?? []) {
    if (participant.participantType !== TEAM || !enteredTeamIds.has(participant.participantId)) continue;
    for (const individualId of participant.individualParticipantIds ?? []) add(individualId, participant.participantId);
  }

  for (const drawDefinition of event?.drawDefinitions ?? []) {
    const lineUps = drawLineUps(drawDefinition);
    for (const [teamId, lineUp] of Object.entries(lineUps)) {
      for (const { participantId } of lineUp ?? []) add(participantId, teamId);
    }
  }

  return memberships;
}

function drawLineUps(drawDefinition: DrawDefinition): Record<string, { participantId: string }[] | undefined> {
  return firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
}

/**
 * The verdict for placing `individualIds` in `teamParticipantId`'s lineUp: refused when any belongs to another
 * team of the event; allowed with a NOT_ON_TEAM_ROSTER warning when any belongs to no team at all.
 */
export function checkTeamMembership({
  teamParticipantId,
  individualIds,
  memberships,
}: {
  teamParticipantId?: string;
  memberships: TeamMemberships;
  individualIds: string[];
}): { error?: ErrorType; context?: { participantId: string; teamParticipantId: string }; warnings?: ResultWarning[] } {
  // no team to place them in, so no team to compare with
  if (!teamParticipantId) return {};

  const notOnRoster: string[] = [];
  for (const individualId of individualIds) {
    const teams = memberships.get(individualId);
    const otherTeamId = [...(teams ?? [])].find((teamId) => teamId !== teamParticipantId);
    if (otherTeamId) {
      return {
        error: SHARED_INDIVIDUAL_PARTICIPANT,
        context: { participantId: individualId, teamParticipantId: otherTeamId },
      };
    }
    if (!teams?.size) notOnRoster.push(individualId);
  }
  return notOnRoster.length ? { warnings: [{ code: NOT_ON_TEAM_ROSTER, info: { participantIds: notOnRoster } }] } : {};
}
