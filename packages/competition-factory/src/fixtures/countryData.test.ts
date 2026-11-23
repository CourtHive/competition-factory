import { countries, flagIOC } from './countryData';
import { expect, it } from 'vitest';

it('can convert ioc to iso and iso to flag characters', () => {
  const iocs = countries.map(({ ioc }) => ioc).filter(Boolean);
  iocs.forEach((ioc) => {
    expect(flagIOC(ioc)).not.toBeUndefined();
  });
});
