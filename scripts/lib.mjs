// Shared helpers for the cross-platform dev/prod scripts (Windows, macOS, Linux). No dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND = join(ROOT, 'backend');
export const FRONTEND = join(ROOT, 'frontend');
export const isWin = process.platform === 'win32';
export const VENV = join(BACKEND, '.venv');
export const VENV_PY = isWin ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python');

const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
export const log = (msg) => console.log(`${c(36, '[nexus]')} ${msg}`);
export const warn = (msg) => console.log(`${c(33, '[nexus]')} ${msg}`);
export const fail = (msg, hint) => {
  console.error(`${c(31, '[nexus] ERROR:')} ${msg}`);
  if (hint) console.error(hint);
  process.exit(1);
};

function tryRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || r.stderr).trim() : null;
}

/** Finds a Python >= 3.11 interpreter, returning [command, ...prefixArgs]. */
export function findPython() {
  const candidates = isWin ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
  for (const [cmd, ...pre] of candidates) {
    const out = tryRun(cmd, [...pre, '-c', 'import sys;print("%d.%d"%sys.version_info[:2])']);
    if (out) {
      const [maj, min] = out.split('.').map(Number);
      if (maj > 3 || (maj === 3 && min >= 11)) return [cmd, ...pre];
    }
  }
  return null;
}

export function checkPrereqs() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 18 || (major === 18 && minor < 18)) {
    fail(`Node.js 18.18+ is required (found ${process.versions.node}).`, 'Install it from https://nodejs.org/');
  }
  const py = findPython();
  if (!py) {
    fail('Python 3.11 or newer was not found.', isWin
      ? 'Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then reopen the terminal.'
      : 'Install it with your package manager, e.g. `sudo apt install python3 python3-venv` or `brew install python@3.12`.');
  }
  return py;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin && cmd.endsWith('npm'), ...opts });
  return r.status === 0;
}

const hashFile = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Creates backend/.venv and installs requirements when they changed. */
export function ensureBackend(py, { dev = true } = {}) {
  if (!existsSync(VENV_PY)) {
    log('Creating Python virtual environment (backend/.venv)…');
    if (!run(py[0], [...py.slice(1), '-m', 'venv', VENV])) {
      fail('Could not create a virtual environment.', isWin ? '' : 'On Debian/Ubuntu run: sudo apt install python3-venv');
    }
  }
  const req = join(BACKEND, dev ? 'requirements-dev.txt' : 'requirements.txt');
  const stamp = join(VENV, '.nexus-req-hash');
  const want = hashFile(join(BACKEND, 'requirements.txt')) + (dev ? hashFile(join(BACKEND, 'requirements-dev.txt')) : '');
  const have = existsSync(stamp) ? readFileSync(stamp, 'utf8') : '';
  if (want !== have) {
    log('Installing backend dependencies (first run takes a minute)…');
    if (!run(VENV_PY, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', req])) fail('pip install failed. See the output above.');
    writeFileSync(stamp, want);
  }
}

export function ensureFrontend() {
  const marker = join(FRONTEND, 'node_modules', '.package-lock.json');
  if (!existsSync(marker)) {
    log('Installing frontend dependencies…');
    if (!run('npm', ['install', '--no-audit', '--no-fund'], { cwd: FRONTEND, shell: isWin })) fail('npm install failed. See the output above.');
  }
}

export function ensureEnvFile() {
  const env = join(ROOT, '.env');
  if (!existsSync(env) && existsSync(join(ROOT, '.env.example'))) {
    writeFileSync(env, readFileSync(join(ROOT, '.env.example')));
    log('Created .env from .env.example (demo mode is on until you add AI_API_KEY).');
  }
  mkdirSync(join(ROOT, 'data'), { recursive: true });
}

/** Starts children with prefixed output; stops them all when one exits or on Ctrl+C. */
export async function runAll(procs) {
  const children = [];
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const ch of children) {
      try {
        if (isWin) spawnSync('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { stdio: 'ignore' });
        else process.kill(-ch.pid, 'SIGTERM');
      } catch { /* already gone */ }
    }
    setTimeout(() => process.exit(code), 400);
  };

  const waitForReady = async (url) => {
    const deadline = Date.now() + 60_000;
    while (!stopping && Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return true;
      } catch {
        // The backend is expected to refuse connections while it starts and migrates.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  if (isWin) process.on('SIGBREAK', () => stop(0));

  for (let i = 0; i < procs.length; i++) {
    if (stopping) return;
    const previous = procs[i - 1];
    if (previous?.readyUrl) {
      log(`Waiting for ${previous.name} to become ready…`);
      if (!await waitForReady(previous.readyUrl)) {
        warn(`${previous.name} did not become ready within 60 seconds.`);
        stop(1);
        return;
      }
      log(`${previous.name} is ready.`);
    }

    const p = procs[i];
    const ch = spawn(p.cmd, p.args, { cwd: p.cwd, env: { ...process.env, ...p.env }, shell: p.shell ?? false, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(ch);
    const tag = c(p.color, `[${p.name}]`.padEnd(10));
    const pipe = (stream, out) => {
      let buf = '';
      stream.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) out.write(`${tag} ${l}\n`);
      });
    };
    pipe(ch.stdout, process.stdout);
    pipe(ch.stderr, process.stdout);
    ch.on('exit', (code) => { if (!stopping) { warn(`${p.name} exited (code ${code}); shutting everything down.`); stop(code ?? 1); } });
    ch.on('error', (e) => fail(`Could not start ${p.name}: ${e.message}`));
  }
}
