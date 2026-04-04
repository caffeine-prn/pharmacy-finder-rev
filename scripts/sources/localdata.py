import os
import tempfile
import zipfile
import requests
from utils.csv_parser import parse_localdata_csv, parse_animal_csv

PHARMACY_URL = "https://www.localdata.go.kr/datafile/each/01_01_06_P_CSV.zip"
ANIMAL_URL = "https://www.localdata.go.kr/datafile/each/02_03_02_P_CSV.zip"


def _download_zip(url: str, dest: str) -> str:
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        f.write(resp.content)
    return dest


def _extract_csv_from_zip(zip_path: str, tmp_dir: str) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            data = zf.read(info.filename)
            csv_path = os.path.join(tmp_dir, "extracted.csv")
            with open(csv_path, "wb") as f:
                f.write(data)
            return csv_path
    raise FileNotFoundError("No file found in ZIP")


def download_and_parse_pharmacy(local_zip_path: str = None) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        if local_zip_path:
            zip_path = local_zip_path
        else:
            zip_path = os.path.join(tmp_dir, "pharmacy.zip")
            _download_zip(PHARMACY_URL, zip_path)
        csv_path = _extract_csv_from_zip(zip_path, tmp_dir)
        return parse_localdata_csv(csv_path)


def download_and_parse_animal(local_zip_path: str = None) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        if local_zip_path:
            zip_path = local_zip_path
        else:
            zip_path = os.path.join(tmp_dir, "animal.zip")
            _download_zip(ANIMAL_URL, zip_path)
        csv_path = _extract_csv_from_zip(zip_path, tmp_dir)
        return parse_animal_csv(csv_path)
