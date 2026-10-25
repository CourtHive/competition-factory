import { SET, NOAD, CONSECUTIVE, TRADITIONAL } from '@Constants/matchUpFormatConstants';
import { stringifyCombinedPointFormat } from './combinedPointFormat';
import { isObject } from '@Tools/objects';

export function stringify(matchUpFormatObject, preserveRedundant?: boolean) {
  if (!isObject(matchUpFormatObject)) return undefined;
  if ((matchUpFormatObject?.bestOf || matchUpFormatObject?.exactly) && matchUpFormatObject?.setFormat) {
    return getSetFormat(matchUpFormatObject, preserveRedundant);
  }
  return undefined;
}

function getNumber(formatstring) {
  return !Number.isNaN(Number(formatstring)) && Number(formatstring);
}

function timedSetFormat(matchUpFormatObject) {
  let value = `T${matchUpFormatObject.minutes}`;

  // Add scoring method suffix (P only, omit G since it's default)
  if (matchUpFormatObject.based === 'P') {
    value += 'P';
  }
  // Games-based ('G' or undefined) is default, no suffix needed

  // Add set-level tiebreak if present
  if (matchUpFormatObject.tiebreakFormat?.tiebreakTo) {
    value += `/TB${matchUpFormatObject.tiebreakFormat.tiebreakTo}`;
  }

  // Legacy modifier support (for formats with @); never a modifier `parse` refuses
  if (matchUpFormatObject.modifier) {
    if (!isModifierName(matchUpFormatObject.modifier)) return undefined;
    value += `@${matchUpFormatObject.modifier}`;
  }

  return value;
}

function stringifyGameFormat(gameFormat) {
  const deuceSuffix = gameFormat?.deuceAfter ? `${gameFormat.deuceAfter}D` : '';

  if (gameFormat?.type === TRADITIONAL) return `TN${deuceSuffix}`;
  if (gameFormat?.type === CONSECUTIVE && Number.isInteger(gameFormat.count))
    return `${gameFormat.count}C${deuceSuffix}`;

  return undefined;
}

function getSetFormat(matchUpFormatObject, preserveRedundant?: boolean) {
  if (matchUpFormatObject.finalSetFormat?.combinedPointTotal) return undefined;
  if (
    matchUpFormatObject.setFormat?.combinedPointTotal &&
    (matchUpFormatObject.bestOf !== 1 ||
      matchUpFormatObject.exactly ||
      matchUpFormatObject.aggregate ||
      matchUpFormatObject.matchMods?.length ||
      matchUpFormatObject.finalSetFormat ||
      matchUpFormatObject.gameFormat ||
      matchUpFormatObject.matchUpConstraint ||
      (matchUpFormatObject.matchRoot && matchUpFormatObject.matchRoot !== SET))
  )
    return undefined;
  const bestOfValue = getNumber(matchUpFormatObject.bestOf) || undefined;
  const exactly = getNumber(matchUpFormatObject.exactly) || undefined;
  const setLimit = bestOfValue || exactly;

  if (matchUpFormatObject.setFormat?.timed && matchUpFormatObject.simplified && setLimit === 1) {
    return timedSetFormat(matchUpFormatObject.setFormat);
  }

  const root = matchUpFormatObject.matchRoot || SET;
  // Special case: both bestOf: 1 and exactly: 1 stringify as 'SET1' (no X suffix)
  const exactlySuffix = exactly && exactly !== 1 ? 'X' : '';
  const aggregateSuffix = matchUpFormatObject.aggregate ? 'A' : '';
  // match-level modifiers `parse` keeps but does not interpret are written back, so nothing is lost
  const matchModsSuffix = Array.isArray(matchUpFormatObject.matchMods) ? matchUpFormatObject.matchMods.join('') : '';
  const setLimitCode = (setLimit && `${root}${setLimit}${exactlySuffix}${aggregateSuffix}${matchModsSuffix}`) || '';
  const setCountValue = stringifySet(matchUpFormatObject.setFormat, preserveRedundant);
  const setCode = (setCountValue && `S:${setCountValue}`) || '';
  const finalSetCountValue = stringifySet(matchUpFormatObject.finalSetFormat, preserveRedundant);

  const finalSetCode =
    (setLimit &&
      setLimit > 1 &&
      finalSetCountValue &&
      setCountValue !== finalSetCountValue && // don't include final set code if equivalent to other sets
      `F:${finalSetCountValue}`) ||
    '';

  const gameFormatValue = matchUpFormatObject.gameFormat && stringifyGameFormat(matchUpFormatObject.gameFormat);
  // a game format it cannot write is not written as `G:undefined` (validator debate G8)
  if (matchUpFormatObject.gameFormat && !gameFormatValue) return undefined;
  // the default traditional game is not written (CA 2026-10-25): `-G:TN` is an equivalent spelling of no `-G:`
  const gameCode = gameFormatValue && gameFormatValue !== 'TN' ? `G:${gameFormatValue}` : '';

  const matchUpConstraintCode = matchUpFormatObject.matchUpConstraint?.timed
    ? `M:T${matchUpFormatObject.matchUpConstraint.minutes}`
    : '';

  const valid = setLimitCode && setCountValue;

  if (valid) {
    return [setLimitCode, setCode, gameCode, finalSetCode, matchUpConstraintCode].filter(Boolean).join('-');
  }
  return undefined;
}

function stringifySet(setObject, preserveRedundant) {
  if (typeof setObject === 'object' && Object.keys(setObject).length) {
    if (setObject.combinedPointTotal) return stringifyCombinedPointFormat(setObject);
    if (setObject.timed) return timedSetFormat(setObject);
    if (setObject.outs) return `O${setObject.outs}`;
    if (setObject.tiebreakSet) return tiebreakFormat(setObject.tiebreakSet);
    const setToValue = getNumber(setObject.setTo);
    if (setToValue) {
      const NoAD = (setObject.NoAD && NOAD) || '';
      const winByValue = getNumber(setObject.winBy);
      const setTiebreakValue = tiebreakFormat(setObject.tiebreakFormat);
      const setTiebreakCode = (setTiebreakValue && `/${setTiebreakValue}`) || '';
      // WB modifier is only meaningful when there is no tiebreak; emit when winBy
      // differs from the no-tiebreak default of 2. Works for both explicit
      // `noTiebreak: true` shapes and shapes that simply omit `tiebreakFormat`.
      const winByCode = winByValue && winByValue !== 2 && !setTiebreakValue ? `WB${winByValue}` : '';
      const tiebreakAtValue = getNumber(setObject.tiebreakAt);
      const tiebreakAtCode =
        (tiebreakAtValue && (tiebreakAtValue !== setToValue || preserveRedundant) && `@${tiebreakAtValue}`) || '';
      if (setTiebreakValue !== false) {
        return `${setToValue}${NoAD}${winByCode}${setTiebreakCode}${tiebreakAtCode}`;
      }
    }
  }
  return undefined;
}

function tiebreakFormat(tieobject) {
  if (tieobject) {
    if (typeof tieobject === 'object' && !tieobject.tiebreakTo) {
      return '';
    } else if (typeof tieobject === 'object' && getNumber(tieobject.tiebreakTo)) {
      let value = `TB${tieobject.tiebreakTo}${tieobject.NoAD ? NOAD : ''}`;
      if (tieobject.modifier && !isModifierName(tieobject.modifier)) return false;
      if (tieobject.modifier) value += `@${tieobject.modifier}`;
      return value;
    } else {
      return false;
    }
  }
  return undefined;
}

/** A modifier `parse` reads: upper-case letters, not containing `NOAD` (CA 2026-10-25). */
function isModifierName(modifier: unknown): boolean {
  return typeof modifier === 'string' && /^[A-Z]+$/.test(modifier) && !modifier.includes(NOAD);
}
