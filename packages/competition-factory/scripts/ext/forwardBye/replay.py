"""Compare two committed Factory checkouts under a single Button worker reservation."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
PROVIDERS = ('mirror', 'sync', 'custom', 'async', 'async-engine', 'custom-eager')
MODES = ('v2', 'differential')


def packed(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def run_arm(checkout, arm, inputs, output):
    git = ['git', '-C', checkout]
    head = subprocess.check_output([*git, 'rev-parse', 'HEAD'], text=True).strip()
    if subprocess.check_output([*git, 'status', '--porcelain']).strip():
        raise ValueError(f'Dirty checkout {checkout}')
    pkg = checkout / 'packages/competition-factory'
    spec = pkg / 'src/tests/testHarness/sealedForwardByeProvider.test.js'
    with spec.open('xb') as handle:
        handle.write((HERE / 'providerReplay.mjs').read_bytes())
    try:
        for mode in MODES:
            dest = output / arm / mode
            dest.mkdir(parents=True)
            env = dict(os.environ, TZ='UTC', FACTORY_MATRIX_TIER='full', OUTCOME_PIPELINE='v2',
                       BYE_HEAD=arm, BYE_INPUTS=str(inputs), BYE_OUTPUT=str(dest), R27_MODE=mode)
            with (dest / 'vitest.log').open('w') as log:
                subprocess.run(['node_modules/.bin/vitest', 'run', '--maxWorkers=1', str(spec.relative_to(pkg))],
                               cwd=pkg, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    finally:
        spec.unlink()
    return head


def summarize(inputs, output, heads):
    rows = json.loads((inputs / 'bound.json').read_bytes())
    assert len(rows) == 122 and len({r['key'] for r in rows}) == 122
    counts = {}
    ledger = []
    for mode in MODES:
        for provider in PROVIDERS:
            totals = Counter()
            topic_orders = Counter()
            for row in rows:
                pair = []
                for arm in ('recorded', 'native'):
                    file = output / arm / mode / f"{arm}-{provider}-{row['key']}.json.gz"
                    observed = json.loads(gzip.decompress(file.read_bytes()))
                    assert (observed['key'], observed['input'], observed['head'], observed['kind']) == (
                        row['key'], row['sha'], arm, provider)
                    pair.append(observed)
                left, right = pair
                fields = left.keys() - {'head', 'writer', 'recorder', 'nested'}
                assert fields == right.keys() - {'head', 'writer', 'recorder', 'nested'}
                mismatches = [name for name in fields if left[name] != right[name]]
                if mismatches:
                    raise ValueError(f"{mode}/{provider}/{row['key']}: {mismatches}")
                positive = row['disposition'] == 'pass'
                totals['pairs'] += 1
                totals['positive' if positive else 'negative'] += 1
                calls = left['calls']
                for arm, item in zip(('recorded', 'native'), pair):
                    for metric in ('writer', 'recorder', 'nested'):
                        totals[f"{'positive' if positive else 'negative'}-{arm}-{metric}"] += item[metric]
                if positive:
                    totals['positive-provider-entries'] += len(calls)
                    totals['positive-draft-notices'] += sum(e['name'] == 'addNotice' and e['draft'] for e in calls)
                    totals['positive-live-notices'] += sum(e['name'] == 'addNotice' and not e['draft'] for e in calls)
                    topics = left['final'][2] if left['enclosed'] else [
                        e['value'] for e in calls if e['name'] == 'cycleModifiedTopics'][-1]
                    topic_orders[('enclosed' if left['enclosed'] else 'public', tuple(topics))] += 1
                # One trace represents both arms after exact field equality has been verified.
                # Keep method, phase, notice keys, and ordered topic returns in the shareable ledger.
                # The digest includes all immediate values, payloads and terminal alias observations.
                if provider in ('async-engine', 'custom') and mode == 'v2':
                    ledger.append(dict(key=row['key'], positive=positive, provider=provider,
                        boundary='enclosed' if left['enclosed'] else 'public',
                        armDigests=[sha(packed({k: item[k] for k in fields})) for item in pair],
                        callbacks=[[e['name'], e['draft'], *([e['topic'], e.get('key'), e['joint']] if e['name']=='addNotice'
                                   else [e['value']] if e['name']=='cycleModifiedTopics' else [])] for e in calls],
                        entryDigests=[sha(packed(e)) for e in calls], final=left['final']))
            assert totals['positive'] == 106 and totals['negative'] == 16
            if mode == 'v2':
                assert totals['positive-draft-notices'] == 830 and totals['positive-live-notices'] == 574
                for name in ('writer', 'recorder'):
                    assert totals[f'positive-recorded-{name}'] == 106
                    assert totals[f'positive-native-{name}'] == 0
                    assert totals[f'negative-native-{name}'] == 16
            counts[f'{mode}/{provider}'] = dict(totals=dict(totals), topicOrders=[
                dict(boundary=b, topics=list(s), count=n) for (b, s), n in sorted(topic_orders.items())])
    report = dict(heads=heads, sealedManifest=sha((inputs/'bound.json').read_bytes()),
                  probe=sha((HERE/'providerReplay.mjs').read_bytes()), counts=counts)
    raw = b''.join(packed(r) + b'\n' for r in ledger)
    report['ledgerSha256'] = sha(raw)
    (output/'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    (output/'ordered-callbacks.jsonl.gz').write_bytes(gzip.compress(raw, mtime=0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('base', 'candidate', 'inputs', 'output'):
        parser.add_argument(name, type=lambda value: Path(value).resolve())
    args = parser.parse_args()
    os.umask(0o077)
    args.output.mkdir(exist_ok=False, parents=True)
    heads = {arm: run_arm(tree, arm, args.inputs, args.output)
             for arm, tree in [('recorded', args.base), ('native', args.candidate)]}
    summarize(args.inputs, args.output, heads)


if __name__ == '__main__':
    main()
