import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const server = resolve(root, ".next/standalone/server.js");

if (!existsSync(server)) {
  throw new Error("Standalone build missing. Run `npm run build` first.");
}

function ensureLink(linkPath, target) {
  if (existsSync(linkPath)) return;
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, "dir");
}

ensureLink(resolve(root, ".next/standalone/.next/static"), "../../static");
if (existsSync(resolve(root, "public"))) {
  ensureLink(resolve(root, ".next/standalone/public"), "../../public");
}

process.env.HOSTNAME ||= "127.0.0.1";
process.env.PORT ||= "3400";

await import(pathToFileURL(server).href);
