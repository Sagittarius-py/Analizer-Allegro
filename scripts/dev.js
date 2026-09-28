const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { createServer } = require('vite');

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startDevelopmentApp() {
  let viteServer;
  let electronProcess;

  try {
    const port = await findAvailablePort();
    viteServer = await createServer({
      configFile: path.resolve(__dirname, '..', 'vite.config.ts'),
      server: { host: '127.0.0.1', port, strictPort: true }
    });
    await viteServer.listen();

    const devUrl = viteServer.resolvedUrls && viteServer.resolvedUrls.local[0];
    if (!devUrl) throw new Error('Vite did not provide a local development URL');
    console.log(`Vite ready at ${devUrl}`);

    const { ELECTRON_RUN_AS_NODE, ...parentEnv } = process.env;
    electronProcess = spawn(require('electron'), ['.'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...parentEnv, ELECTRON_ENABLE_DB: '1', VITE_DEV_SERVER_URL: devUrl },
      stdio: 'inherit'
    });

    const exitCode = await new Promise((resolve, reject) => {
      electronProcess.once('error', reject);
      electronProcess.once('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } catch (error) {
    console.error('Failed to start development app:', error);
    process.exitCode = 1;
  } finally {
    if (viteServer) await viteServer.close();
  }
}

startDevelopmentApp();