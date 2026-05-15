// frontend/src/app/api/pharmacies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SortField, SortDirection } from "@/lib/types";

const VALID_SORT_FIELDS: SortField[] = [
  "name",
  "sido",
  "sigungu",
  "open_date",
  "pharmacist_count",
  "herbal_pharmacist_count",
];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
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

  // Build query
  let query = supabase
    .from("pharmacies")
    .select(
      "id, ykiho, name, address, phone, sido, sigungu, open_date, mois_license_date, hira_open_date, hira_staff_fetched_at, hira_staff_total_count, pharmacist_count, herbal_pharmacist_count, is_herbal_pharmacy, is_animal_pharmacy, is_cross_employed, has_ykiho",
      { count: "exact" }
    )
    .eq("business_status", "영업/정상")
    .is("mois_closed_date", null);

  // Filters
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }
  if (sido) {
    query = query.eq("sido", sido);
  }
  if (sigungu) {
    query = query.eq("sigungu", sigungu);
  }
  if (herbal) {
    query = query.eq("is_herbal_pharmacy", true);
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
  query = query.order(sortField, { ascending });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count || 0;

  return NextResponse.json({
    data: data || [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
