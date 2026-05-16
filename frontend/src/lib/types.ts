// frontend/src/lib/types.ts

/** Abbreviated marker from CDN markers.json */
export interface MarkerData {
  id: string;
  n: string;    // name
  lng: number;
  lat: number;
  h: boolean;   // is_herbal_pharmacy
  hr?: boolean; // approved community report for unregistered herbal staff
  a: boolean;   // is_animal_pharmacy
  c: boolean;   // is_cross_employed
  y: boolean;   // has_ykiho
  s: string;    // sido
  g: string;    // sigungu
  p: string;    // phone
  o?: string;   // opening date (YYYY-MM-DD)
}

export interface MarkersJSON {
  generated_at: string;
  count: number;
  pharmacies: MarkerData[];
}

/** Full pharmacy record from Supabase */
export interface Pharmacy {
  id: string;
  ykiho: string | null;
  name: string;
  category: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  road_address: string | null;
  phone: string | null;
  open_date: string | null;
  mois_license_date: string | null;
  mois_closed_date: string | null;
  mois_detail_status_code: string | null;
  mois_detail_status_name: string | null;
  mois_data_updated_at: string | null;
  hira_open_date: string | null;
  hira_last_event_type: string | null;
  hira_last_event_date: string | null;
  hira_staff_fetched_at: string | null;
  hira_staff_total_count: number | null;
  longitude: number | null;
  latitude: number | null;
  business_status: string;
  has_ykiho: boolean;
  is_animal_pharmacy: boolean;
  is_herbal_pharmacy: boolean;
  is_cross_employed: boolean;
  pharmacist_count: number;
  herbal_pharmacist_count: number;
  hours_mon: string | null;
  hours_tue: string | null;
  hours_wed: string | null;
  hours_thu: string | null;
  hours_fri: string | null;
  hours_sat: string | null;
  hours_sun: string | null;
  hours_hol: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface PharmacyBadgeAssertion {
  id: string;
  pharmacy_id: string;
  badge_type: string;
  assertion_status: string;
  confidence: string;
  label: string;
  public_note: string;
  evidence_summary: string | null;
  report_count: number;
  first_reported_at: string | null;
  confirmed_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PharmacyBadgeReport {
  id: string;
  pharmacy_id: string;
  badge_type: string;
  report_status: string;
  evidence_type: string;
  description: string;
  reporter_contact: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  pharmacies?: Pick<Pharmacy, "id" | "name" | "sido" | "sigungu" | "road_address" | "address" | "has_ykiho" | "pharmacist_count" | "herbal_pharmacist_count" | "hira_staff_fetched_at">;
}

/** Pharmacy row for table view (subset of columns) */
export interface PharmacyTableRow {
  id: string;
  ykiho: string | null;
  name: string;
  address: string | null;
  road_address: string | null;
  phone: string | null;
  sido: string | null;
  sigungu: string | null;
  open_date: string | null;
  mois_license_date: string | null;
  hira_open_date: string | null;
  hira_staff_fetched_at: string | null;
  hira_staff_total_count: number | null;
  latitude: number | null;
  longitude: number | null;
  pharmacist_count: number;
  herbal_pharmacist_count: number;
  is_herbal_pharmacy: boolean;
  community_herbal_staff_reported?: boolean;
  is_animal_pharmacy: boolean;
  is_cross_employed: boolean;
  has_ykiho: boolean;
}

/** Nearby pharmacy result */
export interface NearbyPharmacy {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  distance_m: number;
}

/** Data freshness from data_freshness table */
export interface DataFreshness {
  source: string;
  last_sync: string;
  data_date: string;
  record_count: number | null;
  notes: string | null;
}

/** Filter state shared between map and table views */
export interface FilterState {
  search: string;
  sido: string;
  sigungu: string;
  herbal: boolean;
  animal: boolean;
  cross: boolean;
  noYkiho: boolean;
  openedFrom: string;
  openedTo: string;
}

/** Sort options for table */
export type SortField =
  | "name"
  | "sido"
  | "sigungu"
  | "open_date"
  | "mois_license_date"
  | "hira_open_date"
  | "hira_staff_fetched_at"
  | "pharmacist_count"
  | "herbal_pharmacist_count";
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

/** Paginated response from API routes */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
