import { askInvoke } from './askInvoke';

import { engineStart } from '@Assemblies/engines/parts/engineStart';
import { FactoryEngine } from '@Types/factoryTypes';

export const askEngine = (() => {
  const engine: FactoryEngine = {
    execute: (args: any) => askInvoke(engine, args),
  };

  engineStart(engine, askInvoke);

  return engine;
})();

export default askEngine;
