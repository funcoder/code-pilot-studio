import path from "node:path";
import { access, readdir } from "node:fs/promises";

export class WorkspaceSeedService {
  async findInitialWorkspaceCandidates(basePath: string): Promise<string[]> {
    const explicitSample = path.resolve(process.cwd(), "sample");
    try {
      await access(explicitSample);
      return [explicitSample];
    } catch {
      // fall through to directory discovery
    }

    const entries = await readdir(basePath, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => path.join(basePath, entry.name));

    return folders.slice(0, 2);
  }
}
