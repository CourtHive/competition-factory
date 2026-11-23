import { getTargetElement } from './getTargetElement';
import { isConvertableInteger } from '@Tools/math';

type GetAwardPointsArgs = {
  participantWon?: boolean;
  flightNumber?: number;
  drawSize: number;
  valueObj: any;
  flights?: any;
  level?: number;
};
export function getAwardPoints({
  participantWon,
  flightNumber,
  valueObj,
  drawSize,
  flights,
  level,
}: GetAwardPointsArgs) {
  const getFlightValue = (flightNumber, targetElement) => {
    if (!flightNumber) return;
    if (Array.isArray(targetElement)) {
      const arrayMember = targetElement.find((m) => m.flight === flightNumber || m.f === flightNumber);
      return arrayMember.value || arrayMember.v;
    }
    if (typeof targetElement === 'object') {
      const flights = targetElement.flights || targetElement.f;
      if (Array.isArray(flights)) return flights[flightNumber - 1];
    }
  };

  const getValue = (obj, flightNumber) => {
    const objectValue = obj?.value || obj?.v || (isConvertableInteger(obj) ? obj : 0);
    const targetElement = getTargetElement(level, obj?.level);
    const flightValue = getFlightValue(flightNumber, targetElement);
    const value = flightValue || (isConvertableInteger(targetElement) && targetElement) || objectValue;
    return { value };
  };

  let awardPoints = 0;
  let requireWin;
  let s, t, d;

  const winAccessor = (participantWon && 'won') || (participantWon === false && 'lost') || undefined;

  if (Array.isArray(valueObj)) {
    let sizeDefined = valueObj.find((obj) => obj.drawSize === drawSize || obj.drawSizes?.includes(drawSize));

    // threshold attribute allows a definition for e.g. drawSize: 16 to apply to all LARGER drawSizes
    let thresholdMatched = valueObj.find((obj) => obj.drawSize && obj.threshold && drawSize > obj.drawSize);
    // a default definition can be provided which has no drawSize or drawSizes
    let defaultDef = valueObj.find((obj) => !obj.drawSize && !obj.drawSizes?.length);

    if (winAccessor !== undefined) {
      sizeDefined = sizeDefined?.[winAccessor];
      thresholdMatched = thresholdMatched?.[winAccessor];
      defaultDef = defaultDef?.[winAccessor];
    }
    s = getValue(sizeDefined, flightNumber).value;
    t = getValue(thresholdMatched, flightNumber).value;
    d = getValue(defaultDef, flightNumber).value;
    awardPoints = s || t || d;

    requireWin = (s && sizeDefined.requireWin) || (t && thresholdMatched.requireWin) || defaultDef?.requireWin;
  } else if (typeof valueObj === 'object') {
    let sizeDefined = valueObj?.drawSizes?.[drawSize];
    let defaultDef = valueObj;
    if (winAccessor !== undefined) {
      sizeDefined = sizeDefined?.[winAccessor];
      defaultDef = defaultDef?.[winAccessor];
    }
    s = getValue(sizeDefined, flightNumber).value;
    d = getValue(defaultDef, flightNumber).value;
    awardPoints = s || d;

    requireWin = s ? sizeDefined.requireWin : defaultDef?.requireWin;
  } else if (isConvertableInteger(valueObj) && winAccessor === undefined) {
    // when using participantWon non-objects are not valid
    awardPoints = valueObj;
  }

  if (flightNumber && flights?.pct?.[flightNumber]) {
    awardPoints = Math.round(awardPoints * flights.pct[flightNumber]);
  }

  return { awardPoints, requireWin };
}
