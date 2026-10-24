// Runs a Python module inside the backend virtualenv: `node scripts/run-backend.mjs -m pytest -q`
import { spawnSync } from 'node:child_process';
import { BACKEND, VENV_PY, checkPrereqs, ensureBackend, isWin } from './lib.mjs';

ensureBackend(checkPrereqs(), { dev: true });
const r = spawnSync(VENV_PY, process.argv.slice(2), { cwd: BACKEND, stdio: 'inherit', shell: isWin && false });
process.exit(r.status ?? 1);
