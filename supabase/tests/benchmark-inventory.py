"""Read-only local HTTP benchmark. Run after the explicit million-row seed."""
import base64
import concurrent.futures
import datetime
import functools
import json
import math
import os
import platform
import statistics
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = 'http://127.0.0.1:3006/inventory'
CONTAINER = 'supabase_db_keyloop-inventory-local'
SAMPLES = 20
WARMUPS = 2


def sql(query):
    return subprocess.check_output([
        'docker', 'exec', CONTAINER, 'psql', '-X', '-At', '-U', 'postgres',
        '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query,
    ], text=True).strip()


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)]


def key(row, name):
    if name == 'vehicle':
        return row['make'], row['model']
    if name == 'currentAction':
        return row['currentAction'] or ('Needs action' if row['aging'] else 'No action required')
    return row[name]


def compare(left, right, sort):
    for item in sort.split(','):
        name, direction = item.split(':')
        a, b = key(left, name), key(right, name)
        if a != b:
            return (1 if a > b else -1) * (1 if direction == 'asc' else -1)
    return (left['id'] > right['id']) - (left['id'] < right['id'])


def validate(body, params, path):
    if path == '/metadata':
        assert body['summary']['total'] == 1000000, 'Unexpected inventory count'
        return
    rows = body['vehicles']
    assert len(rows) == (0 if params.get('make') == 'No such make' else int(params.get('limit', 25)))
    assert len({r['id'] for r in rows}) == len(rows), 'Duplicate ID within page'
    sort = params.get('sort', 'daysInStock:desc')
    assert rows == sorted(rows, key=functools.cmp_to_key(lambda a, b: compare(a, b, sort))), 'Incorrect order'
    for row in rows:
        if params.get('make'):
            assert row['make'] == params['make']
        if params.get('model'):
            assert row['model'] == params['model']
        if params.get('age') == 'aging':
            assert row['daysInStock'] > 90 and row['aging']
        if params.get('action') == 'needsAction':
            assert row['currentAction'] is None and row['aging']
        elif params.get('action'):
            assert row['currentAction'] == params['action']


def request(case):
    name, params, path = case
    url = BASE + path + ('?' + urllib.parse.urlencode(params) if params else '')
    started = time.perf_counter()
    status, error, size, body = None, None, 0, None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + os.environ["INVENTORY_BENCHMARK_ACCESS_TOKEN"]}), timeout=10) as response:
            status = response.status
            payload = response.read()
            size = len(payload)
        body = json.loads(payload)
        validate(body, params, path)
    except (Exception, AssertionError) as failure:
        if isinstance(failure, urllib.error.HTTPError):
            status = failure.code
        error = type(failure).__name__ + ': ' + str(failure)
    return {
        'case': name, 'ms': round((time.perf_counter() - started) * 1000, 3),
        'status': status, 'bytes': size, 'error': error,
    }, body


def summarize(samples, elapsed=None):
    good = [r['ms'] for r in samples if r['error'] is None and r['status'] == 200]
    return {
        'requests': len(samples), 'successes': len(good), 'failures': len(samples) - len(good),
        'p50Ms': round(statistics.median(good), 2) if good else None,
        'p95Ms': round(percentile(good, .95), 2) if good else None,
        'maxMs': round(max(good), 2) if good else None,
        'meanBytes': round(statistics.mean(r['bytes'] for r in samples if not r['error'])) if good else None,
        **({'elapsedSeconds': round(elapsed, 3), 'completedRequestsPerSecond': round(len(samples) / elapsed, 2)} if elapsed else {}),
    }


def main():
    assert percentile([4, 1, 3, 2], .95) == 4
    assert percentile([4, 1, 3, 2], .5) == 2
    before = json.loads(sql("""SELECT jsonb_build_object('total',count(*),
      'originalHash',(SELECT md5(string_agg(to_jsonb(v)::text,'' ORDER BY id)) FROM public.vehicles v WHERE registration LIKE 'KL-DEMO-%'),
      'sizeBytes',pg_total_relation_size('public.vehicles')) FROM public.vehicles"""))
    assert before['total'] == 1000000
    report = {
        'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'baseUrl': BASE, 'databaseContainer': CONTAINER, 'before': before,
        'environment': {'platform': platform.platform(),
            'hardware': subprocess.check_output(['sysctl', '-n', 'hw.model', 'hw.ncpu', 'hw.memsize'], text=True).splitlines(),
            'docker': subprocess.check_output(['docker', 'info', '--format', '{{json .NCPU}} {{json .MemTotal}}'], text=True).strip(),
            'postgres': json.loads(sql("SELECT jsonb_build_object('version',current_setting('server_version'),'sharedBuffers',current_setting('shared_buffers'),'workMem',current_setting('work_mem'),'maxParallelWorkersPerGather',current_setting('max_parallel_workers_per_gather'))"))},
        'method': {'warmupsPerCase': WARMUPS, 'measuredPerCase': SAMPLES,
            'timeoutSeconds': 10, 'percentile': 'nearest rank; p50 median; successful validated HTTP responses only',
            'cache': 'warm/mixed shared cache; no OS/DB cache eviction',
            'client': 'Python stdlib urllib; new HTTP request per sample, no persistent client pool',
            'scope': 'HTTP client -> existing local Nest API -> PostgREST -> PostgreSQL; JSON body read/validated',
            'load': 'closed-loop 100 requests at each of concurrency 5 and 10; not a saturation/capacity test',
            'deepCursor': '75% boundary selected with SQL OFFSET during untimed setup; measured API uses only keyset cursor',
            'limits': 'Synthetic data, shared development machine, active local services; no cold-cache, browser paint or sustained traffic measurement'},
        'sequential': [], 'concurrent': [],
    }
    initial, first = request(('setup', {'limit': 25}, ''))
    assert initial['error'] is None and first['nextCursor'], initial
    next_params = {'limit': 25, 'after': first['nextCursor']}
    check, second = request(('setup-next', next_params, ''))
    assert not check['error'], check
    assert not ({r['id'] for r in first['vehicles']} & {r['id'] for r in second['vehicles']})
    boundary = json.loads(sql("SELECT jsonb_build_array(stocked_on,id) FROM public.vehicles ORDER BY stocked_on,id OFFSET 749999 LIMIT 1"))
    cursor = json.loads(base64.urlsafe_b64decode(first['nextCursor'] + '=' * (-len(first['nextCursor']) % 4)))
    cursor['values'] = boundary
    deep = base64.urlsafe_b64encode(json.dumps(cursor, separators=(',', ':')).encode()).decode().rstrip('=')
    cases = [
        ('oldest_first_25', {'limit': 25}, ''),
        ('oldest_next_page', next_params, ''),
        ('oldest_cursor_after_750000', {'limit': 25, 'after': deep}, ''),
        ('oldest_first_100', {'limit': 100}, ''),
        ('price_ascending', {'sort': 'pricePence:asc'}, ''),
        ('price_descending', {'sort': 'pricePence:desc'}, ''),
        ('vehicle_ascending', {'sort': 'vehicle:asc'}, ''),
        ('registration_ascending', {'sort': 'registration:asc'}, ''),
        ('action_ascending', {'sort': 'currentAction:asc'}, ''),
        ('toyota_aging_needs_action', {'make': 'Toyota', 'age': 'aging', 'action': 'needsAction'}, ''),
        ('combined_three_sorts', {'make': 'Toyota', 'model': 'Corolla', 'age': 'aging', 'action': 'needsAction', 'sort': 'daysInStock:desc,pricePence:asc,registration:desc'}, ''),
        ('saved_action_price', {'action': 'Price Reduction Planned', 'age': 'aging', 'sort': 'pricePence:asc'}, ''),
        ('empty_filter', {'make': 'No such make'}, ''),
        ('global_metadata', {}, '/metadata'),
    ]
    for case in cases:
        warmups = [request(case)[0] for _ in range(WARMUPS)]
        samples = [request(case)[0] for _ in range(SAMPLES)]
        entry = {'name': case[0], 'query': case[1], 'path': case[2], 'summary': summarize(samples), 'warmups': warmups, 'samples': samples}
        report['sequential'].append(entry)
        print(case[0], json.dumps(entry['summary']), flush=True)
    # Mix expensive summaries/sorts with indexed reads so the load reflects dashboard use.
    mix = [cases[i] for i in [0, 1, 2, 4, 5, 6, 8, 9, 10, 13]]
    for workers in (5, 10):
        work = [mix[i % len(mix)] for i in range(100)]
        started = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            samples = [value[0] for value in pool.map(request, work)]
        elapsed = time.perf_counter() - started
        entry = {'concurrency': workers, 'summary': summarize(samples, elapsed),
            'byCase': {case[0]: summarize([r for r in samples if r['case'] == case[0]]) for case in mix}, 'samples': samples}
        report['concurrent'].append(entry)
        print('concurrency', workers, json.dumps(entry['summary']), flush=True)
    report['after'] = json.loads(sql("""SELECT jsonb_build_object('total',count(*),
      'originalHash',(SELECT md5(string_agg(to_jsonb(v)::text,'' ORDER BY id)) FROM public.vehicles v WHERE registration LIKE 'KL-DEMO-%')) FROM public.vehicles"""))
    assert report['after']['total'] == before['total']
    assert report['after']['originalHash'] == before['originalHash'], 'Original demo records changed during run'
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output = ROOT / 'exports' / os.environ.get('INVENTORY_BENCHMARK_OUTPUT', 'inventory-benchmark-results.json')
    output.write_text(json.dumps(report, indent=2) + '\n')
    print('Saved', output, flush=True)
    failures = sum(entry['summary']['failures'] for entry in report['sequential'] + report['concurrent'])
    print('Measured failures:', failures, flush=True)


if __name__ == '__main__':
    if not os.environ.get('INVENTORY_BENCHMARK_ACCESS_TOKEN'):
        raise SystemExit('Set INVENTORY_BENCHMARK_ACCESS_TOKEN to a fresh Admin JWT; see docs/authentication.md')
    main()
