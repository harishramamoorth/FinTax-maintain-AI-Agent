// `npm run dev`: sets everything up on first run, then starts FastAPI (:8000) and Vite (:5173) together.
import { join } from 'node:path';
import { BACKEND, FRONTEND, VENV_PY, checkPrereqs, ensureBackend, ensureEnvFile, ensureFrontend, isWin, log, runAll } from './lib.mjs';

const py = checkPrereqs();
ensureEnvFile();
ensureBackend(py, { dev: true });
ensureFrontend();
if (process.argv.includes('--setup-only')) { log('Setup complete. Run `npm run dev` to start.'); process.exit(0); }

log('Starting backend  → http://127.0.0.1:8000  (API docs: /api/docs)');
log('Starting frontend → http://localhost:5173   (open this one)');
runAll([
  { name: 'backend', color: 35, cmd: VENV_PY, args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--reload-dir', 'app', '--host', '127.0.0.1', '--port', '8000'], cwd: BACKEND, readyUrl: 'http://127.0.0.1:8000/api/health' },
  { name: 'frontend', color: 36, cmd: process.execPath, args: [join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], cwd: FRONTEND },
]);
