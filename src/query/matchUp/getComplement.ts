import { ensureInt } from '@Tools/ensureInt';

type SetComplementArgs = {
  lowValue?: string | number;
  tiebreakAt?: number;
  isSide1?: boolean;
  NoAD?: boolean;
  setTo: number;
  winBy?: number;
};

export const getSetComplement = (params: SetComplementArgs): number[] | false => {
  const { isSide1, lowValue, setTo, tiebreakAt, NoAD, winBy } = params;
  if (lowValue === undefined) return false;
  let valueAsNumber = ensureInt(lowValue);

  // Not necessary?
  if (valueAsNumber?.toString().length > 2) {
    valueAsNumber = Number.parseInt(valueAsNumber.toString().slice(0, 2));
  }

  if (tiebreakAt && tiebreakAt < setTo && valueAsNumber > tiebreakAt) {
    valueAsNumber = tiebreakAt;
  }

  let calculatedValue;
  // WB1 on a no-tiebreak set: first side to setTo wins; complement is always setTo
  // (e.g. TYPTI WB1 → 0–5, 4–5).
  if (!tiebreakAt && winBy === 1) {
    calculatedValue = setTo;
  } else if (NoAD && !tiebreakAt) {
    if (valueAsNumber > setTo) {
      calculatedValue = setTo;
    } else {
      calculatedValue = valueAsNumber < setTo ? setTo : setTo - 1;
    }
  } else {
    calculatedValue =
      (valueAsNumber + 1 < setTo && setTo) ||
      (tiebreakAt && tiebreakAt < setTo && valueAsNumber === tiebreakAt && setTo) ||
      (!tiebreakAt && valueAsNumber + 2) ||
      setTo + 1;
  }

  const side1Result = isSide1 ? valueAsNumber : calculatedValue;
  const side2Result = isSide1 ? calculatedValue : valueAsNumber;

  return [side1Result, side2Result];
};

type TiebreakComplementArgs = {
  lowValue?: number | string;
  tiebreakNoAd?: boolean;
  tiebreakTo: number;
  isSide1?: boolean;
};

export const getTiebreakComplement = (params: TiebreakComplementArgs): number[] | false => {
  const { isSide1, lowValue, tiebreakTo, tiebreakNoAd } = params;
  if (lowValue === undefined) return false;
  let valueAsNumber = typeof lowValue === 'string' ? Number.parseInt(lowValue) : lowValue;

  // Not necessary?
  // do not accept low values greater than two digits;
  if (valueAsNumber?.toString().length > 2) {
    valueAsNumber = Number.parseInt(valueAsNumber.toString().slice(0, 2));
  }

  // If NOAD low lowValue cannot be greater than tiebreakTo - 1
  if (tiebreakNoAd && valueAsNumber > tiebreakTo - 1) {
    valueAsNumber = tiebreakTo - 1;
  }

  const highValue = getHighTiebreakValue({
    lowValue: valueAsNumber,
    NoAD: tiebreakNoAd,
    tiebreakTo,
  });
  const side1Result = isSide1 ? valueAsNumber : highValue;
  const side2Result = isSide1 ? highValue : valueAsNumber;
  return [side1Result, side2Result];
};

type HighTiebreakValueArgs = {
  tiebreakTo: number;
  lowValue: number;
  NoAD?: boolean;
};

function getHighTiebreakValue(params: HighTiebreakValueArgs): number {
  const { lowValue, NoAD, tiebreakTo } = params;
  const winBy = NoAD ? 1 : 2;
  if (lowValue + 1 >= tiebreakTo) {
    return lowValue + winBy;
  }
  return tiebreakTo;
}
