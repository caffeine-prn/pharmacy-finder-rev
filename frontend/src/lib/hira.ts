const HIRA_PHARMACY_INFO_URL = "https://www.hira.or.kr/ra/hosp/hospInfoAjax.do";

export function getHiraPharmacyInfoUrl(ykiho: string | null | undefined) {
  if (!ykiho) return "";
  return `${HIRA_PHARMACY_INFO_URL}?ykiho=${encodeURIComponent(ykiho)}`;
}
