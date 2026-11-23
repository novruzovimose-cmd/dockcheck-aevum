"""Exercise the extracted binary on its native OS and verify every packaged file."""
import hashlib
import json
from pathlib import Path
import platform
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import urlopen
import zipfile

archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory() as scratch:
    work = Path(scratch)
    with zipfile.ZipFile(archive) as z:
        z.extractall(work)
    root = work / "DockCheck"
    manifest = {}
    for line in (root / "SHA256SUMS").read_text().splitlines():
        checksum, name = line.split("  ", 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == checksum, name
        manifest[name] = checksum
    assert set(manifest) == {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p != root / "SHA256SUMS"}
    for name in manifest:
        assert all(part not in {".git", ".dockcheck", "node_modules", ".env", "runtime-output", "inbox"} for part in Path(name).parts)
    with tarfile.open(root / "delivery/dockcheck-linux-amd64.tar") as image:
        entry = json.load(image.extractfile("manifest.json"))[0]
        config = json.load(image.extractfile(entry["Config"]))
        raw = image.extractfile(entry["Layers"][0]).read()
        assert config["rootfs"]["diff_ids"] == ["sha256:" + hashlib.sha256(raw).hexdigest()]
        version = json.loads((root / "package.json").read_text())["version"]
        assert entry["RepoTags"] == ["dockcheck:" + version]
    windows = platform.system() == "Windows"
    binary = root / "delivery" / ("dockcheck-windows-amd64.exe" if windows else "dockcheck-linux-amd64")
    binary.chmod(0o755)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1",0))
        port = probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    process = subprocess.Popen([str(binary), "-listen", "127.0.0.1:" + str(port), "-root", str(root/"dist")])
    try:
        for attempt in range(100):
            try:
                with urlopen(url, timeout=2) as r: assert b"Receipt lookup" in r.read()
                break
            except OSError:
                if process.poll() is not None: raise
                time.sleep(.05)
        else: raise RuntimeError("Server did not start.")
        for name in ["desk.js", "desk.css", "standard-input.json", "local-evm.js"]:
            with urlopen(url+"/"+name, timeout=5) as r:
                assert hashlib.sha256(r.read()).hexdigest() == manifest["dist/"+name]
    finally:
        process.terminate()
        process.wait(timeout=10)
print("Verified archive and native application on",platform.system(),platform.machine())
