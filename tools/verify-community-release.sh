#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "Usage: $0 ARCHIVE SHA256_FILE SIGNATURE_FILE" >&2
  exit 2
fi

archive="$(realpath "$1")"
checksum="$(realpath "$2")"
signature="$(realpath "$3")"
repo_root="$(git rev-parse --show-toplevel)"
public_key="${repo_root}/RELEASE-PUBLIC-KEY.asc"

for file in "${archive}" "${checksum}" "${signature}" "${public_key}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Required verification file is missing: ${file}" >&2
    exit 3
  fi
done

expected_checksum_target="$(basename "${archive}")"
declared_checksum_target="$(awk 'NR == 1 {print $2}' "${checksum}")"
declared_checksum_target="${declared_checksum_target#\*}"
if [[ "${declared_checksum_target}" != "${expected_checksum_target}" ]]; then
  echo "Checksum filename does not match the selected archive." >&2
  exit 4
fi

(
  cd "$(dirname "${archive}")"
  sha256sum --check "${checksum}"
)

verification_home="$(mktemp -d -t nc-release-verification.XXXXXX)"
cleanup() {
  rm -rf -- "${verification_home}"
}
trap cleanup EXIT
chmod 0700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --quiet --import "${public_key}"
GNUPGHOME="${verification_home}" gpg --batch --verify "${signature}" "${archive}"
echo "Release checksum and NeuroCheckout signature are valid."
