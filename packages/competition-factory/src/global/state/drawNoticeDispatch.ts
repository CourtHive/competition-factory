import type { Notice } from './globalState';

type DrawEffects = { addNotice: (notice: Notice) => unknown };
let drawEffects: DrawEffects | undefined;

// Draw writers keep their ordinary effects object. Change its function only when a diagnostic is selected.
export function bindDrawEffects(effects: DrawEffects) {
  drawEffects = effects;
}

export function selectDrawNoticeDispatch(addNotice: DrawEffects['addNotice']) {
  if (drawEffects) drawEffects.addNotice = addNotice;
}
