import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface StreamingCallbacks {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (result: CommandResult) => void;
}

export class CommandRunner {
  async run(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeoutMs?: number;
      extraEnv?: Record<string, string>;
    }
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          cwd: options?.cwd,
          timeout: options?.timeoutMs ?? 12_000,
          env: {
            ...process.env,
            ...options?.extraEnv
          },
          maxBuffer: 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              ok: false,
              stdout: stdout.toString(),
              stderr: stderr.toString() || error.message,
              exitCode: typeof error.code === "number" ? error.code : 1
            });
            return;
          }

          resolve({
            ok: true,
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: 0
          });
        }
      );
    });
  }

  async createAzureConfigDir(): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), "aicoder-azure-"));
  }

  spawnStreaming(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      extraEnv?: Record<string, string>;
      callbacks?: StreamingCallbacks;
    }
  ): { kill: () => void } {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: {
        ...process.env,
        ...options?.extraEnv
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      options?.callbacks?.onStdout?.(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      options?.callbacks?.onStderr?.(text);
    });

    child.on("close", (code) => {
      options?.callbacks?.onExit?.({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });

    return {
      kill: () => child.kill()
    };
  }
}
