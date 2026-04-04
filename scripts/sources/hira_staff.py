import openpyxl


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
