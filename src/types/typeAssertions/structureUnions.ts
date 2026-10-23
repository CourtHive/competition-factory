/**
 * Compile-time assertions for the `Structure` and `DrawLink` unions, checked by `pnpm check-types`.
 *
 * They live here rather than in a test file because tsconfig.json excludes `*.test.ts` from tsc: an
 * assertion in a test file runs under vitest, which strips types, and is never checked at all.
 * This module is type-only and imported by nothing, so it adds nothing to the bundle.
 */
import type {
  ContainerStructure,
  DrawLinkTarget,
  ItemStructure,
  Structure,
  DrawLink,
  MatchUp,
} from '@Types/tournamentTypes';

type Assignable<A, B> = [A] extends [B] ? true : false;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectNot<T extends false> = T;

type Target = DrawLinkTarget;

export type StructureUnionAssertions = [
  // an ITEM as stored: most records carry no structureType at all
  Expect<Assignable<{ structureId: string; matchUps: MatchUp[] }, Structure>>,
  Expect<Assignable<{ structureId: string; structureType: 'ITEM'; matchUps: MatchUp[] }, Structure>>,
  Expect<Assignable<{ structureId: string; structureType: 'CONTAINER'; structures: Structure[] }, Structure>>,

  // a CONTAINER names its structures and holds no matchUps; an ITEM holds no structures
  ExpectNot<Assignable<{ structureId: string; structureType: 'CONTAINER' }, Structure>>,
  ExpectNot<
    Assignable<
      { structureId: string; structureType: 'CONTAINER'; structures: Structure[]; matchUps: MatchUp[] },
      Structure
    >
  >,
  ExpectNot<Assignable<{ structureId: string; matchUps: MatchUp[]; structures: Structure[] }, Structure>>,

  // the soft form: reading either side's fields on an un-narrowed Structure still compiles
  Expect<Equals<Structure['matchUps'], MatchUp[] | undefined>>,
  Expect<Equals<Structure['structures'], Structure[] | undefined>>,

  // narrowing on structureType reaches each variant
  Expect<Equals<Extract<Structure, { structureType: 'CONTAINER' }>, ContainerStructure>>,
  Expect<Equals<Exclude<Structure, { structureType: 'CONTAINER' }>, ItemStructure>>,
];

export type DrawLinkUnionAssertions = [
  Expect<
    Assignable<{ linkType: 'LOSER'; source: { structureId: string; roundNumber: number }; target: Target }, DrawLink>
  >,
  Expect<
    Assignable<{ linkType: 'WINNER'; source: { structureId: string; roundNumber: number }; target: Target }, DrawLink>
  >,
  Expect<
    Assignable<
      { linkType: 'POSITION'; source: { structureId: string; finishingPositions: number[] }; target: Target },
      DrawLink
    >
  >,

  // a link out of a round robin names finishing positions, labelled POSITION or WINNER (CA, 2026-10-23); a round on
  // it is allowed and decides nothing (the factory writes the groups' final round on a qualifying POSITION link)
  Expect<
    Assignable<
      { linkType: 'WINNER'; source: { structureId: string; finishingPositions: number[] }; target: Target },
      DrawLink
    >
  >,
  Expect<
    Assignable<
      {
        linkType: 'WINNER';
        source: { structureId: string; roundNumber: number; finishingPositions: number[] };
        target: Target;
      },
      DrawLink
    >
  >,
  Expect<
    Assignable<
      {
        linkType: 'POSITION';
        source: { structureId: string; roundNumber: number; finishingPositions: number[] };
        target: Target;
      },
      DrawLink
    >
  >,

  // a round link names its round: a LOSER link names neither a round nor finishing positions it could carry
  ExpectNot<Assignable<{ linkType: 'LOSER'; source: { structureId: string }; target: Target }, DrawLink>>,
  ExpectNot<
    Assignable<
      { linkType: 'LOSER'; source: { structureId: string; finishingPositions: number[] }; target: Target },
      DrawLink
    >
  >,
  // a POSITION link names finishing positions
  ExpectNot<
    Assignable<{ linkType: 'POSITION'; source: { structureId: string; roundNumber: number }; target: Target }, DrawLink>
  >,
];
