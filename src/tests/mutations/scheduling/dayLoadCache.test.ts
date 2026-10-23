import { getParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  getDayLoad,
  getParticipantDayLoads,
  modifyParticipantDayMatchUps,
} from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';

// constants and types
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { TOTAL } from '@Constants/scheduleConstants';

// The day-load cache (SCHEDULING_PIPELINE_VNEXT.md § 7.0) must give exactly the loads getDayLoad gives for the same
// matchUps: for every participant, with and without every candidate matchUp, as the day is built up and taken down.
// Each candidate is asked twice, so the second answer comes from the per-candidate memo; the memo outliving a change to
// the day would show as a stale answer on the next pass.
// checkDailyLimits skips the computation when `counters` + 1 is within every limit; that rests on the two facts asserted
// here too: `counters` is current, and one matchUp adds at most one to a load.

function reference(profile: any, reachability: any, addingMatchUp?: any) {
  const dayMatchUps = addingMatchUp
    ? [...profile.dayMatchUps.filter(({ matchUpId }) => matchUpId !== addingMatchUp.matchUpId), addingMatchUp]
    : profile.dayMatchUps;
  const types = [...new Set(dayMatchUps.map(({ matchUpType }) => matchUpType).filter(Boolean))] as string[];
  const loads: Record<string, number> = { [TOTAL]: getDayLoad({ reachability, dayMatchUps }) };
  for (const matchUpType of types) loads[matchUpType] = getDayLoad({ reachability, dayMatchUps, matchUpType });
  return loads;
}

it('the cached day loads equal getDayLoad, as matchUps are added and removed', () => {
  // two draws over the same participants, one with a consolation: chains, exclusive paths and several draws at once
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP }, { drawSize: 16 }],
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  const dependencies = getMatchUpDependencies({ includeParticipantDependencies: true, tournamentRecords });
  const { matchUpDependencies } = dependencies;
  const matchUps = dependencies.matchUps ?? [];
  const reachability = getParticipantReachability({ matchUpDependencies, matchUps });
  const profiles: any = {};
  const dayMatchUp = (matchUp: any) => ({
    matchUpType: matchUp.matchUpType,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    certain: false,
  });
  const participantIds = tournamentRecord.participants.map(({ participantId }) => participantId);

  let compared = 0;
  const compareAll = () => {
    for (const participantId of participantIds) {
      const profile = profiles[participantId];
      if (!profile) continue;
      for (const [index, candidate] of [undefined, ...matchUps.slice(0, 12)].entries()) {
        // alternately certain and potential, so both ways an added matchUp counts are compared
        const adding = candidate && { ...dayMatchUp(candidate), certain: index % 2 === 0 };
        const cached = getParticipantDayLoads({
          individualParticipantProfiles: profiles,
          addingMatchUp: adding,
          participantId,
          reachability,
        });
        const expected = reference(profile, reachability, adding);
        expect(cached).toEqual(expected);
        // asked again, the memoized answer: still the same, and (on the next pass, after the day changed) never stale
        const again = getParticipantDayLoads({
          individualParticipantProfiles: profiles,
          addingMatchUp: adding,
          participantId,
          reachability,
        });
        expect(again).toEqual(expected);
        // what checkDailyLimits relies on to skip the computation: `counters` is the load without the candidate, and
        // adding one matchUp raises any load by at most one
        const without = reference(profile, reachability);
        expect(profile.counters).toEqual(without);
        for (const [counterName, load] of Object.entries(expected))
          expect(load).toBeLessThanOrEqual((without[counterName] ?? 0) + 1);
        compared += 1;
      }
    }
  };

  // build the day up round by round, comparing after each addition, then take some of it down again
  const ordered = matchUps.toSorted((a: any, b: any) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
  for (const matchUp of ordered.slice(0, 30)) {
    modifyParticipantDayMatchUps({ individualParticipantProfiles: profiles, reachability, matchUp, value: 1 });
    compareAll();
  }
  for (const matchUp of ordered.slice(0, 10)) {
    modifyParticipantDayMatchUps({ individualParticipantProfiles: profiles, reachability, matchUp, value: -1 });
    compareAll();
  }
  // the comparison ran, many times, over participants who had a day
  expect(compared).toBeGreaterThan(5_000);
});
