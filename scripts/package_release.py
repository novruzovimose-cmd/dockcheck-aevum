"""Build the offline distribution from tracked sources and a freshly built desk."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
OUTPUT = ROOT / "release"
TAG = f"dockcheck:{VERSION}"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def add_tar(archive, name, data, mode=0o644):
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    entry.mode = mode
    archive.addfile(entry, io.BytesIO(data))


def build_server(target, output):
    subprocess.run(
        [os.environ.get("GO_BIN", "go"), "build", "-trimpath", "-buildvcs=false",
         "-ldflags=-s -w -buildid=", "-o", str(output), "container/main.go"],
        cwd=ROOT, env={**os.environ, "CGO_ENABLED": "0", "GOOS": target, "GOARCH": "amd64"},
        check=True,
    )


def docker_archive(output, server, assets):
    # Docker image save format. The config identifies its uncompressed rootfs by hash.
    layer = io.BytesIO()
    with tarfile.open(fileobj=layer, mode="w") as tar:
        add_tar(tar, "desk", server.read_bytes(), 0o755)
        add_tar(tar, "licenses/Go.txt", (ROOT / "licenses/Go.txt").read_bytes())
        for asset in assets:
            add_tar(tar, "www/" + asset.relative_to(ROOT / "dist").as_posix(), asset.read_bytes())
    raw = layer.getvalue()
    config = json.dumps({
        "architecture": "amd64", "os": "linux",
        "config": {"Entrypoint": ["/desk"], "User": "65532:65532", "ExposedPorts": {"8080/tcp": {}}},
        "rootfs": {"type": "layers", "diff_ids": ["sha256:" + digest(raw)]},
        "history": [{"created_by": "DockCheck release builder"}],
    }, separators=(",", ":")).encode()
    config_name = digest(config) + ".json"
    layer_name = digest(raw) + "/layer.tar"
    manifest = [{"Config": config_name, "RepoTags": [TAG], "Layers": [layer_name]}]
    with tarfile.open(output, "w") as tar:
        add_tar(tar, config_name, config)
        add_tar(tar, layer_name, raw)
        add_tar(tar, "manifest.json", json.dumps(manifest).encode())


def package():
    OUTPUT.mkdir(exist_ok=True)
    sources = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    files = {name: ROOT / name for name in sources if name}
    assets = sorted(p for p in (ROOT / "dist").rglob("*") if p.is_file())
    for required in ["index.html", "desk.js", "desk.css", "local-evm.js", "standard-input.json"]:
        if ROOT / "dist" / required not in assets:
            raise SystemExit("Build the desk before packaging: missing " + required)
    for asset in assets:
        files[asset.relative_to(ROOT).as_posix()] = asset
    with tempfile.TemporaryDirectory(dir=OUTPUT) as scratch:
        work = Path(scratch)
        windows, linux = work / "dockcheck-windows-amd64.exe", work / "dockcheck-linux-amd64"
        build_server("windows", windows)
        build_server("linux", linux)
        image = work / "dockcheck-linux-amd64.tar"
        docker_archive(image, linux, assets)
        for p in [windows, linux, image]:
            files["delivery/" + p.name] = p
        sums = []
        target = OUTPUT / f"DockCheck-{VERSION}.zip"
        temp_zip = work / "package.zip"
        with zipfile.ZipFile(temp_zip, "w") as z:
            def write(name, content, executable=False):
                entry = zipfile.ZipInfo("DockCheck/" + name, (2020, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = (0o100755 if executable else 0o100644) << 16
                z.writestr(entry, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
            for name, source in sorted(files.items()):
                data = source.read_bytes()
                write(name, data, name == "delivery/dockcheck-linux-amd64")
                sums.append(f"{digest(data)}  {name}\n")
            write("SHA256SUMS", "".join(sums).encode())
        with zipfile.ZipFile(temp_zip) as z:
            if z.testzip() is not None:
                raise ValueError("ZIP integrity check failed")
        temp_zip.replace(target)
        (OUTPUT / (target.name + ".sha256")).write_text(digest(target.read_bytes()) + "  " + target.name + "\n")
        print(target)


if __name__ == "__main__":
    package()
