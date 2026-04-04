import csv


def parse_localdata_csv(path: str, encoding: str = "euc-kr") -> list[dict]:
    """Parse LOCALDATA pharmacy CSV. Returns only 영업/정상 (code 01) rows."""
    results = []
    with open(path, encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("영업상태구분코드", "").strip() != "01":
                continue
            x_raw = row.get("좌표정보x(epsg5174)", "").strip()
            y_raw = row.get("좌표정보y(epsg5174)", "").strip()
            results.append({
                "id": row.get("관리번호", "").strip(),
                "name": row.get("사업장명", "").strip(),
                "address": row.get("소재지전체주소", "").strip(),
                "road_address": row.get("도로명전체주소", "").strip(),
                "phone": row.get("소재지전화", "").strip(),
                "open_date": row.get("인허가일자", "").strip(),
                "business_status_code": row.get("영업상태구분코드", "").strip(),
                "business_status": row.get("영업상태명", "").strip(),
                "x_5174": float(x_raw) if x_raw else None,
                "y_5174": float(y_raw) if y_raw else None,
            })
    return results


def parse_animal_csv(path: str, encoding: str = "euc-kr") -> list[dict]:
    """Parse LOCALDATA animal pharmacy CSV. Returns only 영업/정상 rows."""
    results = []
    with open(path, encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("영업상태구분코드", "").strip() != "01":
                continue
            x_raw = row.get("좌표정보x(epsg5174)", "").strip()
            y_raw = row.get("좌표정보y(epsg5174)", "").strip()
            results.append({
                "id": row.get("관리번호", "").strip(),
                "name": row.get("사업장명", "").strip(),
                "address": row.get("소재지전체주소", "").strip(),
                "road_address": row.get("도로명전체주소", "").strip(),
                "phone": row.get("소재지전화", "").strip(),
                "x_5174": float(x_raw) if x_raw else None,
                "y_5174": float(y_raw) if y_raw else None,
            })
    return results
