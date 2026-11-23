export const logColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  brightred: '\x1b[91m',
  green: '\x1b[32m',
  brightgreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightyellow: '\x1b[93m',
  blue: '\x1b[34m',
  brightblue: '\x1b[94m',
  lightblue: '\x1b[105m',
  magenta: '\x1b[35m',
  brightmagenta: '\x1b[95m',
  cyan: '\x1b[36m',
  brightcyan: '\x1b[96m',
  white: '\x1b[37m',
  brightwhite: '\x1b[97m',
};

export const rgbColors = {
  gold: [255, 215, 0],
  pink: [233, 36, 116],
  lime: [0, 255, 0],
  orange: [255, 140, 0],
  springGreen: [0, 255, 127],
  tomato: [255, 99, 71],
};

export const rgbToHex = (rgb) =>
  rgb.reduce((accum, colorVal) => {
    accum += colorVal.toString(16);
    return accum;
  }, '');
