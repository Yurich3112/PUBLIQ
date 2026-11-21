import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT, main } from './lib/runtime.mjs';

export async function webEnvironment(root = ROOT, values = process.env) {
  const cwd = path.join(root, 'apps/web');
  let local = {};
  try { local = parseEnv(await readFile(path.join(cwd, '.env'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...values };
  // The listener must use the same configured port checked by DEV preflight.
  if (!env.PORT && local.PORT) env.PORT = local.PORT;
  const origin = new URL(env.AUTH_BASE_URL || local.AUTH_BASE_URL || 'http://localhost');
  // Node must read extra trust roots at process start, before Next.js loads its env.
  if (!env.NODE_EXTRA_CA_CERTS && (origin.hostname === 'modulon.local' || origin.hostname.endsWith('.modulon.local'))) {
    let infra = {};
    try { infra = parseEnv(await readFile(path.join(root, 'infra/local/.env.dev'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const directory = path.resolve(root, 'infra/local', env.CERTS_DIR || infra.CERTS_DIR || './certs');
    const ca = path.resolve(directory, env.TLS_CA_PEM || infra.TLS_CA_PEM || 'rootCA.pem');
    await access(ca);
    env.NODE_EXTRA_CA_CERTS = ca;
  }
  return env;
}

main(import.meta.url, async () => {
  const action = process.argv[2];
  if (!['dev', 'start'].includes(action)) throw new Error('Usage: node scripts/web.mjs dev|start');
  const cwd = path.join(ROOT, 'apps/web');
  const env = await webEnvironment();
  const child = spawn(process.execPath, [path.join(cwd, 'node_modules/next/dist/bin/next'), action, ...process.argv.slice(3)], {
    cwd, env, stdio: 'inherit', windowsHide: true,
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.once('error', () => { process.exitCode = 1; });
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
});
