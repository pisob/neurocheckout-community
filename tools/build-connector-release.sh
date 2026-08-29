#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 5 ]]; then
  echo "Usage: $0 SOURCE_ROOT INCLUSION_MANIFEST OUTPUT_DIR PLATFORM VERSION" >&2
  exit 2
fi

source_root="$(realpath "$1")"
manifest="$(realpath "$2")"
output_dir="$(realpath -m "$3")"
platform="$4"
version="$5"

if [[ ! -d "${source_root}" || ! -f "${manifest}" ]]; then
  echo "Source root or inclusion manifest is missing." >&2
  exit 3
fi
if [[ ! "${platform}" =~ ^[a-z0-9][a-z0-9_-]{1,31}$ ]]; then
  echo "Platform identifier is invalid." >&2
  exit 4
fi
if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Version must use semantic versioning (for example 1.0.0)." >&2
  exit 5
fi
if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to build a connector release." >&2
  exit 6
fi

staging_dir="$(mktemp -d -t nc-connector-release.XXXXXX)"
cleanup() {
  rm -rf -- "${staging_dir}"
}
trap cleanup EXIT

file_count=0
while IFS= read -r relative_path; do
  relative_path="${relative_path%$'\r'}"
  [[ -n "${relative_path}" && "${relative_path}" != \#* ]] || continue
  if [[ "${relative_path}" == /* || "${relative_path}" == *".."* || "${relative_path}" == ".env"* ]]; then
    echo "Unsafe inclusion-manifest entry: ${relative_path}" >&2
    exit 7
  fi
  source_file="${source_root}/${relative_path}"
  if [[ ! -f "${source_file}" || -L "${source_file}" ]]; then
    echo "Missing or symbolic-link source file: ${relative_path}" >&2
    exit 8
  fi
  install -D -m 0644 "${source_file}" "${staging_dir}/${platform}/${relative_path}"
  file_count=$((file_count + 1))
done < "${manifest}"

if [[ "${file_count}" -eq 0 ]]; then
  echo "The inclusion manifest contains no source files." >&2
  exit 9
fi

secret_pattern='(^|[^A-Za-z])(sk-[A-Za-z0-9_-]{16,}|STRIPE_'
secret_pattern+='SECRET_KEY|NC_SESSION_'
secret_pattern+='SECRET|VISITOR_TRACE_'
secret_pattern+='INGEST_TOKEN|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
if rg -n --hidden "${secret_pattern}" "${staging_dir}"; then
  echo "Potential secret detected; connector release rejected." >&2
  exit 10
fi

mkdir -p "${output_dir}"
archive="${output_dir}/neurocheckout-${platform}-${version}.zip"
checksum="${archive}.sha256"
if [[ -e "${archive}" || -e "${checksum}" || -e "${archive}.minisig" ]]; then
  echo "Refusing to overwrite an existing release artifact." >&2
  exit 11
fi

source_date_epoch="${SOURCE_DATE_EPOCH:-1704067200}"
if [[ ! "${source_date_epoch}" =~ ^[0-9]{10,}$ ]]; then
  echo "SOURCE_DATE_EPOCH must be a Unix timestamp." >&2
  exit 12
fi
find "${staging_dir}" -type f -exec touch -d "@${source_date_epoch}" {} +
(
  cd "${staging_dir}"
  find "${platform}" -type f -print | LC_ALL=C sort | zip -X -q "${archive}" -@
)
(
  cd "${output_dir}"
  sha256sum "$(basename "${archive}")" > "$(basename "${checksum}")"
)

signing_key="${NC_CONNECTOR_MINISIGN_KEY_PATH:-}"
if [[ -n "${signing_key}" ]]; then
  if [[ "${signing_key}" != /* || ! -f "${signing_key}" ]]; then
    echo "NC_CONNECTOR_MINISIGN_KEY_PATH must name an existing absolute file." >&2
    exit 13
  fi
  if ! command -v minisign >/dev/null 2>&1; then
    echo "minisign is required when a signing key is configured." >&2
    exit 14
  fi
  minisign -S -s "${signing_key}" -m "${archive}" -x "${archive}.minisig"
fi

echo "Connector release prepared: ${archive}"
