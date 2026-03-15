import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenWorkspaceInput, RecentWorkspaceRecord } from "../ipc/contracts.js";

export class RecentWorkspacesService {
  constructor(private readonly storagePath: string) {}

  async list(): Promise<RecentWorkspaceRecord[]> {
    const seeded = await this.getSeededRecords();

    try {
      const contents = await readFile(this.storagePath, "utf8");
      const records = JSON.parse(contents) as RecentWorkspaceRecord[];
      return this.mergeRecords(records, seeded);
    } catch {
      return seeded;
    }
  }

  async remember(input: OpenWorkspaceInput): Promise<RecentWorkspaceRecord[]> {
    const records = await this.list();
    const name = input.solutionPath
      ? path.basename(input.solutionPath, path.extname(input.solutionPath))
      : path.basename(input.rootPath);
    const nextRecord: RecentWorkspaceRecord = {
      name,
      rootPath: input.rootPath,
      solutionPath: input.solutionPath,
      lastOpenedAt: Date.now()
    };

    const next = [
      nextRecord,
      ...records.filter(
        (record) =>
          record.rootPath !== input.rootPath || record.solutionPath !== input.solutionPath
      )
    ].slice(0, 12);

    await mkdir(path.dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  private async getSeededRecords(): Promise<RecentWorkspaceRecord[]> {
    const sampleRootPath = path.resolve(process.cwd(), "sample");
    const sampleSolutionPath = path.join(sampleRootPath, "SamplePlatform.sln");

    try {
      await access(sampleSolutionPath);
      return [
        {
          name: "SamplePlatform",
          rootPath: sampleRootPath,
          solutionPath: sampleSolutionPath,
          lastOpenedAt: Date.now() - 60_000
        }
      ];
    } catch {
      return [];
    }
  }

  private mergeRecords(
    records: RecentWorkspaceRecord[],
    seeded: RecentWorkspaceRecord[]
  ): RecentWorkspaceRecord[] {
    const merged = [...records];

    for (const seed of seeded) {
      const exists = merged.some(
        (record) =>
          record.rootPath === seed.rootPath && record.solutionPath === seed.solutionPath
      );
      if (!exists) {
        merged.push(seed);
      }
    }

    return merged
      .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
      .slice(0, 12);
  }
}
