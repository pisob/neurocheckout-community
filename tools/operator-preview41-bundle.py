#!/usr/bin/env python3
"""Operator source-only artifact checks; never loads application environment/data."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

TAG = "v0.1.0-preview.41"
COMMIT = "2699d43aca48b7b8a6aedd0b82e8de604429f873"
TREE = "f7031e2303e6e501fe3a2ad9bac0ad0d456aa0c8"
TAG_OBJECT = "29b82f6749ce3ccf1492e272c732f51566d88f33"
ARCHIVE_SHA256 = "0737eb56a4bc36a95444cf8f1f9101f092337d855c95e0950e187564e07c02fa"
FINGERPRINT = "2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0"
IMAGE = "node@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d"
MAX_BYTES = 2 * 1024**3


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def file_record(path):
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        return {"kind": "symlink", "target": os.readlink(path)}
    if stat.S_ISREG(metadata.st_mode):
        return {"kind": "file", "sha256": digest(path), "size": metadata.st_size,
                "executable": bool(metadata.st_mode & 0o111)}
    raise ValueError(f"Unsupported payload entry: {path.name}")


def inventory(root, excluded=()):
    result = {}
    for directory, directories, names in os.walk(root, followlinks=False):
        relative = Path(directory).relative_to(root)
        for name in list(directories):
            path = Path(directory, name)
            if relative == Path(".") and name in excluded:
                directories.remove(name)
            elif path.is_symlink():
                directories.remove(name)
                names.append(name)
        for name in names:
            path = Path(directory, name)
            result[path.relative_to(root).as_posix()] = file_record(path)
    return result


def compare_source(reference, candidate):
    expected = inventory(Path(reference), (".git",))
    actual = inventory(Path(candidate), ("node_modules", ".next"))
    if actual != expected:
        changed = sorted(name for name in expected.keys() | actual.keys()
                         if expected.get(name) != actual.get(name))
        raise ValueError("Source differs from the exact signed Git tree: " + ", ".join(changed[:12]))
    for name in ("package.json", "package-lock.json"):
        with open(Path(candidate, name)) as stream:
            metadata = json.load(stream)
        assert metadata["version"] == TAG[1:]
        if name == "package-lock.json":
            assert metadata["packages"][""]["version"] == TAG[1:]
    print("Source bytes and executable modes match the exact signed Git tree.")


def git(reference, expression):
    return subprocess.check_output(["git", "-C", str(reference), "rev-parse", expression], text=True).strip()


def check_build_output(root):
    root = Path(root)
    for name in (".next", ".next/standalone", ".next/static"):
        if not stat.S_ISDIR((root / name).lstat().st_mode):
            raise ValueError("Build output directory is missing or a symlink: " + name)
    for name in (".next/standalone/server.js", ".next/BUILD_ID"):
        if not stat.S_ISREG((root / name).lstat().st_mode):
            raise ValueError("Build output file is missing or a symlink: " + name)
    if not 1 <= (root / ".next/BUILD_ID").stat().st_size <= 256:
        raise ValueError("Unexpected build identifier size")
    print("Build output roots and identifier are regular files/directories, not symlinks.")


def create(job):
    job = Path(job)
    payload = job / "package"
    reference = job / "reference"
    check_build_output(job / "build-source")
    runtime = json.loads((job / "runtime.json").read_text())
    files = inventory(payload)
    assert git(reference, "HEAD") == COMMIT
    assert git(reference, "HEAD^{tree}") == TREE
    assert git(reference, TAG) == TAG_OBJECT
    manifest = {
        "schema": 1, "artifact_kind": "operator-trusted-builder-not-official-signed-binary",
        "tag": TAG, "tag_object": git(reference, TAG), "commit": COMMIT,
        "tree": git(reference, "HEAD^{tree}"), "source_signer": FINGERPRINT,
        "official_source_archive_sha256": ARCHIVE_SHA256,
        "lockfile_sha256": digest(reference / "package-lock.json"),
        "source_tree_checked_before_and_after_build": True,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime,
        "builder": {"workflow_commit": os.environ["GITHUB_SHA"], "run_id": os.environ["GITHUB_RUN_ID"],
                    "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"]},
        "image_digest": (job / "image-digest.txt").read_text().strip(),
        "image_id": (job / "image-id.txt").read_text().strip(),
        "limits": {"memory_bytes": 4 * 1024**3, "memory_swap_bytes": 4 * 1024**3,
                   "cpus": 2, "node_heap_mib": 2560, "published_ports": [], "build_network": "none"},
        "commands": ["npm ci --no-audit --no-fund", "npm run build"],
        "logs_sha256": {name: digest(job / name) for name in ("install.log", "build.log")},
        "next_build_id": (job / "build-source/.next/BUILD_ID").read_text().strip(),
        "files": files,
    }
    with open(payload / "build-manifest.json", "x") as stream:
        json.dump(manifest, stream, sort_keys=True, indent=2)
        stream.write("\n")


def normalized_target(name, target, links=None):
    if target.startswith("/") or "\\" in target:
        raise ValueError("Absolute or non-POSIX symlink target")
    parts = list(PurePosixPath(name).parent.parts)
    pending = list(PurePosixPath(target).parts)
    followed = 0
    while pending:
        part = pending.pop(0)
        if part == "..":
            if len(parts) <= 1:
                raise ValueError("Symlink escapes bundle")
            parts.pop()
        elif part != ".":
            parts.append(part)
            candidate = "/".join(parts)
            if links and candidate in links:
                followed += 1
                if followed > 40:
                    raise ValueError("Cyclic or excessively nested symlinks")
                parts.pop()
                pending = list(PurePosixPath(links[candidate]).parts) + pending
    if not parts or parts[0] != "source":
        raise ValueError("Symlink escapes source payload")


def verify(archive):
    with tarfile.open(archive, "r:gz") as bundle:
        seen, links = set(), {}
        records = {}
        total_bytes = 0
        for item in bundle:
            total_bytes += item.size
            if len(seen) >= 100000 or total_bytes > MAX_BYTES:
                raise ValueError("Bundle exceeds entry or decompressed-size limit")
            name = item.name
            parts = PurePosixPath(name).parts
            if name.startswith("/") or "\\" in name or ".." in parts or str(PurePosixPath(name)) != name or name in seen:
                raise ValueError("Unsafe or duplicate archive path")
            seen.add(name)
            if item.mode & 0o7000:
                raise ValueError("Special permission bits in payload")
            if name != "build-manifest.json" and (not parts or parts[0] != "source"):
                raise ValueError("Unexpected top-level payload")
            if any(part in (".git", ".community-state", ".community-updates") for part in parts):
                raise ValueError("Git metadata or private state in payload")
            if any((part == ".env" or part.startswith(".env.")) and part != ".env.example" for part in parts):
                raise ValueError("Application environment in payload")
            if len(parts) > 1 and parts[1] == "node_modules":
                raise ValueError("Root dependency installation in payload")
            if len(parts) > 2 and parts[1] == ".next" and parts[2] not in ("standalone", "static"):
                raise ValueError("Unexpected build output")
            if item.isdir():
                continue
            if item.issym():
                normalized_target(name, item.linkname)
                links[name] = item.linkname
                records[name] = {"kind": "symlink", "target": item.linkname}
            elif item.isfile():
                with bundle.extractfile(item) as stream:
                    sha = hashlib.file_digest(stream, "sha256").hexdigest()
                records[name] = {"kind": "file", "sha256": sha, "size": item.size,
                                 "executable": bool(item.mode & 0o111)}
            else:
                raise ValueError("Special files or hardlinks are not accepted")
        for name in seen:
            if any(str(parent) in links for parent in PurePosixPath(name).parents):
                raise ValueError("Payload entry traverses a symlink")
        for name, target in links.items():
            normalized_target(name, target, links)
        manifest_item = bundle.getmember("build-manifest.json")
        if not manifest_item.isfile() or manifest_item.size > 16 * 1024**2:
            raise ValueError("Invalid manifest")
        manifest = json.load(bundle.extractfile(manifest_item))
        assert manifest["schema"] == 1 and manifest["tag"] == TAG and manifest["commit"] == COMMIT
        assert manifest["tree"] == TREE and manifest["tag_object"] == TAG_OBJECT
        assert manifest["artifact_kind"] == "operator-trusted-builder-not-official-signed-binary"
        assert manifest["source_signer"] == FINGERPRINT
        assert manifest["official_source_archive_sha256"] == ARCHIVE_SHA256
        assert manifest["source_tree_checked_before_and_after_build"] is True
        runtime = manifest["runtime"]
        assert runtime["node"] == "v22.22.1" and runtime["platform"] == "linux" and runtime["arch"] == "x64"
        assert re.fullmatch(r"[0-9]+\.[0-9]+", runtime["glibc"]) and runtime["abi"] == "127"
        assert manifest["limits"] == {"memory_bytes": 4 * 1024**3, "memory_swap_bytes": 4 * 1024**3,
                                      "cpus": 2, "node_heap_mib": 2560, "published_ports": [], "build_network": "none"}
        assert manifest["image_digest"] == IMAGE and re.fullmatch(r"sha256:[a-f0-9]{64}", manifest["image_id"])
        assert re.fullmatch(r"[a-f0-9]{40}", manifest["builder"]["workflow_commit"])
        assert re.fullmatch(r"[0-9]+", manifest["builder"]["run_id"]) and re.fullmatch(r"[0-9]+", manifest["builder"]["run_attempt"])
        records.pop("build-manifest.json")
        if records != manifest["files"]:
            raise ValueError("Payload inventory/digest mismatch")
        for required in ("source/package.json", "source/.next/standalone/server.js"):
            assert records[required]["kind"] == "file"
        assert any(name.startswith("source/.next/static/") for name in records)
        package = json.load(bundle.extractfile("source/package.json"))
        assert package["version"] == TAG[1:]
        assert records["source/package-lock.json"]["sha256"] == manifest["lockfile_sha256"]
    print("Operator bundle structure, version, platform, inventory and SHA256 payload checks: PASS")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--help"] or len(sys.argv) == 1:
            print("Usage: operator-preview41-bundle.py compare-source REFERENCE BUILD | check-build-output BUILD | create JOB | verify ARCHIVE")
        elif sys.argv[1] == "compare-source" and len(sys.argv) == 4:
            compare_source(sys.argv[2], sys.argv[3])
        elif sys.argv[1] == "create" and len(sys.argv) == 3:
            create(sys.argv[2])
        elif sys.argv[1] == "check-build-output" and len(sys.argv) == 3:
            check_build_output(sys.argv[2])
        elif sys.argv[1] == "verify" and len(sys.argv) == 3:
            verify(sys.argv[2])
        else:
            raise ValueError("Invalid arguments")
    except Exception as error:
        print(f"Operator build verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
