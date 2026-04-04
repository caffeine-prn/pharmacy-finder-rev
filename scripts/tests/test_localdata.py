import os
import zipfile
from sources.localdata import download_and_parse_pharmacy

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def test_download_and_parse_pharmacy_from_local_zip(tmp_path):
    csv_path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    zip_path = tmp_path / "test.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(csv_path, "fulldata_01_01_06_P_yakguk.csv")
    rows = download_and_parse_pharmacy(local_zip_path=str(zip_path))
    assert len(rows) == 2
    assert rows[0]["name"] == "테스트약국"
