import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validVersion } from './verified-update.mjs';

// Unknown provenance is not proof of an unmodified installation. Older manual
// archive installs must follow the documented manual upgrade procedure.
export function assertUnmodifiedInstallation(source) {
  const run = args => execFileSync('git', ['--no-optional-locks', '-C', source, ...args], {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let root, changes, head, release;
  try {
    root = run(['rev-parse', '--show-toplevel']).trim();
    if (realpathSync(root) !== realpathSync(source)) throw new Error();
    // Include untracked files: custom code must not disappear on a build switch.
    // Git-ignored vaults, secrets, dependencies and build output are untouched.
    changes = run(['status', '--porcelain=v1', '--untracked-files=all']);
    const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
    if (!validVersion(version)) throw new Error();
    head = run(['rev-parse', 'HEAD']).trim();
    release = run(['rev-parse', `refs/tags/v${version}^{commit}`]).trim();
  } catch { throw new Error('update_integrity_unavailable'); }
  if (changes.trim() || head !== release) throw new Error('update_local_changes');
}
