#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'https://github.com/gonchiman/project-rules.git';
const LOCK = 'project-rules.lock.json';
const SYNC_LOCK = 'project-rules.sync.lock';
const TOOL_SOURCE = 'tools/sync-project-rules.mjs';
const TOOL_TARGET = 'scripts/sync-project-rules.mjs';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

function utf8(bytes, label) {
  try { return decoder.decode(bytes); }
  catch { fail(`${label}: invalid UTF-8`); }
}

function json(bytes, label) {
  try { return JSON.parse(utf8(bytes, label)); }
  catch (error) { fail(`${label}: ${error.message}`); }
}

function git(cwd, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')));
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    return execFileSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
      env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr ? utf8(error.stderr, 'git stderr').trim() : error.message;
    fail(`git ${args[0]} failed: ${detail}`);
  }
}

function rootDirectory(input, label) {
  try {
    const result = fs.realpathSync(path.resolve(input));
    if (!fs.statSync(result).isDirectory()) fail(`${label} is not a directory`);
    return result;
  } catch (error) { fail(`${label}: ${error.message}`); }
}

function sameDirectory(left, right) {
  if (path.relative(left, right) === '') return true;
  // Windows can expose the same directory through a short name or a mapped
  // path that realpath leaves unchanged. Compare the actual filesystem IDs.
  const first = fs.statSync(left, { bigint: true });
  const second = fs.statSync(right, { bigint: true });
  return first.isDirectory() && second.isDirectory() && first.ino !== 0n &&
    first.dev === second.dev && first.ino === second.ino;
}

function validMapping(entry, label, needsHash = false) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`${label}: invalid file entry`);
  const match = typeof entry.source === 'string' && /^rules\/([a-z0-9][a-z0-9-]*)\.md$/.exec(entry.source);
  if (!(match && entry.target === `instructions/shared/${match[1]}.md`) &&
      !(entry.source === TOOL_SOURCE && entry.target === TOOL_TARGET)) {
    fail(`${label}: unsafe or unsupported source/target path`);
  }
  if (needsHash && (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))) {
    fail(`${label}: invalid sha256`);
  }
}

function fileEntries(value, label, needsHash = false) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label}: files must be a nonempty array`);
  const sources = new Set();
  const targets = new Set();
  for (const entry of value) {
    validMapping(entry, label, needsHash);
    if (sources.has(entry.source.toLowerCase()) || targets.has(entry.target.toLowerCase())) {
      fail(`${label}: duplicate source or target path`);
    }
    sources.add(entry.source.toLowerCase());
    targets.add(entry.target.toLowerCase());
  }
  if (!sources.has(TOOL_SOURCE)) fail(`${label}: synchronization tool must be managed`);
  return value;
}

function parseManifest(bytes) {
  const manifest = json(bytes, 'bundle.json');
  if (manifest?.schemaVersion !== 1 || manifest.repository !== REPOSITORY) fail('bundle.json: invalid schema or repository');
  fileEntries(manifest.files, 'bundle.json');
  return manifest;
}

function parseLock(bytes) {
  const lock = json(bytes, LOCK);
  if (lock?.schemaVersion !== 1 || lock.source?.repository !== REPOSITORY ||
      typeof lock.source?.commit !== 'string' || !/^[a-f0-9]{40}$/.test(lock.source.commit)) {
    fail(`${LOCK}: invalid schema, repository, or full commit SHA`);
  }
  fileEntries(lock.files, LOCK, true);
  return lock;
}

// Reject symbolic links, junctions, non-file leaves, and non-directory ancestors.
// A missing path is allowed so init can create its managed directories.
function safePath(root, relative) {
  if (relative !== LOCK && relative !== SYNC_LOCK && relative !== 'bundle.json' && relative !== TOOL_TARGET &&
      !/^instructions\/shared\/[a-z0-9][a-z0-9-]*\.md$/.test(relative)) fail(`Unsafe project path: ${relative}`);
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) fail(`Symbolic link or junction is not allowed: ${relative}`);
    if (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) fail(`Unexpected file type: ${relative}`);
  }
  const resolved = path.resolve(root, ...parts);
  if (!resolved.startsWith(`${root}${path.sep}`)) fail(`Path escapes project: ${relative}`);
  return resolved;
}

function readProject(root, relative) {
  const filename = safePath(root, relative);
  try { return fs.readFileSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function requireLock(root) {
  const bytes = readProject(root, LOCK);
  if (bytes === null) fail(`${LOCK} is missing; run init first`);
  return { lock: parseLock(bytes), bytes };
}

function assertManagedUnchanged(root, lock) {
  const originals = new Map();
  for (const file of lock.files) {
    const bytes = readProject(root, file.target);
    if (bytes === null) fail(`Managed file is missing: ${file.target}`);
    utf8(bytes, file.target);
    if (sha256(bytes) !== file.sha256) fail(`Managed file was edited locally: ${file.target}; resolve it before syncing`);
    originals.set(file.target, bytes);
  }
  return originals;
}

function sourceVersion(sourceInput, refInput) {
  const source = rootDirectory(sourceInput, 'Source');
  const gitRoot = rootDirectory(utf8(git(source, ['rev-parse', '--show-toplevel']), 'git root').trim(), 'Git source');
  if (!sameDirectory(source, gitRoot)) fail(`--source must name the source repository root (${source} != ${gitRoot})`);
  if (refInput !== undefined && !/^[a-f0-9]{40}$/.test(refInput)) fail('--ref must be a full lowercase 40-character commit SHA');
  const revision = refInput ?? 'HEAD';
  const commit = utf8(git(source, ['rev-parse', '--verify', `${revision}^{commit}`]), 'commit SHA').trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail('Source did not resolve to a full commit SHA');
  const blob = (relative) => {
    const metadata = utf8(git(source, ['ls-tree', commit, '--', relative]), 'git tree');
    if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(metadata)) fail(`Source file is missing or not a regular committed file: ${relative}`);
    const bytes = git(source, ['show', `${commit}:${relative}`]);
    utf8(bytes, relative);
    return bytes;
  };
  const manifest = parseManifest(blob('bundle.json'));
  const managed = ['bundle.json', ...manifest.files.map((entry) => entry.source)];
  const status = git(source, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...managed]);
  if (status.length > 0) fail('Source bundle or managed files have uncommitted changes; commit them before syncing');
  const files = manifest.files.map((entry) => ({ ...entry, bytes: blob(entry.source) }));
  return { commit, files };
}

function plannedChanges(project, oldLock, version, init) {
  const originals = init ? new Map() : assertManagedUnchanged(project, oldLock);
  const changes = [];
  const nextTargets = new Set(version.files.map((file) => file.target));
  for (const file of version.files) {
    const before = originals.has(file.target) ? originals.get(file.target) : readProject(project, file.target);
    if (before !== null && !originals.has(file.target) && !before.equals(file.bytes)) {
      fail(`Unmanaged target already exists with different content: ${file.target}`);
    }
    if (before === null || !before.equals(file.bytes)) changes.push({ target: file.target, before, after: file.bytes });
  }
  if (oldLock) {
    for (const file of oldLock.files) {
      if (!nextTargets.has(file.target)) changes.push({ target: file.target, before: originals.get(file.target), after: null });
    }
  }
  return changes;
}

function lockBytes(version) {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    source: { repository: REPOSITORY, commit: version.commit },
    files: version.files.map((file) => ({ source: file.source, target: file.target, sha256: sha256(file.bytes) })),
  }, null, 2)}\n`);
}

function atomicWrite(filename, bytes, beforeRename = () => {}) {
  const temporary = `${filename}.project-rules-${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    beforeRename();
    fs.renameSync(temporary, filename);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function matches(actual, expected) {
  return actual === null ? expected === null : expected !== null && actual.equals(expected);
}

function assertExpected(project, change, expected = change.before) {
  if (!matches(readProject(project, change.target), expected)) fail(`File changed during synchronization: ${change.target}`);
}

function assertNoSyncLock(project) {
  if (readProject(project, SYNC_LOCK) !== null) {
    fail(`Existing synchronization lock: ${path.join(project, SYNC_LOCK)}; inspect the owner and recovery journal before removing it manually`);
  }
}

function acquireSyncLock(project, changes) {
  const filename = safePath(project, SYNC_LOCK);
  const bytes = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    createdAt: new Date().toISOString(),
    changes: changes.map((change) => ({
      target: change.target,
      beforeBase64: change.before === null ? null : change.before.toString('base64'),
      afterSha256: change.after === null ? null : sha256(change.after),
    })),
  }, null, 2)}\n`);
  try { fs.writeFileSync(filename, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') fail(`Existing synchronization lock: ${filename}; inspect it before removing it manually`);
    fail(`Cannot create synchronization lock ${filename}: ${error.message}; inspect any remaining journal`);
  }
  return {
    filename,
    assertOwnership() {
      if (!matches(readProject(project, SYNC_LOCK), bytes)) fail(`Synchronization lock ownership changed; inspect the recovery journal at ${filename}`);
    },
    release() {
      this.assertOwnership();
      fs.unlinkSync(filename);
    },
  };
}

function applyChanges(project, changes) {
  const guard = acquireSyncLock(project, changes);
  const applied = [];
  const createdDirectories = [];
  let failure = null;
  let keepJournal = false;
  try {
    // Check every target before the first mutation, then check again at each write.
    guard.assertOwnership();
    for (const change of changes) assertExpected(project, change);
    for (const change of changes) {
      guard.assertOwnership();
      assertExpected(project, change);
      const filename = safePath(project, change.target);
      let directory = path.dirname(filename);
      const missing = [];
      while (directory !== project && !fs.existsSync(directory)) { missing.push(directory); directory = path.dirname(directory); }
      for (const item of missing.reverse()) { fs.mkdirSync(item); createdDirectories.push(item); }
      if (change.after === null) { assertExpected(project, change); fs.unlinkSync(filename); }
      else atomicWrite(filename, change.after, () => { guard.assertOwnership(); assertExpected(project, change); });
      applied.push(change);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const change of applied.reverse()) {
      try {
        // Another writer's edits must never be replaced by our rollback.
        assertExpected(project, change, change.after);
        const filename = safePath(project, change.target);
        if (change.before === null) fs.unlinkSync(filename);
        else atomicWrite(filename, change.before, () => assertExpected(project, change, change.after));
      } catch (rollbackError) { rollbackErrors.push(`${change.target}: ${rollbackError.message}`); }
    }
    for (const directory of createdDirectories.reverse()) {
      try { fs.rmdirSync(directory); } catch (cleanupError) { if (!['ENOENT', 'ENOTEMPTY'].includes(cleanupError.code)) rollbackErrors.push(cleanupError.message); }
    }
    keepJournal = rollbackErrors.length > 0;
    failure = new Error(`Synchronization failed: ${error.message}${keepJournal ? `; rollback requires attention: ${rollbackErrors.join('; ')}; recovery journal kept at ${guard.filename}` : '; previous files restored'}`);
  }
  if (!keepJournal) {
    try { guard.release(); }
    catch (error) { failure = new Error(`${failure ? `${failure.message}; ` : ''}${error.message}; recovery journal: ${guard.filename}`); }
  }
  if (failure) throw failure;
}

function unifiedDiff(project, change) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'project-rules-diff-'));
  try {
    const before = path.join(temporary, 'before');
    const after = path.join(temporary, 'after');
    fs.writeFileSync(before, change.before ?? Buffer.alloc(0));
    fs.writeFileSync(after, change.after ?? Buffer.alloc(0));
    let output;
    try {
      output = execFileSync('git', ['--no-pager', 'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--text', '--', before, after], {
        cwd: project, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
        env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))),
      });
    } catch (error) {
      if (error.status !== 1 || typeof error.stdout !== 'string') fail(`Cannot generate diff: ${error.message}`);
      output = error.stdout;
    }
    const lines = output.split('\n').filter((line) => !line.startsWith('diff --git ') && !line.startsWith('index '));
    return lines.map((line) => line.startsWith('--- ') ? `--- ${change.before === null ? '/dev/null' : `a/${change.target}`}` :
      line.startsWith('+++ ') ? `+++ ${change.after === null ? '/dev/null' : `b/${change.target}`}` : line).join('\n');
  } finally {
    if (path.dirname(temporary) === fs.realpathSync(os.tmpdir()) || path.dirname(temporary) === path.resolve(os.tmpdir())) {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}

function usage() {
  return 'Usage: node scripts/sync-project-rules.mjs init|check|diff|sync [--project PATH] [--source PATH] [--ref FULL_SHA]\n' +
    'init/diff/sync require a clean, committed local source checkout. check works offline.\n';
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) { process.stdout.write(usage()); return; }
  const [command, ...args] = argv;
  if (!['init', 'check', 'diff', 'sync'].includes(command)) fail(`Unknown command: ${command}`);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!['--project', '--source', '--ref'].includes(name) || options[name] !== undefined) fail(`Unknown or duplicate option: ${name}`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) fail(`Missing value for ${name}`);
    options[name] = args[index + 1];
  }
  if (command !== 'check' && !options['--source']) fail(`${command} requires --source PATH`);
  if (command === 'check' && (options['--source'] || options['--ref'])) fail('check uses the local lock only; omit --source and --ref');
  const project = rootDirectory(options['--project'] ?? process.cwd(), 'Project');
  assertNoSyncLock(project);
  if (command === 'check') {
    const { lock } = requireLock(project);
    assertManagedUnchanged(project, lock);
    process.stdout.write(`Verified ${lock.files.length} managed files at ${lock.source.commit}.\n`);
    return;
  }
  let previous = null;
  if (command === 'init') {
    if (readProject(project, LOCK) !== null) fail(`${LOCK} already exists; use sync`);
  } else previous = requireLock(project);
  const version = sourceVersion(options['--source'], options['--ref']);
  if (command === 'diff') {
    process.stdout.write(`Source version: ${previous.lock.source.commit} -> ${version.commit}\n`);
    const old = new Map(previous.lock.files.map((file) => [file.target, file]));
    const next = new Map(version.files.map((file) => [file.target, file]));
    for (const file of version.files) {
      const before = readProject(project, file.target);
      if (before !== null) utf8(before, file.target);
      const sourceChanged = !old.has(file.target) || old.get(file.target).sha256 !== sha256(file.bytes);
      const localChanged = old.has(file.target) && (before === null || sha256(before) !== old.get(file.target).sha256);
      if (!sourceChanged && !localChanged && before !== null && before.equals(file.bytes)) continue;
      process.stdout.write(`${old.has(file.target) ? 'changed' : 'new'}: ${file.target}${localChanged ? ' (local edits or missing)' : ''}\n`);
      process.stdout.write(unifiedDiff(project, { target: file.target, before, after: file.bytes }));
    }
    for (const file of previous.lock.files) {
      if (next.has(file.target)) continue;
      const before = readProject(project, file.target);
      if (before !== null) utf8(before, file.target);
      process.stdout.write(`removed: ${file.target}\n`);
      if (before !== null) process.stdout.write(unifiedDiff(project, { target: file.target, before, after: null }));
    }
    return;
  }
  const changes = plannedChanges(project, previous?.lock, version, command === 'init');
  const nextLock = lockBytes(version);
  const oldLock = previous?.bytes ?? null;
  if (oldLock === null || !oldLock.equals(nextLock)) changes.push({ target: LOCK, before: oldLock, after: nextLock });
  if (changes.length === 0) { process.stdout.write('Already synchronized; no files changed.\n'); return; }
  applyChanges(project, changes);
  process.stdout.write(`Synchronized ${version.files.length} managed files at ${version.commit}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`project-rules: ${error.message}\n`); process.exitCode = 1; }
}
