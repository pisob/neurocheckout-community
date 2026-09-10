#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 SIGNED_TAG OUTPUT_DIR" >&2
  exit 2
fi

tag="$1"
output_dir="$(realpath -m "$2")"
repo_root="$(git rev-parse --show-toplevel)"
public_key="${repo_root}/RELEASE-PUBLIC-KEY.asc"
signing_home="${NC_RELEASE_GNUPGHOME:-}"
passphrase_file="${NC_RELEASE_GPG_PASSPHRASE_FILE:-}"

if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$ ]]; then
  echo "The release tag must use v-prefixed semantic versioning." >&2
  exit 3
fi
if [[ -z "${signing_home}" || "${signing_home}" != /* || ! -d "${signing_home}" ]]; then
  echo "NC_RELEASE_GNUPGHOME must name the absolute private signing-key directory." >&2
  exit 4
fi
if [[ ! -f "${public_key}" ]]; then
  echo "The committed release public key is missing." >&2
  exit 5
fi
if [[ -n "${passphrase_file}" && ( "${passphrase_file}" != /* || ! -f "${passphrase_file}" ) ]]; then
  echo "NC_RELEASE_GPG_PASSPHRASE_FILE must name an existing absolute file." >&2
  exit 6
fi
if [[ -n "$(git -C "${repo_root}" status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked files must be clean before building a release." >&2
  exit 7
fi

verification_home="$(mktemp -d -t nc-release-verification.XXXXXX)"
cleanup() {
  rm -rf -- "${verification_home}"
}
trap cleanup EXIT
chmod 0700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --quiet --import "${public_key}"
GNUPGHOME="${verification_home}" git -C "${repo_root}" verify-tag "${tag}"

version="${tag#v}"
archive="${output_dir}/neurocheckout-community-${version}.tar.gz"
checksum="${archive}.sha256"
signature="${archive}.asc"
if [[ -e "${archive}" || -e "${checksum}" || -e "${signature}" ]]; then
  echo "Refusing to overwrite an existing release file." >&2
  exit 8
fi

mkdir -p "${output_dir}"
git -C "${repo_root}" -c tar.umask=0002 archive \
  --format=tar \
  --prefix="neurocheckout-community-${version}/" \
  "${tag}" | gzip -n -9 > "${archive}"
(
  cd "${output_dir}"
  sha256sum "$(basename "${archive}")" > "$(basename "${checksum}")"
)
signing_arguments=(--batch --armor --detach-sign --output "${signature}")
if [[ -n "${passphrase_file}" ]]; then
  signing_arguments+=(--pinentry-mode loopback --passphrase-file "${passphrase_file}")
fi
GNUPGHOME="${signing_home}" gpg "${signing_arguments[@]}" "${archive}"

GNUPGHOME="${verification_home}" gpg --batch --verify "${signature}" "${archive}"
(
  cd "${output_dir}"
  sha256sum --check "$(basename "${checksum}")"
)
echo "Signed Community release prepared in ${output_dir}"
