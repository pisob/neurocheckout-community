import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvironment(text) {
  const values = {};

  for (const [index, sourceLine] of String(text).split(/\r?\n/).entries()) {
    let line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();

    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error(`Invalid environment entry on line ${index + 1}.`);
    }

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!ENV_NAME.test(name)) {
      throw new Error(`Invalid environment name on line ${index + 1}.`);
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = JSON.parse(value);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }

  return values;
}

export function readEnvironmentFile(file = ".env.local") {
  const path = resolve(file);
  if (!existsSync(path)) return {};
  return parseEnvironment(readFileSync(path, "utf8"));
}

export function loadEnvironmentFile(file = ".env.local") {
  const values = readEnvironmentFile(file);
  for (const [name, value] of Object.entries(values)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
  return values;
}

export function formatEnvironmentValue(value) {
  const normalized = String(value);
  return /^[A-Za-z0-9_./:@+-]+$/.test(normalized)
    ? normalized
    : JSON.stringify(normalized);
}
