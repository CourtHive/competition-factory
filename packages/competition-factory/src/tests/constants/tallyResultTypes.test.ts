import { expectTypeOf, it } from 'vitest';

// constants and types
import type { TallyResult } from '@Types/tournamentTypes';

it('types drawn match counts and standings points as optional numbers, never the index-signature any', () => {
  expectTypeOf<TallyResult['matchUpsDrawn']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<TallyResult['standingsPoints']>().toEqualTypeOf<number | undefined>();
});
