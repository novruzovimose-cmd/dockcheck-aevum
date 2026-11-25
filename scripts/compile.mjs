import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const directory = "artifacts";
fs.mkdirSync(directory, { recursive: true });
for (const [file, name] of [
  ["contracts/DockCheck.sol", "DockCheck"],
  ["contracts/DeliveryReserve.sol", "DeliveryReserve"],
  ["contracts/test/RehearsalToken.sol", "RehearsalToken"],
]) {
  const sources = {};
  function include(key) {
    if (sources[key]) return;
    const content = fs.readFileSync(
      key.startsWith("@") ? path.join("node_modules", key) : key,
      "utf8",
    );
    sources[key] = { content };
    for (const match of content.matchAll(/^import\s+.*?["']([^"']+)["'];/gm)) {
      include(
        match[1].startsWith(".")
          ? path.posix.normalize(
              path.posix.join(path.posix.dirname(key), match[1]),
            )
          : match[1],
      );
    }
  }
  include(file);
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            ...(name === "DeliveryReserve" ? ["evm.deployedBytecode.immutableReferences"] : []),
            "metadata",
          ],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  for (const message of output.errors || []) {
    if (message.severity === "error") throw Error(message.formattedMessage);
    console.warn(message.formattedMessage);
  }
  const c = output.contracts[file][name];
  fs.writeFileSync(
    directory + "/" + name + ".json",
    JSON.stringify(
      {
        name,
        compiler: solc.version(),
        source: file,
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object,
        runtime: "0x" + c.evm.deployedBytecode.object,
        ...(name === "DeliveryReserve" ? {immutableReferences:c.evm.deployedBytecode.immutableReferences} : {}),
      },
      null,
      2,
    ) + "\n",
  );
  if (name === "DockCheck" || name === "DeliveryReserve")
    fs.writeFileSync(
      directory + (name === "DockCheck" ? "/standard-input.json" : "/reserve-standard-input.json"),
      JSON.stringify(input, null, 2) + "\n",
    );
  console.log(
    name,
    "compiled for Shanghai;",
    c.evm.deployedBytecode.object.length / 2,
    "runtime bytes",
  );
}
