from datetime import datetime, timezone
from types import SimpleNamespace

from load.supabase_loader import fetch_staff_lookup_due_candidates


class Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, columns):
        return self

    def eq(self, key, value):
        self.rows = [row for row in self.rows if row.get(key) == value]
        return self

    def order(self, key):
        self.rows = sorted(self.rows, key=lambda row: row.get(key, ''))
        return self

    def range(self, start, end):
        self.rows = self.rows[start:end + 1]
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class Client:
    def __init__(self, pharmacies, raw=(), staff=()):
        self.tables = {'pharmacies': pharmacies, 'hira_staff_lookup_raw': list(raw), 'pharmacy_staff': list(staff)}

    def table(self, name):
        return Query(self.tables[name])


def pharmacy(ykiho, fetched=None):
    return {'id': ykiho, 'ykiho': ykiho, 'has_ykiho': True, 'hira_staff_fetched_at': fetched}


def test_true_unseen_precedes_null_summary_with_raw_api_evidence():
    # Given a null summary with old API evidence and an actually unseen pharmacy.
    client = Client([pharmacy('a-seen'), pharmacy('z-unseen')], [{'ykiho': 'a-seen', 'fetched_at': '2020-01-01T00:00:00+00:00'}])
    # When selecting the next pharmacy.
    result = fetch_staff_lookup_due_candidates(client, 1)
    # Then only the truly unseen pharmacy receives first priority.
    assert [row['ykiho'] for row in result] == ['z-unseen']


def test_latest_raw_evidence_excludes_recently_queried_null_summary():
    # Given multiple raw staff rows with one recent lookup.
    recent = datetime.now(timezone.utc).isoformat()
    client = Client([pharmacy('seen')], [{'ykiho': 'seen', 'fetched_at': '2020-01-01T00:00:00+00:00'}, {'ykiho': 'seen', 'fetched_at': recent}])
    # When the daily cutoff applies, then no redundant query is selected.
    assert fetch_staff_lookup_due_candidates(client, 10) == []


def test_on_demand_staff_is_fallback_but_quarterly_staff_is_not_api_evidence():
    # Given an on-demand lookup and a quarterly-only pharmacy.
    client = Client([pharmacy('a-api'), pharmacy('z-quarterly')], staff=[{'ykiho': 'a-api', 'data_period': 'on_demand', 'updated_at': '2020-01-01T00:00:00+00:00'}, {'ykiho': 'z-quarterly', 'data_period': '2020Q1', 'updated_at': '2020-01-01T00:00:00+00:00'}])
    # When prioritizing unseen pharmacies, then quarterly data does not count as an API query.
    assert fetch_staff_lookup_due_candidates(client, 1)[0]['ykiho'] == 'z-quarterly'


def test_summary_timestamp_keeps_zero_result_lookup_out_of_unseen_priority():
    # Given successful zero-result summary and an older cached pharmacy.
    client = Client([pharmacy('a-zero', '2022-01-01T00:00:00+00:00'), pharmacy('z-older')], [{'ykiho': 'z-older', 'fetched_at': '2021-01-01T00:00:00+00:00'}])
    # When sorting due lookups, then effective lookup age determines priority.
    assert [row['ykiho'] for row in fetch_staff_lookup_due_candidates(client, 10)] == ['z-older', 'a-zero']
