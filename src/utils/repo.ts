import path from "path";
import { fs } from "zx";

/**
 * Finds the root directory of the repository by looking for a CMakeLists.txt file.
 * @param startDir - The starting directory.
 * @returns The root directory of the repository.
 */
export function findRepoRoot(startDir: string): string {
    let dir = startDir;
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, "CMakeLists.txt"))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error("Could not find repo root (CMakeLists.txt not found).");
}