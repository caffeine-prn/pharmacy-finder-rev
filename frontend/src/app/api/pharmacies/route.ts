// frontend/src/app/api/pharmacies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SortField, SortDirection } from "@/lib/types";

const VALID_SORT_FIELDS: SortField[] = [
  "name",
  "sido",
  "sigungu",
  "open_date",
  "mois_license_date",
  "hira_open_date",
  "hira_staff_fetched_at",
  "pharmacist_count",
  "herbal_pharmacist_count",
];

async function getCommunityHerbalPharmacyIds(supabase: ReturnType<typeof createServerSupabase>) {
  const { data, error } = await supabase
    .from("pharmacy_badge_assertions")
    .select("pharmacy_id")
    .eq("badge_type", "unregistered_herbal_staff")
    .eq("assertion_status", "published");

  if (error) {
    console.warn("Failed to load community herbal assertions:", error);
    return [];
  }

  return Array.from(new Set((data || []).map((row) => String(row.pharmacy_id)).filter(Boolean)));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const isExport = searchParams.get("export") === "true";
  const pageSize = Math.min(
    isExport ? 1000 : 100,
    Math.max(1, parseInt(searchParams.get("pageSize") || searchParams.get("limit") || "50", 10))
  );
  const search = searchParams.get("search") || "";
  const sido = searchParams.get("sido") || "";
  const sigungu = searchParams.get("sigungu") || "";
  const herbal = searchParams.get("herbal") === "true";
  const animal = searchParams.get("animal") === "true";
  const cross = searchParams.get("cross") === "true";
  const noYkiho = searchParams.get("noYkiho") === "true";
  const openedFrom = searchParams.get("openedFrom") || "";
  const openedTo = searchParams.get("openedTo") || "";

  let sortField = (searchParams.get("sortField") || "name") as SortField;
  if (!VALID_SORT_FIELDS.includes(sortField)) sortField = "name";
  const sortDirection = (searchParams.get("sortDir") || searchParams.get("sortDirection") || "asc") as SortDirection;
  const ascending = sortDirection === "asc";

  const supabase = createServerSupabase();
  const communityHerbalIds = await getCommunityHerbalPharmacyIds(supabase);

  // Build query
  let query = supabase
    .from("pharmacies")
    .select(
      "id, ykiho, name, address, road_address, phone, sido, sigungu, open_date, mois_license_date, hira_open_date, hira_staff_fetched_at, hira_staff_total_count, latitude, longitude, pharmacist_count, herbal_pharmacist_count, is_herbal_pharmacy, is_animal_pharmacy, is_cross_employed, has_ykiho",
      { count: "exact" }
    )
    .eq("business_status", "영업/정상")
    .is("mois_closed_date", null);

  // Filters
  if (search) {
    const escapedSearch = search.replace(/[%_,]/g, "\\$&");
    query = query.or(
      [
        `name.ilike.%${escapedSearch}%`,
        `phone.ilike.%${escapedSearch}%`,
        `address.ilike.%${escapedSearch}%`,
        `road_address.ilike.%${escapedSearch}%`,
      ].join(",")
    );
  }
  if (sido) {
    query = query.eq("sido", sido);
  }
  if (sigungu) {
    query = query.eq("sigungu", sigungu);
  }
  if (herbal) {
    if (communityHerbalIds.length > 0) {
      query = query.or(`is_herbal_pharmacy.eq.true,id.in.(${communityHerbalIds.join(",")})`);
    } else {
      query = query.eq("is_herbal_pharmacy", true);
    }
  }
  if (animal) {
    query = query.eq("is_animal_pharmacy", true);
  }
  if (cross) {
    query = query.eq("is_cross_employed", true);
  }
  if (noYkiho) {
    query = query.eq("has_ykiho", false);
  }
  if (openedFrom) {
    query = query.gte("open_date", openedFrom);
  }
  if (openedTo) {
    query = query.lte("open_date", openedTo);
  }

  // Sort
  query = query.order(sortField, { ascending, nullsFirst: false });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count || 0;
  const communityHerbalSet = new Set(communityHerbalIds);
  const rows = (data || []).map((row) => ({
    ...row,
    community_herbal_staff_reported: communityHerbalSet.has(row.id),
  }));

  return NextResponse.json({
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
