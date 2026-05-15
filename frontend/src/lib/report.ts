import type { Pharmacy } from "@/lib/types";

const REPORT_FORM_BASE =
  "https://docs.google.com/forms/d/e/1FAIpQLSfHBe1ztCW35Go0H1SmCQ0DzedfopwhFPChwD9tx7sYPLVqqA/viewform";

export function buildReportUrl(pharmacy: Pick<Pharmacy, "name" | "address" | "road_address" | "phone">) {
  const params = new URLSearchParams({
    usp: "pp_url",
    "entry.1356240170": pharmacy.name,
    "entry.1318537606": pharmacy.road_address || pharmacy.address || "",
    "entry.1084600480": pharmacy.phone || "",
  });
  return `${REPORT_FORM_BASE}?${params.toString()}`;
}
