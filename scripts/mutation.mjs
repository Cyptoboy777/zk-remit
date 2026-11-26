// Guard mutation check. For every assert() in the Compact contract, delete it, recompile (no proving
// keys needed) and run the contract tests. A guard whose deletion leaves every test green is a guard
// nothing tests. Exit code 1 if any guard survives.
// Usage: node scripts/mutation.mjs [--only N]   (needs compactc on PATH and npm ci done)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'contract/src/zk-remit.compact');
const out = join(root, 'contract/src/managed/zk-remit');
const backup = join(root, 'contract/src/.managed-backup');
const original = readFileSync(src, 'utf8');
// Guards no test can reach, with the reason. Keyed by circuit and exact statement text.
const allow = existsSync(join(root, 'contract/mutation-allowlist.json'))
  ? JSON.parse(readFileSync(join(root, 'contract/mutation-allowlist.json'), 'utf8'))
  : {};
const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;

// Find each assert( ... ); statement, matching parentheses and skipping strings.
const guards = [];
for (let i = original.indexOf('assert('); i !== -1; i = original.indexOf('assert(', i + 1)) {
  if (/\w/.test(original[i - 1] ?? ' ')) continue; // not part of a longer name such as assertGovernor
  let depth = 0, j = i + 6, inStr = false;
  for (; j < original.length; j++) {
    const c = original[j];
    if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) break;
  }
  const end = original.indexOf(';', j) + 1;
  const text = original.slice(i, end);
  const msg = text.match(/"([^"]+)"\s*\)\s*;$/)?.[1] ?? text.slice(0, 50);
  const circuit = [...original.slice(0, i).matchAll(/circuit\s+(\w+)/g)].pop()?.[1] ?? '?';
  const key = `${circuit} :: ${text.replace(/\s+/g, ' ')}`;
  guards.push({ start: i, end, msg, key, line: original.slice(0, i).split('\n').length });
}

const compile = () =>
  spawnSync('compactc', ['--skip-zk', src, out], { cwd: root, encoding: 'utf8' });
const tests = () =>
  spawnSync('npm', ['test', '-w', 'contract', '--', '--reporter=dot'], { cwd: root, encoding: 'utf8' });

if (existsSync(out)) cpSync(out, backup, { recursive: true });
const restore = () => {
  writeFileSync(src, original);
  if (existsSync(backup)) { rmSync(out, { recursive: true, force: true }); cpSync(backup, out, { recursive: true }); rmSync(backup, { recursive: true, force: true }); }
};
process.on('exit', restore);
process.on('SIGINT', () => process.exit(130));

// Baseline must be green, otherwise "killed" would mean nothing.
const base = compile();
if (base.status !== 0) { console.error('Baseline compile failed:\n' + base.stderr); process.exit(2); }
if (tests().status !== 0) { console.error('Baseline tests are not green; fix them first.'); process.exit(2); }

const rows = [];
guards.forEach((g, n) => {
  if (only !== null && n !== only) return;
  writeFileSync(src, original.slice(0, g.start) + '/* guard removed */' + original.slice(g.end));
  let verdict;
  const c = compile();
  if (c.status !== 0) verdict = 'uncompilable';
  else verdict = tests().status !== 0 ? 'killed' : allow[g.key] ? 'unreachable' : 'SURVIVED';
  rows.push({ n, line: g.line, msg: g.msg, verdict });
  console.log(`${String(n).padStart(2)}  line ${String(g.line).padStart(3)}  ${verdict.padEnd(12)} ${g.msg}`);
});
writeFileSync(src, original);

const killed = rows.filter((r) => r.verdict === 'killed').length;
const survived = rows.filter((r) => r.verdict === 'SURVIVED');
const unreachable = rows.filter((r) => r.verdict === 'unreachable').length;
const skipped = rows.filter((r) => r.verdict === 'uncompilable').length;
console.log(`\nMUTATION ${killed} of ${rows.length - skipped - unreachable} reachable guards caught by a test (${unreachable} unreachable and documented, ${skipped} uncompilable skipped, ${survived.length} survived)`);
survived.forEach((r) => console.log(`SURVIVED line ${r.line}: ${r.msg}`));
process.exit(survived.length ? 1 : 0);
