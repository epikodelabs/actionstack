/**
 * MutationBatch benchmark: where does dispatch time actually go?
 *
 * Measures end-to-end stage+commit wall-clock across state shapes and breaks it
 * into attributable phases:
 *   - validate: one validateTree walk (O(state), allocation-free) — run in the
 *     current engine once per stage that writes; the pre-5.0.2 engine ran it
 *     twice (constructor + staged root).
 *   - collection copy: fresh Map/Set/Date shadows per touched collection per stage.
 *   - remainder: draft proxies, finalize walk, commit replay — everything else.
 *
 * GC pause time (via PerformanceObserver) proxies allocation pressure.
 * A steady-state heap check verifies dispatches leave nothing behind.
 *
 * Run: NODE_OPTIONS=--expose-gc npx tsx scripts/benchmark-mutations.ts
 */
import { PerformanceObserver } from 'node:perf_hooks';
import { MutationBatch, validateTree } from '../projects/libraries/actionstack/src/lib/mutations';

const gcPauses: { label: string; ms: number }[] = [];
new PerformanceObserver(list => {
  for (const entry of list.getEntries())
    gcPauses.push({ label: 'gc', ms: entry.duration });
}).observe({ entryTypes: ['gc'], buffered: false });

const hr = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const gc = () => global.gc?.();
const fmt = (ms: number) => (ms >= 100 ? ms.toFixed(0) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));

interface Sample { mean: number; p95: number; gcMs: number }

function measure(label: string, iterations: number, body: () => void | Promise<void>): Sample {
  for (let i = 0; i < Math.min(5, iterations); i++) { gc(); void body(); }
  const durations: number[] = [];
  gcPauses.length = 0;
  for (let i = 0; i < iterations; i++) {
    gc();
    const start = hr();
    const result = body();
    if (result instanceof Promise) { throw new Error('use measureAsync for async bodies'); }
    durations.push(hr() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    mean: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95: durations[Math.floor(durations.length * 0.95)],
    gcMs: gcPauses.reduce((a, g) => a + g.ms, 0) / iterations,
  };
}

async function measureAsync(label: string, iterations: number, body: () => Promise<void>): Promise<Sample> {
  for (let i = 0; i < Math.min(5, iterations); i++) { gc(); await body(); }
  const durations: number[] = [];
  gcPauses.length = 0;
  for (let i = 0; i < iterations; i++) {
    gc();
    const start = hr();
    await body();
    durations.push(hr() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    mean: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95: durations[Math.floor(durations.length * 0.95)],
    gcMs: gcPauses.reduce((a, g) => a + g.ms, 0) / iterations,
  };
}

const dispatch = async (state: any, touch: (draft: any) => void, stages = 1) => {
  const batch = new MutationBatch(state);
  for (let i = 0; i < stages; i++) await batch.run([], draft => touch(draft));
  batch.commit();
};

const row = (cells: (string | number)[]) =>
  console.log('| ' + cells.map(c => String(c).padEnd(10)).join(' | ') + ' |');
const header = (title: string, cells: string[]) => {
  console.log(`\n=== ${title} ===`);
  row(cells);
  console.log('|' + cells.map(() => '-'.repeat(12)).join('|') + '|');
};

// ---------------------------------------------------------------- shapes
const makeTree = (objects: number) => {
  const items = Array.from({ length: objects }, (_, i) => ({ n: i, name: `item-${i}` }));
  return { items, meta: { created: 0 } };
};
const makeMapState = (entries: number) => {
  const map = new Map<string, { n: number }>();
  for (let i = 0; i < entries; i++) map.set(`k${i}`, { n: i });
  return { map };
};

// ---------------------------------------------------------------- scenarios
console.log('MutationBatch benchmark — mean ms per dispatch (p95 | gc pause ms/dispatch)');
console.log(`node ${process.version}, gc ${global.gc ? 'available' : 'MISSING (run with --expose-gc)'}`);

// 1. Plain-tree dispatch: state size x touched nodes.
for (const objects of [1_000, 10_000, 50_000]) {
  header(`plain tree, ${objects} objects`, ['touched', 'e2e', 'validate', 'pre-5.0.2', 'gc e2e']);
  for (const touched of [10, 100, 1_000]) {
    if (touched > objects) continue;
    const state = makeTree(objects);
    const touch = (draft: any) => { for (let i = 0; i < touched; i++) draft.items[i].n++; };
    const e2e = await measureAsync('e2e', Math.max(20, Math.min(300, 30_000 / objects)), () => dispatch(state, touch));
    const validate = measure('validate', Math.max(20, Math.min(300, 30_000 / objects)), () => validateTree(state));
    row([touched, fmt(e2e.mean), fmt(validate.mean), fmt(e2e.mean + validate.mean), fmt(e2e.gcMs)]);
  }
}

// 2. No-op dispatch: current engine skips the walk entirely (5.0.2 behavior).
header('plain tree, no-op stage (equal writes only)', ['objects', 'e2e', 'validate-if-run', 'gc e2e']);
for (const objects of [10_000, 50_000]) {
  const state = makeTree(objects);
  const noop = async () => dispatch(state, () => { /* zero writes */ });
  const e2e = await measureAsync('noop', 100, noop);
  const validate = measure('validate', 100, () => validateTree(state));
  row([objects, fmt(e2e.mean), fmt(validate.mean), fmt(e2e.gcMs)]);
}

// 3. Stage count: same writes spread over handler + N global reducers.
header('plain tree 10k, 100 writes, stage scaling', ['stages', 'e2e', 'gc e2e']);
{
  const state = makeTree(10_000);
  const touch = (draft: any) => { for (let i = 0; i < 100; i++) draft.items[i].n++; };
  for (const stages of [1, 2, 4]) {
    const e2e = await measureAsync('stages', 100, () => dispatch(state, touch, stages));
    row([stages, fmt(e2e.mean), fmt(e2e.gcMs)]);
  }
}

// 4. Collections: shadow copy + finalize rebuild vs map size.
header('Map state, 10 member writes', ['entries', 'e2e', 'mapcopy', 'validate', 'gc e2e']);
for (const entries of [1_000, 10_000, 100_000]) {
  const state = makeMapState(entries);
  const touch = (draft: any) => { for (let i = 0; i < 10; i++) draft.map.get(`k${i}`).n++; };
  const iterations = Math.max(10, Math.min(200, 100_000 / entries));
  const e2e = await measureAsync('e2e', iterations, () => dispatch(state, touch));
  const mapcopy = measure('mapcopy', iterations, () => new Map(state.map));
  const validate = measure('validate', iterations, () => validateTree(state));
  row([entries, fmt(e2e.mean), fmt(mapcopy.mean), fmt(validate.mean), fmt(e2e.gcMs)]);
}

// 5. Date: per-stage shadow and commit cost (baseline noise floor).
header('Date state', ['op', 'e2e', 'gc e2e']);
{
  const state = { when: new Date() };
  const e2e = await measureAsync('date', 2_000, () => dispatch(state, draft => { draft.when.setTime(1234567890); }));
  row(['setTime', fmt(e2e.mean), fmt(e2e.gcMs)]);
}

// 6. Steady-state heap: repeated dispatches must not grow the live heap.
header('steady-state heap over 2,000 dispatches (10k tree, 100 writes)', ['heap start', 'heap end', 'growth']);
{
  const state = makeTree(10_000);
  const touch = (draft: any) => { for (let i = 0; i < 100; i++) draft.items[i].n++; };
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 2_000; i++) await dispatch(state, touch);
  gc(); gc();
  const after = process.memoryUsage().heapUsed;
  const growth = (after - before) / 1024;
  row([`${(before / 1048576).toFixed(1)}M`, `${(after / 1048576).toFixed(1)}M`, `${growth.toFixed(0)}K`]);
}

console.log('\nlegend: e2e = stage+commit wall clock; validate = one validateTree walk on the same state;');
console.log('pre-5.0.2 = e2e + one extra walk (the removed constructor validation); gc = mean GC pause ms per dispatch.');
