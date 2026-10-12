import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const SRC = fileURLToPath(new URL("../../../../src/", import.meta.url));
export async function resolve(spec, ctx, next) {
  if (spec === "next/cache") return next(new URL("./next-cache-stub.mjs", import.meta.url).href, ctx);
  let s = spec;
  if (s.startsWith("@/")) s = pathToFileURL(SRC + s.slice(2)).href;
  if ((s.startsWith("file:") || s.startsWith(".")) && !/\.(m?[jt]s|json)$/.test(s)) {
    const base = s.startsWith("file:") ? fileURLToPath(s) : fileURLToPath(new URL(s, ctx.parentURL));
    for (const ext of [".ts", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
  }
  return next(s, ctx);
}
