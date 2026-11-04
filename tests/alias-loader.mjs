import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  let url;
  if (specifier.startsWith("@/")) url = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) url = new URL(specifier, context.parentURL);
  if (url) {
    for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(url.href + suffix);
      if (existsSync(fileURLToPath(candidate)) && /\.(ts|tsx|mjs|js)$/.test(candidate.pathname)) return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
