from load.supabase_loader import _parse_timestamp, upsert_mois_raw, upsert_pharmacies, upsert_staff


class _ExecuteResult:
    data = []


class _Query:
    def __init__(self, table_name, calls):
        self.table_name = table_name
        self.calls = calls
        self.data = []

    def select(self, columns):
        self.columns = columns
        return self

    def range(self, start, end):
        self.calls.append((self.table_name, "select", start, end))
        self.data = [{"id": "existing-localdata-id", "ykiho": "Y1"}]
        return self

    def in_(self, column, values):
        self.calls.append((self.table_name, "select", column, values))
        self.data = [
            {"id": "existing-localdata-id", "ykiho": "Y1"}
            for value in values
            if value == "Y1"
        ]
        return self

    def upsert(self, rows, on_conflict):
        self.calls.append((self.table_name, rows, on_conflict))
        return self

    def execute(self):
        return self


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


def test_upsert_pharmacies_reuses_existing_id_for_ykiho_conflict():
    client = _Client()
    pharmacies = [
        {
            "id": "new-localdata-id",
            "ykiho": "Y1",
            "name": "테스트약국",
            "longitude": 127.1,
            "latitude": 37.5,
            "mois_license_date": "2026-04-03",
            "mois_closed_date": "",
            "mois_detail_status_name": "영업중",
            "hira_open_date": "20260403",
            "hira_last_event_type": "개업",
            "hira_last_event_date": "20260403",
        }
    ]

    count = upsert_pharmacies(client, pharmacies)

    assert count == 1
    upsert_call = [call for call in client.calls if call[0] == "pharmacies" and call[2] == "id"][0]
    assert upsert_call[1][0]["id"] == "existing-localdata-id"
    assert upsert_call[1][0]["localdata_id"] == "new-localdata-id"
    assert upsert_call[1][0]["mois_license_date"] == "2026-04-03"
    assert upsert_call[1][0]["mois_closed_date"] is None
    assert upsert_call[1][0]["hira_open_date"] == "2026-04-03"
    assert upsert_call[1][0]["hira_last_event_date"] == "2026-04-03"


def test_upsert_staff_skips_api_refreshed_ykihos():
    client = _Client()
    staff = {
        "Y1": {"pharmacist": 1, "herbal_pharmacist": 1},
        "Y2": {"pharmacist": 2, "herbal_pharmacist": 0},
    }

    count = upsert_staff(client, staff, "2025.6", skip_ykihos={"Y1"})

    assert count == 1
    upsert_call = client.calls[0]
    assert upsert_call[0] == "pharmacy_staff"
    assert upsert_call[2] == "ykiho,staff_type_code"
    assert [row["ykiho"] for row in upsert_call[1]] == ["Y2"]
    assert upsert_call[1][0]["staff_count"] == 2


def test_parse_timestamp_accepts_supabase_fractional_timezone_variants():
    assert _parse_timestamp("2026-05-15T12:11:45.93187+00:00").isoformat() == (
        "2026-05-15T12:11:45.931870+00:00"
    )
    assert _parse_timestamp("2026-05-15 12:11:45.93187+00").isoformat() == (
        "2026-05-15T12:11:45.931870+00:00"
    )
