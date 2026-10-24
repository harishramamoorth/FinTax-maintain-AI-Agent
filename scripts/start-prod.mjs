// `npm start`: serve the built frontend and the API from one FastAPI process on :8000.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BACKEND, FRONTEND, VENV_PY, checkPrereqs, ensureBackend, ensureEnvFile, fail, log, runAll } from './lib.mjs';

const py = checkPrereqs();
ensureEnvFile();
ensureBackend(py, { dev: false });
if (!existsSync(join(FRONTEND, 'dist', 'index.html'))) fail('The frontend has not been built yet.', 'Run `npm run build` first.');
const port = process.env.PORT || '8000';
log(`Serving FinTax Portal on http://127.0.0.1:${port}`);
runAll([{ name: 'server', color: 35, cmd: VENV_PY, args: ['-m', 'uvicorn', 'app.main:app', '--host', process.env.HOST || '0.0.0.0', '--port', port, '--proxy-headers'], cwd: BACKEND, env: { APP_ENV: 'production' } }]);
