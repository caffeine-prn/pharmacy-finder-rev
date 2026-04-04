import re

_SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라북도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주",
}

_SIGUNGU_MERGE = re.compile(r"^(.+[시군])\s+(.+[구])$")


def normalize_name(name: str) -> str:
    """Remove parenthetical prefixes, extra whitespace."""
    name = name.strip()
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"\s+", "", name)
    return name


def normalize_address(address: str) -> str:
    """Simplify address: remove parenthetical, comma-after content."""
    addr = address.strip()
    addr = re.sub(r"\(.*?\)", "", addr)
    addr = re.sub(r",.*$", "", addr)
    addr = addr.strip()
    return addr


def extract_sido_sigungu(address: str) -> tuple[str, str]:
    """Extract (sido_short, sigungu) from full address string."""
    parts = address.strip().split()
    if len(parts) < 2:
        return ("", "")

    sido_full = parts[0]
    sido = _SIDO_SHORT.get(sido_full, sido_full)

    sigungu_raw = parts[1] if len(parts) > 1 else ""
    if len(parts) > 2:
        combined = sigungu_raw + " " + parts[2]
        m = _SIGUNGU_MERGE.match(combined)
        if m:
            sigungu_raw = m.group(1).replace("시", "").replace("군", "") + m.group(2)

    return (sido, sigungu_raw)
