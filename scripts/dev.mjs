import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import process from "node:process";

const children = [];

const spawnProcess = (command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    ...options
  });

  children.push(child);
  return child;
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(code);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canListenOnPort = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });

const findAvailablePort = async (startingPort, attempts = 10) => {
  for (let port = startingPort; port < startingPort + attempts; port += 1) {
    if (await canListenOnPort(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an available port starting at ${startingPort}`);
};

const waitForHttp = async (url, retries = 60) => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });

      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (ready) {
      return;
    }

    await wait(500);
  }

  throw new Error(`Vite dev server did not become ready at ${url}`);
};

const start = async () => {
  const port = await findAvailablePort(5173);
  const devServerUrl = `http://127.0.0.1:${port}`;
  const electronWatch = spawnProcess("npx", ["tsc", "-p", "tsconfig.electron.json", "--watch"]);
  const vite = spawnProcess("npx", ["vite", "--host", "127.0.0.1", "--port", String(port)]);

  electronWatch.on("close", (code) => shutdown(code ?? 0));
  vite.on("close", (code) => shutdown(code ?? 0));

  await wait(1500);
  await waitForHttp(devServerUrl);

  const electron = spawnProcess("npx", ["electron", "."], {
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });

  electron.on("close", (code) => shutdown(code ?? 0));
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start().catch((error) => {
  console.error(error);
  shutdown(1);
});
