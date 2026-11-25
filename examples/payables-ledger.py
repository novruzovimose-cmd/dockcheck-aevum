"""Import an entry produced by the verifier. Run only with locally verified input."""
import json
import sqlite3
import sys
from pathlib import Path


def post(database, entry):
    # Financial fields are immutable. A later verified exception may enrich an entry.
    key = entry["entryId"]
    core = {k: entry[k] for k in ("chainId", "carrier", "accepted", "amountBaseUnits", "transactionHash", "blockHash")}
    core = json.dumps(core, sort_keys=True)
    inspection = entry["inspection"]
    evidence = json.dumps(inspection, sort_keys=True) if inspection is not None else None
    conn = sqlite3.connect(database)
    try:
        with conn:
            conn.execute("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, movement TEXT NOT NULL, inspection TEXT)")
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT movement, inspection FROM payments WHERE id=?", (key,)).fetchone()
            if row is None:
                conn.execute("INSERT INTO payments VALUES (?, ?, ?)", (key, core, evidence))
                return "posted"
            if row[0] != core or (row[1] and evidence and row[1] != evidence):
                raise ValueError("Conflicting evidence for an existing payment. Review before booking.")
            if evidence and row[1] is None:
                conn.execute("UPDATE payments SET inspection=? WHERE id=?", (evidence, key))
                return "attached inspection"
            return "already posted"
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python examples/payables-ledger.py LEDGER.sqlite VERIFIED_ENTRY.json")
    print(post(sys.argv[1], json.loads(Path(sys.argv[2]).read_text())))
