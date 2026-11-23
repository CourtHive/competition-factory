import { POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE';
import { POLICY_ROUND_ROBIN_TALLY_FIBA } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_FIBA';
import { validateTallyPolicy } from '@Validators/validateTallyPolicy';
import { runCase, type CorpusResult } from './standingsFixtures';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * Standings presets written from rulebooks verified at source (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 7, S6).
 */

describe.each([
  ['USTA League', POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE],
  ['FIBA', POLICY_ROUND_ROBIN_TALLY_FIBA],
])('%s preset', (_name, preset) => {
  it('passes save validation and names its source', () => {
    const tallyPolicy = preset[POLICY_TYPE_ROUND_ROBIN_TALLY];
    let result: any = validateTallyPolicy({ tallyPolicy });
    expect(result.error).toBeUndefined();
    expect(tallyPolicy.policyName).toMatch(/20\d\d/);
  });
});

describe('FIBA Appendix D', () => {
  /**
   * A D.2.4-style case. A beats everyone 32-20. B, C, D each won one game among themselves: B beat C 34-30, C beat D
   * 32-28, D beat B 30-26. All three have 4 classification points (a win and two losses); their mini-league is 3 each,
   * and their points difference in it is 0 each, so points scored in it decides: C 62, B 60, D 58.
   */
  const results: CorpusResult[] = [
    { sides: ['A', 'B'], sets: [[32, 20]], winningSide: 1 },
    { sides: ['A', 'C'], sets: [[32, 20]], winningSide: 1 },
    { sides: ['A', 'D'], sets: [[32, 20]], winningSide: 1 },
    { sides: ['B', 'C'], sets: [[34, 30]], winningSide: 1 },
    { sides: ['C', 'D'], sets: [[32, 28]], winningSide: 1 },
    { sides: ['D', 'B'], sets: [[30, 26]], winningSide: 1 },
  ];

  it('separates three level teams by points scored in the games between them', () => {
    let result: any = runCase({
      policyDefinitions: POLICY_ROUND_ROBIN_TALLY_FIBA,
      format: 'SET1-S:P32',
      orderField: 'groupOrder',
      description: '',
      clauses: [],
      rows: {},
      id: '',
      results,
    });
    expect(result.error).toBeUndefined();
    const { participantResults } = result;
    expect(['A', 'B', 'C', 'D'].map((id) => participantResults[id].classificationPoints)).toEqual([6, 4, 4, 4]);
    expect(['A', 'C', 'B', 'D'].map((id) => participantResults[id].groupOrder)).toEqual([1, 2, 3, 4]);
  });
});

describe('USTA League championship', () => {
  it('orders a TEAM round robin by lines won, and the seeded lot resolves every place', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, eventType: TEAM_EVENT, tieFormatName: 'DOMINANT_DUO' }],
      policyDefinitions: POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE,
      completeAllMatchUps: true,
      setState: false,
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const tallies = drawDefinition.structures[0].structures[0].positionAssignments.map(({ tally }) => tally);
    const ordered = [...tallies].sort((a, b) => a.groupOrder - b.groupOrder);
    expect(ordered.map(({ groupOrder }) => groupOrder)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].tieMatchUpsWon).toBeLessThanOrEqual(ordered[i - 1].tieMatchUpsWon);
    }
  });
});
