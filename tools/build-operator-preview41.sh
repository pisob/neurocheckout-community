#!/usr/bin/env bash
# Build the immutable published preview, never the mutable tooling checkout.
# Deliberately restricted to an operator dispatch on the canonical main branch.
set -euo pipefail
umask 077
if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Operator-only GitHub Actions helper for the signed preview.41.' \
    'Produces a source-only native x64 validation artifact; never publishes a release or activates an installation.'
  exit 0
fi
[[ "$#" == 0 && "${GITHUB_ACTIONS:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch \
  && "${GITHUB_REPOSITORY:-}" == pisob/neurocheckout-community && "${GITHUB_REF:-}" == refs/heads/main \
  && "${RUNNER_ARCH:-}" == X64 && "${RUNNER_TEMP:-}" == /* ]] || { echo 'Canonical main-branch x64 operator dispatch required.' >&2; exit 2; }
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ \
  && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || exit 2
for command in docker git gpg curl tar gzip sha256sum python3 timeout; do command -v "$command" >/dev/null; done
test "$(id -u)" != 0
builder_gid="$(id -g)"
python3 -I -c 'import sys; assert sys.version_info >= (3, 11)'
builder_arch="$(docker info --format '{{.Architecture}}')"
[[ "$builder_arch" == x86_64 || "$builder_arch" == amd64 ]] || { echo 'Native x64 Docker host required.' >&2; exit 3; }
available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
(( available_kib >= 6 * 1024 * 1024 )) || { echo 'Require at least 6 GiB available before the 4 GiB build.' >&2; exit 3; }
disk_kib="$(df --output=avail "$RUNNER_TEMP" | tail -n 1 | tr -d ' ')"
(( disk_kib >= 6 * 1024 * 1024 )) || { echo 'Require at least 6 GiB staging disk space.' >&2; exit 3; }
tool_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
verifier="$tool_dir/operator-preview41-bundle.py"
output_dir="$RUNNER_TEMP/community-preview41-operator"
test ! -e "$output_dir"
mkdir -m 700 "$output_dir"
job_dir="$(mktemp -d "$RUNNER_TEMP/nc-operator-preview41.XXXXXX")"
cd "$job_dir"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0
active_container=''
cleanup_container() {
  local exit_code="$?"
  if [[ -n "$active_container" ]]; then docker container rm --force "$active_container" >/dev/null 2>&1 || true; fi
  if (( exit_code != 0 )); then
    for log in install.log build.log; do if [[ -f "$log" ]]; then tail -n 80 "$log"; fi; done
  fi
}
trap cleanup_container EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
run_container() {
  local phase="$1" duration="$2"
  shift 2
  local name="nc-operator-preview41-${job_dir##*.}-$phase"
  if docker container inspect "$name" >/dev/null 2>&1; then echo 'Refusing an existing container name.' >&2; return 4; fi
  active_container="$name"
  timeout --foreground --signal=TERM --kill-after=30s "$duration" docker run --name "$name" "$@"
  active_container=''
}

tag=v0.1.0-preview.41
expected_commit=2699d43aca48b7b8a6aedd0b82e8de604429f873
expected_tree=f7031e2303e6e501fe3a2ad9bac0ad0d456aa0c8
expected_tag_object=29b82f6749ce3ccf1492e272c732f51566d88f33
expected_archive=0737eb56a4bc36a95444cf8f1f9101f092337d855c95e0950e187564e07c02fa
fingerprint=2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
repository=https://github.com/pisob/neurocheckout-community
archive=neurocheckout-community-0.1.0-preview.41.tar.gz
curl --fail --silent --show-error --location --max-time 120 \
  "https://api.github.com/repos/pisob/neurocheckout-community/releases/tags/$tag" --output release.json
python3 -I -c 'import json; r=json.load(open("release.json")); assert r["tag_name"]=="v0.1.0-preview.41" and r["prerelease"] is True and r["draft"] is False'
timeout --signal=TERM --kill-after=15s 180s git -c credential.helper= -c core.hooksPath=/dev/null \
  clone --depth 1 --branch "$tag" "$repository.git" reference
test "$(git -C reference rev-parse HEAD)" = "$expected_commit"
test "$(git -C reference rev-parse "$tag^{commit}")" = "$expected_commit"
test "$(git -C reference rev-parse 'HEAD^{tree}')" = "$expected_tree"
test "$(git -C reference rev-parse "$tag")" = "$expected_tag_object"
mkdir -m 700 keyring
gpg --homedir "$job_dir/keyring" --batch --import reference/RELEASE-PUBLIC-KEY.asc
GNUPGHOME="$job_dir/keyring" git -C reference verify-tag --raw "$tag" 2>tag-verification.txt
grep -Eq "^\[GNUPG:\] VALIDSIG $fingerprint " tag-verification.txt
if grep -Eq '^\[GNUPG:\] (BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG)' tag-verification.txt; then echo 'Rejected tag signature status.' >&2; exit 5; fi
for suffix in '' .asc .sha256; do
  curl --fail --silent --show-error --location --max-time 180 \
    "$repository/releases/download/$tag/$archive$suffix" --output "$archive$suffix"
done
test "$(sha256sum "$archive" | awk '{print $1}')" = "$expected_archive"
test "$(wc -l < "$archive.sha256")" = 1
test "$(awk '{print $2}' "$archive.sha256")" = "$archive"
sha256sum --check "$archive.sha256"
gpg --homedir "$job_dir/keyring" --batch --status-fd 1 --verify "$archive.asc" "$archive" >archive-verification.txt
grep -Eq "^\[GNUPG:\] VALIDSIG $fingerprint " archive-verification.txt
if grep -Eq '^\[GNUPG:\] (BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG)' archive-verification.txt; then echo 'Rejected archive signature status.' >&2; exit 5; fi
git -C reference -c tar.umask=0002 archive --format=tar \
  --prefix=neurocheckout-community-0.1.0-preview.41/ "$tag" | gzip -n -9 >reconstructed.tar.gz
cmp "$archive" reconstructed.tar.gz
mkdir build-source
tar --extract --gzip --file "$archive" --directory build-source --strip-components=1 --no-same-owner
python3 -I "$verifier" compare-source reference build-source

# Official Node 22.22.1 Debian/glibc manifest, already resolved and immutable.
image_digest=node@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d
timeout --signal=TERM --kill-after=30s 5m docker pull --platform linux/amd64 "$image_digest"
test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_digest")" = linux/amd64
docker image inspect --format '{{.Id}}' "$image_digest" >image-id.txt
printf '%s\n' "$image_digest" >image-digest.txt
docker_options=(--rm --init --platform linux/amd64 --memory=4g --memory-swap=4g --cpus=2 --pids-limit=256 \
  --cap-drop=ALL --security-opt=no-new-privileges --read-only --user="1000:$builder_gid" \
  --tmpfs=/tmp:rw,nosuid,nodev,size=536870912)
run_container runtime 2m "${docker_options[@]}" --network=none --entrypoint node "$image_digest" -e '
const report=process.report.getReport().header;
if(process.version!=="v22.22.1"||process.platform!=="linux"||process.arch!=="x64"||!report.glibcVersionRuntime)process.exit(1);
const npm=require("node:child_process").execFileSync("npm",["--version"],{encoding:"utf8"}).trim();
console.log(JSON.stringify({node:process.version,npm,platform:process.platform,arch:process.arch,abi:process.versions.modules,glibc:report.glibcVersionRuntime}));
' >runtime.json
# UID 1000 is the image's unprivileged node user (with a real passwd/home
# entry); share only the runner group so the host keeps ownership/read access.
# This source is public and fresh. No chmod/chown touches the tooling checkout.
chmod -R g+rwX "$job_dir/build-source"
build_mount=(--mount "type=bind,source=$job_dir/build-source,target=/build" --workdir=/build)
clean_environment='env -i PATH=/usr/local/bin:/usr/bin:/bin NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2560 npm_config_cache=/tmp/npm-cache npm_config_userconfig=/tmp/nc-empty-user.npmrc npm_config_globalconfig=/tmp/nc-empty-global.npmrc npm_config_audit=false npm_config_fund=false'
run_container install 15m "${docker_options[@]}" "${build_mount[@]}" --network=bridge --entrypoint /bin/sh "$image_digest" \
  -ec "umask 0007; $clean_environment npm ci --no-audit --no-fund" >install.log 2>&1
cat install.log
python3 -I "$verifier" compare-source reference build-source
run_container build 20m "${docker_options[@]}" "${build_mount[@]}" --network=none --entrypoint /bin/sh "$image_digest" \
  -ec "umask 0007; $clean_environment npm run build" >build.log 2>&1
cat build.log
python3 -I "$verifier" compare-source reference build-source
python3 -I "$verifier" check-build-output build-source

# Recreate package source from the signed archive. Never bundle .git, root
# node_modules, caches, arbitrary build files, or the operator's environment.
mkdir package
tar --extract --gzip --file "$archive" --directory package --no-same-owner
mv package/neurocheckout-community-0.1.0-preview.41 package/source
mkdir package/source/.next
cp -a --no-preserve=ownership build-source/.next/standalone build-source/.next/static package/source/.next/
python3 -I "$verifier" create "$job_dir"
tar --sort=name --numeric-owner --owner=0 --group=0 --create --gzip \
  --file "$output_dir/preview41-operator-linux-x64.tar.gz" --directory package build-manifest.json source
cp package/build-manifest.json "$output_dir/build-manifest.json"
(cd "$output_dir" && sha256sum preview41-operator-linux-x64.tar.gz >preview41-operator-linux-x64.tar.gz.sha256)
python3 -I "$verifier" verify "$output_dir/preview41-operator-linux-x64.tar.gz"
printf '%s\n' 'Verified operator validation artifact ready; no release or installation was changed.'
