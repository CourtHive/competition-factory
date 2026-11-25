"""Bind newly admitted stock-replay occurrences to the sealed per-step histories."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('mentat', 'before', 'after', 'histories', 'output'):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.mentat / 'assessment/2026-11-24-bye-passage-effects/qualification'))
    from readiness import native_keys
    manifest = (args.after / 'raw/bound.json').read_bytes()
    digest = sha256(manifest).hexdigest()
    if digest != 'f96bea64dd175000d5f03f1ee6f070dca81b195b04f3467c9e63322607bcc8ad':
        raise ValueError('Wrong sealed cohort')
    rows = json.loads(manifest)
    sets = []
    for root in [args.before, args.after]:
        report = json.loads((root / 'raw-routing.json').read_bytes())
        if (report['mismatchCounts'] or report['effectsTransform'] or report['providerObserverTaps']
                or report['customProviderOverride'] or report['plannerOverlay'] or report['sealedBindingSha256'] != digest):
            raise ValueError('Expected passing original observer with stock configuration')
        sets.append(native_keys(root / 'raw', report['arm'], rows))
    before, after = sets
    if before - after:
        raise ValueError('Lost an earlier admission')
    groups = defaultdict(list)
    for line in (args.histories / 'bindings.jsonl').read_bytes().splitlines():
        hist = json.loads(line)
        groups[hist['site'], hist['preProjection']].append(hist['historyKey'])
    if Counter({k: len(v) for k, v in groups.items()}) != Counter((r['site'], r['pre']) for r in rows):
        raise ValueError('Incomplete history binding')
    for group in groups.values():
        group.sort(reverse=True)
    admitted = []
    for row in sorted(rows, key=lambda r: r['key']):
        hist = groups[row['site'], row['pre']].pop()
        if row['key'] in after - before:
            admitted.append(dict(site=row['site'], exactKey=row['key'], historyKey=hist))
    if len(admitted) < 100 or len({r['historyKey'] for r in admitted}) != len(admitted):
        raise ValueError('Fewer than 100 distinct additional bound histories')
    with args.output.open('x') as stream:
        for row in admitted:
            stream.write(json.dumps(row) + '\n')


if __name__ == '__main__':
    main()
