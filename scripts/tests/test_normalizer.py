from transform.normalizer import normalize_name, normalize_address, extract_sido_sigungu


def test_normalize_name_strips_whitespace_and_parens():
    assert normalize_name("  (새)지곡백화점약국  ") == "지곡백화점약국"
    assert normalize_name("1(일)약국") == "1약국"


def test_normalize_name_removes_common_suffixes():
    assert normalize_name("테스트약국") == "테스트약국"


def test_normalize_address_simplifies():
    addr = "서울특별시 강남구 테헤란로 10, 1층 (역삼동)"
    result = normalize_address(addr)
    assert "역삼동" not in result
    assert "1층" not in result
    assert "서울특별시" in result


def test_extract_sido_sigungu():
    sido, sigungu = extract_sido_sigungu("서울특별시 강남구 테헤란로 10")
    assert sido == "서울"
    assert sigungu == "강남구"

    sido2, sigungu2 = extract_sido_sigungu("경기도 수원시 팔달구 중부대로 93")
    assert sido2 == "경기"
    assert sigungu2 == "수원팔달구"
