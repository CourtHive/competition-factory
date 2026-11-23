import * as queryGovernor from '@Assemblies/governors/queryGovernor';
import ask from '@Assemblies/engines/ask';

ask.importMethods(queryGovernor, true, 1);

export const queryEngine = ask;
export default ask;
