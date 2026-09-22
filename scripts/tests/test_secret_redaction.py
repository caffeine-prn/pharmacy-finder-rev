import json
import logging
from pathlib import Path

from load.sync_log import _extract_errors, main
from utils.logger import setup_logger


def test_public_errors_redact_service_keys():
    text = '[ERROR] request failed ?serviceKey=private%2Bkey&other=1'
    result = _extract_errors(text)
    assert 'private' not in str(result)
    assert 'other=1' in str(result)


def test_existing_events_are_scrubbed_when_log_is_rewritten(tmp_path, monkeypatch):
    output = tmp_path / 'sync-log.json'
    output.write_text(json.dumps({'events': [{'id': 'old', 'errors': ['?serviceKey=old-secret&x=1']}]}))
    monkeypatch.setenv('SYNC_LOG_JSON_PATH', str(output))
    monkeypatch.setenv('SYNC_LOG_RAW_PATH', str(tmp_path / 'none.log'))
    monkeypatch.setenv('MARKERS_JSON_PATH', str(tmp_path / 'none.json'))
    main()
    assert 'old-secret' not in output.read_text()


def test_console_logger_redacts_credentials(capsys):
    logger = setup_logger('test_secret_redaction')
    logger.warning('failed %s', 'https://example.com?serviceKey=hidden-secret&x=1')
    assert 'hidden-secret' not in capsys.readouterr().out
    logger.handlers.clear()


def test_database_operation_log_redacts_error_urls():
    from unittest.mock import Mock
    from load.supabase_loader import log_sync
    client = Mock()
    log_sync(client, 'daily', '2026-09-22', 'failed', errors=['?serviceKey=db-secret&x=1'])
    payload = client.table.return_value.insert.call_args.args[0]
    assert 'db-secret' not in json.dumps(payload)
