import { generateRoundRobinPairings } from '@Generators/drawDefinitions/drawTypes/adHoc/roundRobinPairing/generateRoundRobinPairings';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const ids = (count: number) => Array.from({ length: count }, (_, i) => `P-${i + 1}`);

function pairingHashes(rounds: string[][][]) {
  return rounds.flatMap((round) => round.map((pairing) => [...pairing].sort((a, b) => a.localeCompare(b)).join('|')));
}

describe('generateRoundRobinPairings', () => {
  it('pairs every entrant with every other entrant exactly once', () => {
    const participantIds = ids(8);
    let result: any = generateRoundRobinPairings({ participantIds });

    expect(result.error).toBeUndefined();
    expect(result.rounds.length).toEqual(7);
    expect(result.rounds.every((round) => round.length === 4)).toEqual(true);

    const hashes = pairingHashes(result.rounds);
    expect(hashes.length).toEqual(28); // C(8,2)
    expect(new Set(hashes).size).toEqual(28);
  });

  it('sits one entrant out each round when the count is odd', () => {
    const participantIds = ids(5);
    let result: any = generateRoundRobinPairings({ participantIds });

    expect(result.error).toBeUndefined();
    expect(result.rounds.length).toEqual(4 * 1 + 1); // (n - 1) rounds
    expect(result.rounds.every((round) => round.length === 2)).toEqual(true);

    const hashes = pairingHashes(result.rounds);
    expect(hashes.length).toEqual(10); // C(5,2)
    expect(new Set(hashes).size).toEqual(10);
  });

  it('repeats the schedule for each encounter', () => {
    const participantIds = ids(4);
    let result: any = generateRoundRobinPairings({ participantIds, encounters: 3 });

    expect(result.error).toBeUndefined();
    expect(result.rounds.length).toEqual(9); // (4 - 1) * 3

    const hashes = pairingHashes(result.rounds);
    expect(hashes.length).toEqual(18);
    // every meeting occurs exactly three times
    const counts = new Map<string, number>();
    for (const hash of hashes) counts.set(hash, (counts.get(hash) ?? 0) + 1);
    expect(new Set(counts.values())).toEqual(new Set([3]));
  });

  it('mirrors side order on the second encounter so a double round robin is home-and-home', () => {
    const participantIds = ids(4);
    let result: any = generateRoundRobinPairings({ participantIds, encounters: 2 });

    const firstCycle = result.rounds.slice(0, 3);
    const secondCycle = result.rounds.slice(3);

    expect(secondCycle).toEqual(firstCycle.map((round) => round.map((pairing) => [...pairing].reverse())));
  });

  it('preserves side order across encounters when mirrored is false', () => {
    const participantIds = ids(4);
    let result: any = generateRoundRobinPairings({ participantIds, encounters: 2, mirrored: false });

    expect(result.rounds.slice(3)).toEqual(result.rounds.slice(0, 3));
  });

  it('truncates to a partial round robin when roundsCount is supplied', () => {
    const participantIds = ids(8);
    let result: any = generateRoundRobinPairings({ participantIds, roundsCount: 3 });

    expect(result.error).toBeUndefined();
    expect(result.rounds.length).toEqual(3);

    const hashes = pairingHashes(result.rounds);
    expect(hashes.length).toEqual(12);
    expect(new Set(hashes).size).toEqual(12); // no repeats within a partial schedule
  });

  // the residual from the groupSize fix: an unsatisfiable request is reported, not quietly reduced
  it('reports an unsatisfiable roundsCount rather than generating what it can', () => {
    let result: any = generateRoundRobinPairings({ participantIds: ids(4), roundsCount: 4 });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.rounds).toBeUndefined();
  });

  it('accepts a roundsCount reachable only through additional encounters', () => {
    let result: any = generateRoundRobinPairings({ participantIds: ids(4), roundsCount: 4, encounters: 2 });
    expect(result.error).toBeUndefined();
    expect(result.rounds.length).toEqual(4);
  });

  it('rejects invalid arguments', () => {
    expect(generateRoundRobinPairings({ participantIds: ids(1) }).error).toEqual(INVALID_VALUES);
    expect(generateRoundRobinPairings({ participantIds: ids(4), encounters: 0 }).error).toEqual(INVALID_VALUES);
    expect(generateRoundRobinPairings({ participantIds: ids(4), roundsCount: 0 }).error).toEqual(INVALID_VALUES);
  });
});
