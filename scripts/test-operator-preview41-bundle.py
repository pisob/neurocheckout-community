#!/usr/bin/env python3
"""Small offline synthetic checks. Does not contact a server or read live data."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import shutil
import tarfile
import tempfile
import unittest

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools/operator-preview41-bundle.py"))


class BundleChecks(unittest.TestCase):
    def fixture(self, directory, extra=(), mutate_manifest=None):
        payload = {
            "source/package.json": b'{"version":"0.1.0-preview.41"}',
            "source/package-lock.json": b'{"version":"0.1.0-preview.41"}',
            "source/.next/standalone/server.js": b"// synthetic fixture\n",
            "source/.next/static/a.js": b"// synthetic static\n",
        }
        files = {name: {"kind": "file", "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "executable": False}
                 for name, data in payload.items()}
        manifest = {
            "schema": 1, "tag": module["TAG"], "commit": module["COMMIT"],
            "tree": module["TREE"], "tag_object": module["TAG_OBJECT"],
            "artifact_kind": "operator-trusted-builder-not-official-signed-binary",
            "source_signer": module["FINGERPRINT"], "official_source_archive_sha256": module["ARCHIVE_SHA256"],
            "source_tree_checked_before_and_after_build": True,
            "runtime": {"node": "v22.22.1", "platform": "linux", "arch": "x64", "glibc": "2.36", "abi": "127"},
            "limits": {"memory_bytes": 4 * 1024**3, "memory_swap_bytes": 4 * 1024**3, "cpus": 2,
                       "node_heap_mib": 2560, "published_ports": [], "build_network": "none"},
            "image_digest": module["IMAGE"], "image_id": "sha256:" + "a" * 64,
            "builder": {"workflow_commit": "b" * 40, "run_id": "123", "run_attempt": "1"},
            "lockfile_sha256": files["source/package-lock.json"]["sha256"], "files": files,
        }
        if mutate_manifest:
            mutate_manifest(manifest)
        payload["build-manifest.json"] = json.dumps(manifest).encode()
        archive = Path(directory, "fixture.tar.gz")
        with tarfile.open(archive, "w:gz") as stream:
            for name in ("source/", "source/.next/", "source/.next/standalone/", "source/.next/static/"):
                item = tarfile.TarInfo(name)
                item.type, item.mode = tarfile.DIRTYPE, 0o700
                stream.addfile(item)
            for name, data in payload.items():
                item = tarfile.TarInfo(name)
                item.size, item.mode = len(data), 0o600
                stream.addfile(item, io.BytesIO(data))
            for item in extra:
                stream.addfile(item)
        return archive

    def verify(self, *args, **kwargs):
        with tempfile.TemporaryDirectory(prefix="nc-private-bundle-test-") as directory:
            archive = self.fixture(directory, *args, **kwargs)
            with contextlib.redirect_stdout(io.StringIO()):
                module["verify"](archive)

    def test_valid_private_bundle(self):
        self.verify()

    def test_changed_digest_rejected(self):
        with self.assertRaises(ValueError):
            self.verify(mutate_manifest=lambda item: item["files"]["source/package.json"].update(sha256="0" * 64))

    def test_wrong_commit_rejected(self):
        with self.assertRaises(AssertionError):
            self.verify(mutate_manifest=lambda item: item.update(commit="0" * 40))

    def test_private_environment_rejected(self):
        with self.assertRaises(ValueError):
            self.verify(extra=[tarfile.TarInfo("source/.env.local")])

    def test_path_traversal_rejected(self):
        with self.assertRaises(ValueError):
            self.verify(extra=[tarfile.TarInfo("source/../outside")])

    def test_git_metadata_rejected(self):
        with self.assertRaises(ValueError):
            self.verify(extra=[tarfile.TarInfo("source/.git/config")])

    def test_chained_symlink_escape_rejected(self):
        with self.assertRaises(ValueError):
            module["normalized_target"]("source/a", "link/../outside", {"source/link": "."})

    def test_normal_node_modules_symlink_allowed(self):
        module["normalized_target"]("source/.next/standalone/node_modules/.bin/tool", "../tool/main.js")

    def test_cyclic_symlinks_rejected(self):
        with self.assertRaises(ValueError):
            module["normalized_target"]("source/a", "b", {"source/a": "b", "source/b": "a"})

    def test_duplicate_path_rejected(self):
        with self.assertRaises(ValueError):
            self.verify(extra=[tarfile.TarInfo("source/package.json")])

    def test_special_permissions_rejected(self):
        item = tarfile.TarInfo("source/setid")
        item.mode = 0o4755
        with self.assertRaises(ValueError):
            self.verify(extra=[item])

    def test_hardlinks_rejected(self):
        item = tarfile.TarInfo("source/hardlink")
        item.type, item.linkname = tarfile.LNKTYPE, "source/package.json"
        with self.assertRaises(ValueError):
            self.verify(extra=[item])

    def test_devices_rejected(self):
        item = tarfile.TarInfo("source/device")
        item.type = tarfile.CHRTYPE
        with self.assertRaises(ValueError):
            self.verify(extra=[item])

    def test_wrong_architecture_rejected(self):
        with self.assertRaises(AssertionError):
            self.verify(mutate_manifest=lambda item: item["runtime"].update(arch="arm64"))

    def test_wrong_image_rejected(self):
        with self.assertRaises(AssertionError):
            self.verify(mutate_manifest=lambda item: item.update(image_digest="node@sha256:" + "0" * 64))

    def test_relaxed_memory_limit_rejected(self):
        with self.assertRaises(AssertionError):
            self.verify(mutate_manifest=lambda item: item["limits"].update(memory_bytes=8 * 1024**3))

    def test_symlink_build_root_rejected(self):
        with tempfile.TemporaryDirectory(prefix="nc-build-root-test-") as directory:
            Path(directory, ".next").symlink_to("/tmp", target_is_directory=True)
            with self.assertRaises(ValueError):
                module["check_build_output"](directory)

    def test_symlink_build_id_rejected(self):
        with tempfile.TemporaryDirectory(prefix="nc-build-id-test-") as directory:
            root = Path(directory)
            (root / ".next/standalone").mkdir(parents=True)
            (root / ".next/static").mkdir()
            (root / ".next/standalone/server.js").write_bytes(b"// synthetic")
            (root / ".next/BUILD_ID").symlink_to("/dev/null")
            with self.assertRaises(ValueError):
                module["check_build_output"](directory)


class SourceChecks(unittest.TestCase):
    def compare(self, mutate):
        with tempfile.TemporaryDirectory(prefix="nc-source-compare-test-") as directory:
            reference = Path(directory, "reference")
            reference.mkdir()
            (reference / "package.json").write_text('{"version":"0.1.0-preview.41"}')
            (reference / "package-lock.json").write_text('{"version":"0.1.0-preview.41","packages":{"":{"version":"0.1.0-preview.41"}}}')
            (reference / "readme.txt").write_text("signed source\n")
            candidate = Path(directory, "candidate")
            shutil.copytree(reference, candidate)
            (reference / ".git").mkdir()
            (reference / ".git/config").write_text("synthetic reference metadata\n")
            mutate(candidate)
            with contextlib.redirect_stdout(io.StringIO()):
                module["compare_source"](reference, candidate)

    def test_unmodified_source_allowed(self):
        self.compare(lambda root: None)

    def test_changed_source_rejected(self):
        with self.assertRaises(ValueError):
            self.compare(lambda root: (root / "readme.txt").write_text("changed\n"))

    def test_extra_environment_rejected(self):
        with self.assertRaises(ValueError):
            self.compare(lambda root: (root / ".env.local").write_text("SYNTHETIC=value\n"))

    def test_executable_bit_change_rejected(self):
        with self.assertRaises(ValueError):
            self.compare(lambda root: (root / "readme.txt").chmod(0o700))

    def test_group_access_does_not_change_signed_executable_mode(self):
        self.compare(lambda root: (root / "readme.txt").chmod(0o660))


class WorkflowChecks(unittest.TestCase):
    def test_operator_boundary(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github/workflows/operator-preview41-bundle.yml").read_text()
        helper = (root / "tools/build-operator-preview41.sh").read_text()
        self.assertIn("on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n", workflow)
        self.assertIn("github.repository == 'pisob/neurocheckout-community' && github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'", workflow)
        for required in ("runs-on: ubuntu-24.04", "persist-credentials: false", "timeout-minutes: 50",
                         "if-no-files-found: error", "retention-days: 7", "overwrite: false"):
            self.assertIn(required, workflow)
        self.assertNotIn("secrets.", workflow)
        self.assertNotIn("contents: write", workflow)
        self.assertNotIn("gh release", helper)
        self.assertNotIn("docker.sock", helper)
        self.assertIn("--memory=4g --memory-swap=4g --cpus=2", helper)
        self.assertIn("--network=none", helper)
        self.assertIn(module["IMAGE"], helper)

if __name__ == "__main__":
    unittest.main()
