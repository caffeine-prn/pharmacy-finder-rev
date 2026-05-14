from load.supabase_loader import upsert_mois_raw


class _ExecuteResult:
    data = []


class _Query:
    def __init__(self, table_name, calls):
        self.table_name = table_name
        self.calls = calls

    def upsert(self, rows, on_conflict):
        self.calls.append((self.table_name, rows, on_conflict))
        return self

    def execute(self):
        return _ExecuteResult()


class _Client:
    def __init__(self):
        self.calls = []

    def table(self, table_name):
        return _Query(table_name, self.calls)


def test_upsert_mois_raw_batches_source_rows():
    client = _Client()
    rows = [
        {"source": "pharmacy", "mng_no": "P1", "raw": {"MNG_NO": "P1"}},
        {"source": "pharmacy", "mng_no": "P2", "raw": {"MNG_NO": "P2"}},
        {"source": "pharmacy", "mng_no": "P3", "raw": {"MNG_NO": "P3"}},
    ]

    count = upsert_mois_raw(client, rows, batch_size=2)

    assert count == 3
    assert client.calls[0][0] == "mois_facility_raw"
    assert client.calls[0][2] == "source,mng_no"
    assert [row["mng_no"] for row in client.calls[0][1]] == ["P1", "P2"]
    assert [row["mng_no"] for row in client.calls[1][1]] == ["P3"]
