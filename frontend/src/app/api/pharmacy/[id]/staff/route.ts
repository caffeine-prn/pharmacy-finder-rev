import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

const HIRA_STAFF_URL =
  "https://apis.data.go.kr/B551182/MadmDtlInfoService2.7/getEtcHstInfo2.7";
const STAFF_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type HiraStaffRow = {
  ykiho: string;
  pharmacy_name: string;
  staff_type_code: string;
  staff_type_name: string;
  staff_count: number;
  raw: Record<string, string>;
};

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseHiraStaffXml(xml: string) {
  const resultCode = getTag(xml, "resultCode");
  const resultMsg = getTag(xml, "resultMsg");
  const totalCount = Number.parseInt(getTag(xml, "totalCount") || "0", 10) || 0;
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  const rows: HiraStaffRow[] = itemMatches.map((match) => {
    const item = match[1];
    const raw = {
      dtlGnlNopCdNm: getTag(item, "dtlGnlNopCdNm"),
      gnlNopCnt: getTag(item, "gnlNopCnt"),
      gnlNopDtlCd: getTag(item, "gnlNopDtlCd"),
      yadmNm: getTag(item, "yadmNm"),
      ykiho: getTag(item, "ykiho"),
    };

    return {
      ykiho: raw.ykiho,
      pharmacy_name: raw.yadmNm,
      staff_type_code: raw.gnlNopDtlCd,
      staff_type_name: raw.dtlGnlNopCdNm,
      staff_count: Number.parseInt(raw.gnlNopCnt || "0", 10) || 0,
      raw,
    };
  });

  return { resultCode, resultMsg, totalCount, rows };
}

function withServiceKey(apiKey: string) {
  const serviceKey = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);
  return `${HIRA_STAFF_URL}?serviceKey=${serviceKey}`;
}

function sumStaff(rows: HiraStaffRow[], code: string, name: string) {
  return rows
    .filter((row) => row.staff_type_code === code || row.staff_type_name === name)
    .reduce((sum, row) => sum + row.staff_count, 0);
}

function getRefreshState(fetchedAt: string | null | undefined) {
  if (!fetchedAt) {
    return {
      canRefresh: true,
      canRefreshAt: null as string | null,
      ageMs: null as number | null,
    };
  }

  const lastFetchedAt = new Date(fetchedAt).getTime();
  if (Number.isNaN(lastFetchedAt)) {
    return {
      canRefresh: true,
      canRefreshAt: null as string | null,
      ageMs: null as number | null,
    };
  }

  const canRefreshAt = new Date(lastFetchedAt + STAFF_REFRESH_INTERVAL_MS);
  const ageMs = Date.now() - lastFetchedAt;
  return {
    canRefresh: ageMs >= STAFF_REFRESH_INTERVAL_MS,
    canRefreshAt: canRefreshAt.toISOString(),
    ageMs,
  };
}

function publicRows(rows: HiraStaffRow[]) {
  return rows.map(({ raw: _raw, ...row }) => row);
}

async function fetchPharmacy(supabase: ReturnType<typeof createServiceSupabase>, id: string) {
  const { data: pharmacy, error: pharmacyError } = await supabase
    .from("pharmacies")
    .select("id,name,ykiho,hira_staff_fetched_at,hira_staff_total_count")
    .eq("id", id)
    .maybeSingle();

  if (pharmacyError || !pharmacy) {
    return { pharmacy: null, error: pharmacyError };
  }

  return { pharmacy, error: null };
}

async function fetchCachedRows(
  supabase: ReturnType<typeof createServiceSupabase>,
  ykiho: string
) {
  const { data, error } = await supabase
    .from("hira_staff_lookup_raw")
    .select("ykiho,pharmacy_name,staff_type_code,staff_type_name,staff_count,raw,fetched_at")
    .eq("ykiho", ykiho)
    .order("staff_type_code", { ascending: true });

  if (error) throw error;

  const rows = (data || []).map((row) => ({
    ykiho: row.ykiho,
    pharmacy_name: row.pharmacy_name,
    staff_type_code: row.staff_type_code,
    staff_type_name: row.staff_type_name,
    staff_count: row.staff_count,
    raw: row.raw || {},
  })) as HiraStaffRow[];

  const fetchedAt =
    (data || [])
      .map((row) => row.fetched_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

  return { rows, fetchedAt };
}

function lookupPayload(args: {
  pharmacyId: string;
  ykiho: string;
  fetchedAt: string | null;
  totalCount: number;
  rows: HiraStaffRow[];
  refreshed: boolean;
  message?: string;
}) {
  const pharmacistCount = sumStaff(args.rows, "071", "약사");
  const herbalPharmacistCount = sumStaff(args.rows, "072", "한약사");
  const refresh = getRefreshState(args.fetchedAt);

  return {
    pharmacy_id: args.pharmacyId,
    ykiho: args.ykiho,
    fetched_at: args.fetchedAt,
    total_count: args.totalCount,
    pharmacist_count: pharmacistCount,
    herbal_pharmacist_count: herbalPharmacistCount,
    can_refresh: refresh.canRefresh,
    can_refresh_at: refresh.canRefreshAt,
    refreshed: args.refreshed,
    message: args.message,
    rows: publicRows(args.rows),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceSupabase();
  const { pharmacy, error: pharmacyError } = await fetchPharmacy(supabase, params.id);

  if (pharmacyError) {
    return NextResponse.json({ error: pharmacyError.message }, { status: 500 });
  }
  if (!pharmacy) {
    return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 });
  }

  if (!pharmacy.ykiho) {
    return NextResponse.json(
      { error: "This pharmacy has no HIRA ykiho" },
      { status: 400 }
    );
  }

  try {
    const cached = await fetchCachedRows(supabase, pharmacy.ykiho);
    const fetchedAt = pharmacy.hira_staff_fetched_at || cached.fetchedAt;
    return NextResponse.json(
      lookupPayload({
        pharmacyId: pharmacy.id,
        ykiho: pharmacy.ykiho,
        fetchedAt,
        totalCount: pharmacy.hira_staff_total_count || cached.rows.length,
        rows: cached.rows,
        refreshed: false,
      })
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cached staff lookup failed" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DRUG_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const supabase = createServiceSupabase();
  const { pharmacy, error: pharmacyError } = await fetchPharmacy(supabase, params.id);

  if (pharmacyError) {
    return NextResponse.json({ error: pharmacyError.message }, { status: 500 });
  }
  if (!pharmacy) {
    return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 });
  }

  if (!pharmacy.ykiho) {
    return NextResponse.json(
      { error: "This pharmacy has no HIRA ykiho" },
      { status: 400 }
    );
  }

  let cachedForCooldown: Awaited<ReturnType<typeof fetchCachedRows>> | null = null;
  if (!pharmacy.hira_staff_fetched_at) {
    cachedForCooldown = await fetchCachedRows(supabase, pharmacy.ykiho);
  }
  const currentFetchedAt =
    pharmacy.hira_staff_fetched_at || cachedForCooldown?.fetchedAt || null;
  const refresh = getRefreshState(currentFetchedAt);
  if (!refresh.canRefresh) {
    try {
      const cached = cachedForCooldown || (await fetchCachedRows(supabase, pharmacy.ykiho));
      return NextResponse.json(
        lookupPayload({
          pharmacyId: pharmacy.id,
          ykiho: pharmacy.ykiho,
          fetchedAt: currentFetchedAt,
          totalCount: pharmacy.hira_staff_total_count || cached.rows.length,
          rows: cached.rows,
          refreshed: false,
          message: "최근 인력 조회 후 24시간이 지나야 다시 갱신할 수 있습니다.",
        })
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Cached staff lookup failed" },
        { status: 500 }
      );
    }
  }

  const url = new URL(withServiceKey(apiKey));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("ykiho", pharmacy.ykiho);

  const hiraResponse = await fetch(url, { cache: "no-store" });
  const xml = await hiraResponse.text();
  if (!hiraResponse.ok) {
    return NextResponse.json(
      { error: "HIRA staff lookup failed", status: hiraResponse.status, body: xml },
      { status: 502 }
    );
  }

  const parsed = parseHiraStaffXml(xml);
  if (parsed.resultCode && parsed.resultCode !== "00") {
    return NextResponse.json(
      { error: parsed.resultMsg || "HIRA returned an error", resultCode: parsed.resultCode },
      { status: 502 }
    );
  }

  const fetchedAt = new Date().toISOString();
  const rows = parsed.rows.filter((row) => row.ykiho);
  const pharmacistCount = sumStaff(rows, "071", "약사");
  const herbalPharmacistCount = sumStaff(rows, "072", "한약사");

  if (rows.length > 0) {
    const rawRows = rows.map((row) => ({
      ykiho: row.ykiho,
      staff_type_code: row.staff_type_code,
      staff_type_name: row.staff_type_name,
      staff_count: row.staff_count,
      pharmacy_name: row.pharmacy_name || pharmacy.name,
      raw: row.raw,
      fetched_at: fetchedAt,
      updated_at: fetchedAt,
    }));

    const { error: rawError } = await supabase
      .from("hira_staff_lookup_raw")
      .upsert(rawRows, { onConflict: "ykiho,staff_type_code" });
    if (rawError) {
      return NextResponse.json({ error: rawError.message }, { status: 500 });
    }

    const staffRows = rows.map((row) => ({
      ykiho: row.ykiho,
      pharmacy_name: row.pharmacy_name || pharmacy.name,
      staff_type_code: row.staff_type_code,
      staff_type_name: row.staff_type_name,
      staff_count: row.staff_count,
      data_period: "on_demand",
      updated_at: fetchedAt,
    }));

    const { error: staffError } = await supabase
      .from("pharmacy_staff")
      .upsert(staffRows, { onConflict: "ykiho,staff_type_code" });
    if (staffError) {
      return NextResponse.json({ error: staffError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabase
    .from("pharmacies")
    .update({
      pharmacist_count: pharmacistCount,
      herbal_pharmacist_count: herbalPharmacistCount,
      is_herbal_pharmacy: herbalPharmacistCount > 0,
      is_cross_employed: pharmacistCount > 0 && herbalPharmacistCount > 0,
      hira_staff_fetched_at: fetchedAt,
      hira_staff_total_count: parsed.totalCount,
      updated_at: fetchedAt,
    })
    .eq("id", pharmacy.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ...lookupPayload({
      pharmacyId: pharmacy.id,
      ykiho: pharmacy.ykiho,
      fetchedAt,
      totalCount: parsed.totalCount,
      rows,
      refreshed: true,
    }),
  });
}
