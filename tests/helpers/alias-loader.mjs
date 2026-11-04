import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Lets the tests import the real source files by the same "@/..." paths the
// app uses (tsconfig "paths"), which Node doesn't understand on its own.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = join(root, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
