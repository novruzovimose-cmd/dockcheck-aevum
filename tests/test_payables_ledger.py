import json
import runpy
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
post = runpy.run_path(str(ROOT/"examples/payables-ledger.py"))["post"]


class PostingTest(unittest.TestCase):
    def test_retry_enrichment_and_conflict(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp)/"ledger.sqlite"
            entry = json.loads((ROOT/"evidence/local-run.json").read_text())["payable"]
            bare = dict(entry, inspection=None)
            self.assertEqual(post(db,bare),"posted")
            self.assertEqual(post(db,entry),"attached inspection")
            self.assertEqual(post(db,bare),"already posted")
            with self.assertRaises(ValueError):
                post(db,dict(entry, amountBaseUnits="1"))
            with self.assertRaises(ValueError):
                post(db,dict(entry, inspection=dict(entry["inspection"],held=10)))
            with sqlite3.connect(db) as conn:
                rows = conn.execute("SELECT inspection FROM payments").fetchall()
            self.assertEqual([json.loads(row[0]) for row in rows], [entry["inspection"]])


if __name__ == "__main__":
    unittest.main()
