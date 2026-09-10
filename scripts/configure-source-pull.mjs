import { openSync, fstatSync, readFileSync, closeSync, constants } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { LocalDataStore } from "./local-data-store.mjs";
import { SourceSynchronizer } from "./local-source-sync.mjs";

let store, fd;
try {
  const sourceFile = process.argv[2];
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.argv.length !== 3 || !isAbsolute(sourceFile || "")) throw new Error();
  fd = openSync(sourceFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.size > 4096 || stat.mode & 0o077 || stat.uid !== process.getuid?.()) throw new Error();
  const configuration = JSON.parse(readFileSync(fd, "utf8"));
  store = new LocalDataStore(process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"));
  new SourceSynchronizer(store).configure(configuration);
  process.stdout.write("Staging source binding saved encrypted. No network request or Cloud automation was started.\n");
} catch {
  process.stderr.write("Source setup refused. Use staging, an existing private vault and an absolute private JSON credentials file. Never pass a secret on the command line.\n");
  process.exitCode = 1;
} finally { if (fd !== undefined) closeSync(fd); store?.close(); }
