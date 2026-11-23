import { getEntryProfileQualifiersCount } from '@Helpers/entries/getEntryProfileQualifiers';
import { getQualifyingEntriesCount } from '@Helpers/entries/getQualifyingEntryPlan';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { isAny } from '@Validators/isAny';

// types
import type { MockDrawProfile } from '@Types/mocksTypes';

/**
 * The MAIN places a mock drawProfile holds for qualifiers: its own `qualifyingPositions` when stated, else the
 * final-stage `qualifyingPositions` of its `qualifyingProfiles` (as the generated draw reserves them).
 */
export function getDrawProfileQualifyingPositions(drawProfile?: MockDrawProfile): number {
  if (drawProfile?.qualifyingPositions !== undefined) return drawProfile.qualifyingPositions || 0;
  return getEntryProfileQualifiersCount({ qualifyingProfiles: drawProfile?.qualifyingProfiles });
}

export function getStageParticipantsCount({
  useExistingParticipants = false,
  uniqueParticipants: eventUniqueParticipants = false,
  drawProfiles,
  category,
  gender,
}: {
  useExistingParticipants?: boolean;
  /** the event generates its own participants for every draw (see generateEventWithFlights) */
  uniqueParticipants?: boolean;
  drawProfiles?: MockDrawProfile[];
  category?: unknown;
  gender?: string;
}) {
  const uniqueParticipantsCount: Record<string, number> = {};
  const addUnique = (stage: string, count: number) => {
    if (!Object.keys(uniqueParticipantsCount).includes(stage)) uniqueParticipantsCount[stage] = 0;
    uniqueParticipantsCount[stage] += count;
  };

  const stageParticipantsCount = (drawProfiles ?? []).reduce<Record<string, number>>(
    (stageParticipantsCount, drawProfile) => {
      const { participantsCount = 0, uniqueParticipants, stage = MAIN, drawSize = 0 } = drawProfile ?? {};
      const qualifyingPositions = getDrawProfileQualifyingPositions(drawProfile);

      if (!Object.keys(stageParticipantsCount).includes(stage)) stageParticipantsCount[stage] = 0;

      const stageCount = (participantsCount || drawSize) - qualifyingPositions;
      // When the caller passed pre-built participants to generateTournamentRecord,
      // the pool already exists in tournamentRecord.participants. Skipping the
      // "unique stage" branch keeps the synthesis path (generateEventParticipants)
      // inert; filterConsideredParticipants still applies gender / eventType /
      // participantType filters on the supplied pool.
      // `gender: ANY` is "no gender constraint" — see getParticipantsCount.ts.
      const requiresUniqueParticipants =
        !useExistingParticipants &&
        (eventUniqueParticipants ||
          uniqueParticipants ||
          (gender && !isAny(gender)) ||
          category ||
          stage === QUALIFYING);

      if (requiresUniqueParticipants) {
        addUnique(stage, stageCount);
      } else {
        stageParticipantsCount[stage] = Math.max(stageParticipantsCount[stage], stageCount);
      }

      // the QUALIFYING entries of the drawProfile's own qualifying structures are, like a QUALIFYING stage, unique
      const qualifyingEntriesCount = getQualifyingEntriesCount(drawProfile?.qualifyingProfiles);
      if (qualifyingEntriesCount) {
        if (useExistingParticipants) {
          // drawn from the supplied pool, as the draws of one event share it
          stageParticipantsCount[QUALIFYING] = Math.max(
            stageParticipantsCount[QUALIFYING] ?? 0,
            qualifyingEntriesCount,
          );
        } else {
          addUnique(QUALIFYING, qualifyingEntriesCount);
        }
      }
      return stageParticipantsCount;
    },
    {},
  );

  // stageParticipantsCount is what each stage draws from the tournament pool: the unique participants an event
  // generates are not drawn from it. Folding them in made the pool's QUALIFYING slice, which getStageParticipants
  // takes first, swallow participants a pool-drawn MAIN needed.
  const uniqueParticipantStages = Object.keys(uniqueParticipantsCount);

  return {
    stageParticipantsCount,
    uniqueParticipantsCount,
    uniqueParticipantStages,
  };
}
