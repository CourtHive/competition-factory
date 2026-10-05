import { compareRoutes, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import { compareCorrection } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import {
  projectFields,
  projectFieldsOf,
  diffFields,
  exercised,
} from '@Tests/testHarness/exitPropagation/fieldProjections';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * G14: EACH FIELD PROJECTION, AND ITS WIRING INTO BOTH ORACLES, REPORTS A PLANTED DIVERGENCE.
 *
 * The deep correction oracle and the route differential read zero for entries, seedAssignments,
 * extensions and lineUp on their first run (2026-10-05). A zero from an instrument nobody has seen
 * fire is not a measurement, so each projection is shown to see a real engine write into its field,
 * and each oracle is shown to report a write planted on ONE of the two draws it compares.
 *
 * The wiring is field-agnostic (both oracles diff every field `projectFields` returns), so it is
 * planted through two fields with engine writes that work on the oracles' own unseeded draws:
 * an entry position and a drawDefinition extension. A seed assignment is planted the same way.
 * lineUp cannot be planted there — those draws are not TEAM — and is proven at the projection.
 */

const drawId = 'g14';

const generateTeam = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: SINGLE_ELIMINATION, drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 1405,
    setState: true,
  });
};

const eventOf = (id: string) => tournamentEngine.getEvent({ drawId: id }).event;
const firstStructureId = (id: string) =>
  tournamentEngine.getEvent({ drawId: id }).drawDefinition.structures[0].structureId;
const firstEntrant = (id: string) => eventOf(id).entries[0].participantId;

// engine writes, one field each — the same writes a director's client can make
const PLANTS: Record<string, (id: string) => any> = {
  entries: (id) =>
    tournamentEngine.setEntryPosition({
      eventId: eventOf(id).eventId,
      participantId: firstEntrant(id),
      entryPosition: 99,
    }),
  extensions: (id) =>
    tournamentEngine.addDrawDefinitionExtension({ drawId: id, extension: { name: 'g14Plant', value: { planted: 1 } } }),
  seedAssignments: (id) =>
    tournamentEngine.modifySeedAssignment({
      structureId: firstStructureId(id),
      participantId: firstEntrant(id),
      seedValue: '1',
      drawId: id,
    }),
};

describe('each projection sees an engine write into its own field, and only there', () => {
  it.each(Object.keys(PLANTS))('%s', (field) => {
    generateTeam();
    const before = projectFields(drawId);
    expect(PLANTS[field](drawId).success).toEqual(true);
    const divergences = diffFields(before, projectFields(drawId));
    expect(divergences.length).toBeGreaterThan(0);
    expect([...new Set(divergences.map((divergence) => divergence.field))]).toEqual([field]);
  });

  it('lineUp', () => {
    generateTeam();
    // a generated TEAM draw holds no lineUp until the first assignment writes one onto the side
    const before = projectFields(drawId);
    expect(exercised(before).lineUp).toEqual(false);

    const teamMatchUp = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((matchUp: any) => matchUp.matchUpType === TEAM && matchUp.roundNumber === 1);
    const tieMatchUp = teamMatchUp.tieMatchUps[0];
    const side = teamMatchUp.sides[0];
    const assigned = new Set(
      (tieMatchUp.sides ?? []).flatMap((tieSide: any) =>
        (tieSide.participant?.individualParticipantIds ?? [tieSide.participant?.participantId]).filter(Boolean),
      ),
    );
    const team = tournamentEngine.getParticipants({ participantFilters: { participantIds: [side.participantId] } })
      .participants[0];
    const spare = team.individualParticipantIds.find((participantId: string) => !assigned.has(participantId));
    expect(spare).toBeDefined();

    const result: any = tournamentEngine.assignTieMatchUpParticipantId({
      tieMatchUpId: tieMatchUp.matchUpId,
      participantId: spare,
      drawId,
    });
    expect(result.success).toEqual(true);
    const after = projectFields(drawId);
    expect(exercised(after).lineUp).toEqual(true);
    const divergences = diffFields(before, after);
    expect(divergences.length).toBeGreaterThan(0);
    expect([...new Set(divergences.map((divergence) => divergence.field))]).toEqual(['lineUp']);
  });
});

describe('the projection is stable where it must be', () => {
  it('two generations of one seed project identically, though their matchUpIds differ', () => {
    const matchUpIds = () =>
      tournamentEngine
        .getEvent({ drawId })
        .drawDefinition.structures[0].matchUps.map((matchUp: any) => matchUp.matchUpId);
    generateTeam();
    const first = projectFields(drawId);
    const firstIds = new Set(matchUpIds());
    generateTeam();
    // the control: the ids really are regenerated (measured: eventId and structureId are not)
    expect(matchUpIds().some((matchUpId: string) => firstIds.has(matchUpId))).toEqual(false);
    expect(diffFields(first, projectFields(drawId))).toEqual([]);
  });

  it('a generated id inside a value is renamed, and a timestamp is ignored', () => {
    generateTeam();
    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const matchUp = drawDefinition.structures[0].matchUps[0];
    const withId = structuredClone(drawDefinition);
    withId.extensions = [{ name: 'refersTo', value: { matchUpId: matchUp.matchUpId, createdAt: 'now' } }];
    const withOtherStamp = structuredClone(withId);
    withOtherStamp.extensions[0].value.createdAt = 'later';

    const projected = projectFieldsOf({ event, drawDefinition: withId });
    expect(projected.extensions['draw|refersTo']).toEqual(
      JSON.stringify({ matchUpId: `M:${drawDefinition.structures[0].structureName}|1|1` }),
    );
    expect(diffFields(projected, projectFieldsOf({ event, drawDefinition: withOtherStamp }))).toEqual([]);
  });
});

describe('both oracles report a divergence planted on one of the two draws they compare', () => {
  const ROUTE = { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, seed: 7001, drawId: 'g14-route' };

  const routes = (plant?: { route: 'A' | 'B'; apply: (id: string) => void }) => {
    generateDraw(ROUTE.drawType, ROUTE.drawId, ROUTE.drawSize, ROUTE.seed);
    const playOrder = playForward(ROUTE.drawId);
    return compareRoutes({ ...ROUTE, playOrder, index: 0, plant }).differences;
  };

  it('the route differential: no plant, no difference (the control)', () => {
    expect(routes()).toEqual([]);
  });

  it.each(
    Object.keys(PLANTS).flatMap((field) => [
      [field, 'A'],
      [field, 'B'],
    ]),
  )('the route differential sees %s planted on route %s', (field, route) => {
    const differences = routes({ route: route as 'A' | 'B', apply: (id) => PLANTS[field](id) });
    expect(differences?.length).toBeGreaterThan(0);
    expect(differences?.every((difference) => difference.startsWith(`F:${field}:`))).toEqual(true);
  });

  const CONFIG = { drawType: SINGLE_ELIMINATION, drawSize: 8, participantsCount: 8, seed: 7002 };

  it('the correction oracle: no plant, no difference (the control)', () => {
    const { divergences, fieldDivergences } = compareCorrection({ config: CONFIG, direct: [], corrected: [] });
    expect(divergences).toEqual([]);
    expect(fieldDivergences).toEqual([]);
  });

  it.each(
    Object.keys(PLANTS).flatMap((field) => [
      [field, 'direct'],
      [field, 'corrected'],
    ]),
  )('the correction oracle sees %s planted on the %s path', (field, path) => {
    const { divergences, fieldDivergences } = compareCorrection({
      plant: { path: path as 'direct' | 'corrected', apply: (id) => PLANTS[field](id) },
      config: CONFIG,
      corrected: [],
      direct: [],
    });
    // the signature cannot see it — that is the gap — and the field comparison must
    expect(divergences).toEqual([]);
    expect(fieldDivergences.length).toBeGreaterThan(0);
    expect(fieldDivergences.every((divergence) => divergence.field === field)).toEqual(true);
  });
});
