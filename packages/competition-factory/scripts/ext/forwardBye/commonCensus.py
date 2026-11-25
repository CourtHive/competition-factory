"""Prepare or execute identical pre/post-D workloads with the original #6549 census."""
import argparse
from contextlib import ExitStack
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys

PACKAGE = Path('packages/competition-factory')
ADDED = 'src/tests/mutations/outcome/byePassageParity.test.ts'
INJECT = {
    'scripts/ext/outcomeCensus.config.mts': 'outcomeCensus.config.mts',
    'src/tests/testHarness/outcomeExternalCensus.ts': 'outcomeExternalCensus.ts',
}


def git(wt, *args):
    return subprocess.check_output(['git', '-C', wt, *args], text=True).strip()


def inventory(wt):
    prefix = PACKAGE.as_posix() + '/'
    return sorted(name[len(prefix):] for name in git(wt, 'ls-tree', '-r', '--name-only', 'HEAD', '--', PACKAGE / 'src').splitlines()
                  if '/scratch/' not in name and re.search(r'\.test\.(?:[mc]?[jt]s|[jt]sx)$', name))


def checksum(data):
    return sha256(data).hexdigest()


def prepare(args):
    heads = {}
    for arm, wt in [('before', args.before), ('after', args.after)]:
        if subprocess.run(['git', '-C', wt, 'symbolic-ref', '-q', 'HEAD'], capture_output=True).returncode != 1 or git(wt, 'status', '--porcelain'):
            raise ValueError(f'{arm} needs a clean detached checkout')
        heads[arm] = dict(head=git(wt, 'rev-parse', 'HEAD'), tree=git(wt, 'rev-parse', 'HEAD^{tree}'))
    common = inventory(args.before)
    if inventory(args.after) != sorted(common + [ADDED]):
        raise ValueError('Expected the common test inventory plus the single new BYE control')
    source = args.mentat / 'assessment/v3-2/qualification'
    instruments = {name: checksum((source / name).read_bytes()) for name in INJECT.values()}
    return common, dict(revisions=heads, instrument=instruments, files=len(common),
                        commonFilesSha256=checksum(('\n'.join(common) + '\n').encode()))


def run(wt, out, tests, args, meta):
    out.mkdir()
    pkg = wt / PACKAGE
    (out / 'common-tests.txt').write_text('\n'.join(tests) + '\n')
    (out / 'revisions').write_text(meta['head'] + '\n' + meta['tree'] + '\n')
    env = dict(os.environ, TZ='UTC', FACTORY_MATRIX_TIER='full', OUTCOME_PIPELINE='v2',
               NO_COLOR='1', SITES=str(out / 'sites.jsonl'), OUTCOME_EXTERNAL_CENSUS_JSONL=str(out / 'census.jsonl'))
    for name in ('QUERY_PURITY', 'FACTORY_BACKEND', 'OUTCOME_EXTERNAL_COVERAGE_JSONL', 'NOTICE_PAYLOAD_WRITE_CHECK'):
        env.pop(name, None)
    cfg = next(iter(INJECT))
    from datetime import datetime, timezone
    with ExitStack() as cleanup:
        for target, name in INJECT.items():
            dest = pkg / target
            with dest.open('xb') as handle:
                cleanup.callback(dest.unlink)
                handle.write((args.mentat / 'assessment/v3-2/qualification' / name).read_bytes())
        (out / 'start').write_text(datetime.now(timezone.utc).isoformat() + '\n')
        with (out / 'suite.log').open('x') as log:
            rc = subprocess.run(['node_modules/.bin/vitest', 'run', '--no-color', '--reporter=default',
                                 '--config', cfg, f'--maxWorkers={args.workers}', *tests],
                                cwd=pkg, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
        (out / 'end').write_text(datetime.now(timezone.utc).isoformat() + '\n')
        (out / 'exit-code').write_text(f'{rc}\n')
        if rc:
            raise RuntimeError(f'Vitest exited {rc} in {out}')
    log = (out / 'suite.log').read_text()
    seen = re.findall(r'^\s*[^\w\s]+\s+\|(?:isolated|shared)\| (src/\S+?) \(\d+ tests?\b', log, re.M)
    if sorted(seen) != tests:
        raise ValueError(f'Executed tests differ from frozen inventory in {out}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'run'))
    for param in ('before', 'after', 'mentat', 'output'):
        parser.add_argument(param, type=lambda v: Path(v).resolve())
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--admitted', type=lambda v: Path(v).resolve())
    args = parser.parse_args()
    common, manifest = prepare(args)
    if args.action == 'prepare':
        print(json.dumps(manifest, indent=2))
        return
    if args.workers < 1 or not args.admitted:
        parser.error('run requires --admitted with bound stock replay admissions and a positive worker count')
    os.umask(0o077)
    args.output.mkdir(parents=True)
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for arm, wt in [('before', args.before), ('after', args.after)]:
        run(wt, args.output / arm, common, args, manifest['revisions'][arm])
    sys.path.insert(0, str(args.mentat / 'assessment/2026-11-24-bye-passage-effects/qualification'))
    from finish import summary
    before, after = (summary(args.output / arm) for arm in ('before', 'after'))
    if any(before[k] != after[k] for k in ('Tests', 'Test Files')):
        raise ValueError('The suite populations differ')
    cmd = [sys.executable, '-B', args.mentat / 'assessment/2026-11-24-bye-passage-effects/qualification/census.py',
           args.output / 'after', args.after, '--previous', args.output / 'before', '--admitted', args.admitted]
    report = json.loads(subprocess.check_output(cmd))
    (args.output / 'movement.json').write_text(json.dumps(dict(report, beforeSuite=before, afterSuite=after), indent=2) + '\n')


if __name__ == '__main__':
    main()
