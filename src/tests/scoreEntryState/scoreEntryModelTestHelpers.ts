/**
 * Shared by the score-entry model tests. Pure helpers only; no assertions live here.
 */
import { createScoreEntryModel, setCell } from '../../scoreEntryState';

import type { CellRef, ScoreEntryModel, CreateScoreEntryModelParams } from '../../scoreEntryState';
import type { SideNumber } from '../../scoreEntryState';

/** A games cell. */
export const G = (setIndex: number, side: SideNumber): CellRef => ({ setIndex, side, kind: 'games' });
/** A tiebreak cell. */
export const TB = (setIndex: number, side: SideNumber): CellRef => ({ setIndex, side, kind: 'tiebreak' });

/** Write both principal cells of one set, as an operator who typed both would leave it. */
export function enter(model: ScoreEntryModel, setIndex: number, side1?: number, side2?: number): ScoreEntryModel {
  let next = model;
  if (side1 !== undefined) next = setCell(next, G(setIndex, 1), side1);
  if (side2 !== undefined) next = setCell(next, G(setIndex, 2), side2);
  return next;
}

/** A model with whole sets typed in order, e.g. `typed('SET3-S:6/TB7', [6, 4], [3, 6])`. */
export function typed(matchUpFormat: string, ...sets: Array<[number?, number?]>): ScoreEntryModel {
  let model = frozen({ matchUpFormat });
  for (const [index, [side1, side2]] of sets.entries()) model = enter(model, index, side1, side2);
  return model;
}

/**
 * A model that cannot be mutated. Every test builds its input this way so that a transition which
 * writes into its argument throws rather than passing by accident — the "no mutation" rule proved by
 * the runtime, not by reading the code.
 */
export function frozen(params: CreateScoreEntryModelParams = {}): ScoreEntryModel {
  return deepFreeze(createScoreEntryModel(params));
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value as object)) deepFreeze(member);
  }
  return value;
}
