import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { afterEach, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock();
});

it.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])(
  'a subscribed repeated %s writes and announces nothing in every mode',
  (status) => {
    for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      setClock('2026-10-01T12:00:00.000Z');
      setSubscriptions({ subscriptions: {} });
      mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], nonRandom: 4000, setState: true });
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const source = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1)!;
      const notices: unknown[] = [];
      setSubscriptions({ subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: (payloads) => notices.push(...payloads) } });
      const params = { drawId: source.drawId, matchUpId: source.matchUpId, outcome: { matchUpStatus: status } };
      expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
      // The real first write proves this subscriber is live; the satisfied repeat must not announce it again.
      expect(notices.length).toBeGreaterThan(0);
      notices.length = 0;
      deleteNotices();
      const before = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
      setOutcomePipeline(mode);
      expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
      expect(canonicalJson(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
      expect(notices).toEqual([]);
    }
  },
);
