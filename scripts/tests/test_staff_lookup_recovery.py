"""Regression coverage for discontinued HIRA endpoints and failed batches."""
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import Mock

import pytest

import run_staff_lookup_batch as batch
from sources import hira_staff


def test_lookup_uses_supported_endpoint(monkeypatch):
    # Given a successful wire response.
    request = Mock(return_value=BytesIO(b'<response><header><resultCode>00</resultCode></header><body><totalCount>0</totalCount></body></response>'))
    monkeypatch.setattr(hira_staff.urllib.request, 'urlopen', request)
    # When a pharmacy is queried.
    hira_staff.fetch_staff_lookup('test-key', 'test-ykiho')
    # Then the supported operation receives the request.
    assert '/MadmDtlInfoService2.8/getEtcHstInfo2.8?' in request.call_args.args[0].full_url


def test_permanent_http_failure_is_not_retried(monkeypatch):
    # Given a retired API endpoint.
    request = Mock(side_effect=HTTPError('https://example.test?serviceKey=secret', 400, 'bad request', {}, None))
    monkeypatch.setattr(hira_staff.urllib.request, 'urlopen', request)
    monkeypatch.setattr(hira_staff.time, 'sleep', Mock())
    # When the request fails.
    with pytest.raises(Exception):
        hira_staff.fetch_staff_lookup('test-key', 'test-ykiho')
    # Then a permanent failure consumes only one request.
    assert request.call_count == 1


def test_gateway_error_envelope_does_not_become_empty_staff():
    # Given a gateway-level service deletion error.
    xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>12</returnReasonCode><returnAuthMsg>SERVICE_NOT_FOUND</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'
    # When the response is parsed, then it must not be accepted as zero staff.
    with pytest.raises(ValueError):
        hira_staff.parse_staff_lookup_xml(xml)


def test_batch_stops_and_records_failure_when_endpoint_is_retired(monkeypatch):
    # Given two due pharmacies and a retired upstream operation.
    monkeypatch.setenv('DRUG_API_KEY', 'test-key')
    monkeypatch.setenv('STAFF_LOOKUP_FAIL_ON_ERROR', 'false')
    monkeypatch.setattr(batch, 'get_client', Mock())
    monkeypatch.setattr(batch, 'fetch_staff_lookup_due_candidates', Mock(return_value=[{'id': '1', 'ykiho': 'one'}, {'id': '2', 'ykiho': 'two'}]))
    request = Mock(side_effect=HTTPError('https://example.test', 400, 'bad request', {}, None))
    monkeypatch.setattr(hira_staff.urllib.request, 'urlopen', request)
    monkeypatch.setattr(hira_staff.time, 'sleep', Mock())
    freshness, sync = Mock(), Mock()
    monkeypatch.setattr(batch, 'update_freshness', freshness)
    monkeypatch.setattr(batch, 'log_sync', sync)
    # When the batch runs.
    result = batch.main()
    # Then it stops, records failure, and exits unsuccessfully.
    assert result == 1
    assert request.call_count == 1
    assert freshness.call_count == 0
    assert sync.call_args.args[3] == 'failed'
    assert sync.call_args.kwargs['metadata']['looked_up'] == 0


def test_transient_failure_retries_and_recovers(monkeypatch):
    # Given a temporarily unavailable upstream followed by a successful response.
    request = Mock(side_effect=[HTTPError('https://example.test', 503, 'unavailable', {}, None), BytesIO(b'<response><header><resultCode>00</resultCode></header><body><totalCount>0</totalCount></body></response>')])
    monkeypatch.setattr(hira_staff.urllib.request, 'urlopen', request)
    monkeypatch.setattr(hira_staff.time, 'sleep', Mock())
    # When the request is made.
    result = hira_staff.fetch_staff_lookup('test-key', 'test-ykiho')
    # Then a transient outage can recover without being marked permanent.
    assert result == ([], 0)
    assert request.call_count == 2


def test_empty_success_batch_stays_successful(monkeypatch):
    # Given no due pharmacies.
    monkeypatch.setenv('DRUG_API_KEY', 'test-key')
    monkeypatch.setattr(batch, 'get_client', Mock())
    monkeypatch.setattr(batch, 'fetch_staff_lookup_due_candidates', Mock(return_value=[]))
    monkeypatch.setattr(batch, 'update_freshness', Mock())
    sync = Mock()
    monkeypatch.setattr(batch, 'log_sync', sync)
    # When the scheduled batch runs.
    result = batch.main()
    # Then no work remains a successful run.
    assert result == 0
    assert sync.call_args.args[3] == 'success'
