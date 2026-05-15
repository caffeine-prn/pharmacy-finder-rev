from sources.mois_api import (
    parse_mois_response,
    normalize_mois_record,
    build_raw_rows,
)


def test_parse_mois_response_reads_items_and_total_count():
    payload = {
        "response": {
            "header": {"resultCode": "0", "resultMsg": "정상"},
            "body": {
                "totalCount": 2,
                "items": {
                    "item": [
                        {"MNG_NO": "P1", "BPLC_NM": "새약국"},
                        {"MNG_NO": "P2", "BPLC_NM": "헌약국"},
                    ]
                },
            },
        }
    }

    items, total_count = parse_mois_response(payload)

    assert total_count == 2
    assert [item["MNG_NO"] for item in items] == ["P1", "P2"]


def test_normalize_mois_record_maps_active_pharmacy_fields():
    row = {
        "MNG_NO": "PHMD120260000000000000001",
        "BPLC_NM": "휴베이스 알찬약국",
        "LOTNO_ADDR": "울산광역시 동구 화정동 1",
        "ROAD_NM_ADDR": "울산광역시 동구 대학길 30, 1층 (화정동)",
        "TELNO": "052-000-0000",
        "LCPMT_YMD": "2026-04-03",
        "SALS_STTS_CD": "01",
        "SALS_STTS_NM": "영업/정상",
        "DTL_SALS_STTS_CD": "01",
        "DTL_SALS_STTS_NM": "영업중",
        "CLSBIZ_YMD": "",
        "DAT_UPDT_PNT": "2026-05-11 22:31:27",
        "CRD_INFO_X": "419479.171665252",
        "CRD_INFO_Y": "224760.554638586",
    }

    record = normalize_mois_record(row, source="pharmacy")

    assert record == {
        "id": "PHMD120260000000000000001",
        "name": "휴베이스 알찬약국",
        "address": "울산광역시 동구 화정동 1",
        "road_address": "울산광역시 동구 대학길 30, 1층 (화정동)",
        "phone": "052-000-0000",
        "open_date": "2026-04-03",
        "mois_license_date": "2026-04-03",
        "mois_closed_date": None,
        "mois_detail_status_code": "01",
        "mois_detail_status_name": "영업중",
        "mois_data_updated_at": "2026-05-11T22:31:27",
        "business_status_code": "01",
        "business_status": "영업/정상",
        "x_5174": 419479.171665252,
        "y_5174": 224760.554638586,
        "source": "mois_api",
    }


def test_normalize_mois_record_skips_non_active_rows():
    row = {
        "MNG_NO": "P2",
        "BPLC_NM": "폐업약국",
        "SALS_STTS_CD": "03",
        "SALS_STTS_NM": "폐업",
    }

    assert normalize_mois_record(row, source="pharmacy") is None


def test_build_raw_rows_preserves_original_payload_for_upsert():
    rows = [
        {
            "MNG_NO": "P1",
            "BPLC_NM": "새약국",
            "SALS_STTS_CD": "01",
            "SALS_STTS_NM": "영업/정상",
            "DTL_SALS_STTS_CD": "01",
            "DTL_SALS_STTS_NM": "영업중",
            "LCPMT_YMD": "2026-04-03",
            "CLSBIZ_YMD": "",
            "DAT_UPDT_PNT": "2026-05-11 22:31:27",
            "CRD_INFO_X": "200000.1",
            "CRD_INFO_Y": "450000.2",
        }
    ]

    raw = build_raw_rows(rows, source="pharmacy")

    assert raw[0]["source"] == "pharmacy"
    assert raw[0]["mng_no"] == "P1"
    assert raw[0]["name"] == "새약국"
    assert raw[0]["status_code"] == "01"
    assert raw[0]["detail_status_name"] == "영업중"
    assert raw[0]["license_date"] == "2026-04-03"
    assert raw[0]["closed_date"] is None
    assert raw[0]["data_updated_at"] == "2026-05-11T22:31:27"
    assert raw[0]["x_5174"] == 200000.1
    assert raw[0]["raw"]["BPLC_NM"] == "새약국"
