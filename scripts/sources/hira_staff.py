import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import openpyxl


STAFF_LOOKUP_URL = "https://apis.data.go.kr/B551182/MadmDtlInfoService2.7/getEtcHstInfo2.7"


def parse_staff_xlsx(path: str) -> dict[str, dict]:
    """Parse HIRA quarterly staff XLSX. Returns {ykiho: {pharmacist: N, herbal_pharmacist: M}}.
    Filters to 071 (약사) and 072 (한약사) only.
    """
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    result = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) < 5:
            continue
        ykiho = str(row[0] or "").strip()
        code = str(row[2] or "").strip()
        count = int(row[4] or 0)
        if not ykiho or code not in ("071", "072"):
            continue
        if ykiho not in result:
            result[ykiho] = {"pharmacist": 0, "herbal_pharmacist": 0}
        if code == "071":
            result[ykiho]["pharmacist"] += count
        elif code == "072":
            result[ykiho]["herbal_pharmacist"] += count
    wb.close()
    return result


def _text(item: ET.Element, tag: str) -> str:
    return (item.findtext(tag) or "").strip()


def parse_staff_lookup_xml(xml_text: str) -> tuple[list[dict], int]:
    """Parse HIRA on-demand staff XML from getEtcHstInfo2.7."""
    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode", "")
    if result_code and result_code != "00":
        raise ValueError(f"HIRA staff API error: {root.findtext('.//resultMsg', 'unknown')}")

    total_count = int(root.findtext(".//totalCount", "0") or "0")
    rows = []
    for item in root.findall(".//item"):
        raw = {child.tag: child.text for child in item}
        count_text = _text(item, "gnlNopCnt")
        rows.append({
            "ykiho": _text(item, "ykiho"),
            "pharmacy_name": _text(item, "yadmNm"),
            "staff_type_code": _text(item, "gnlNopDtlCd"),
            "staff_type_name": _text(item, "dtlGnlNopCdNm"),
            "staff_count": int(count_text or "0"),
            "raw": raw,
        })
    return rows, total_count


def fetch_staff_lookup(
    api_key: str,
    ykiho: str,
    page_size: int = 100,
    max_retries: int = 3,
) -> tuple[list[dict], int]:
    """Fetch current HIRA staff composition for one pharmacy ykiho."""
    encoded_key = urllib.parse.quote(api_key, safe="")
    query = urllib.parse.urlencode({
        "pageNo": 1,
        "numOfRows": page_size,
        "ykiho": ykiho,
    })
    url = f"{STAFF_LOOKUP_URL}?serviceKey={encoded_key}&{query}"

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                xml_text = resp.read().decode("utf-8")
            return parse_staff_lookup_xml(xml_text)
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep((attempt + 1) * 3)
            else:
                raise e
    return [], 0


def sum_staff_count(rows: list[dict], code: str, name: str) -> int:
    return sum(
        int(row.get("staff_count") or 0)
        for row in rows
        if row.get("staff_type_code") == code or row.get("staff_type_name") == name
    )
