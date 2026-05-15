import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

const HIRA_STAFF_URL =
  "https://apis.data.go.kr/B551182/MadmDtlInfoService2.7/getEtcHstInfo2.7";

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
  const { data: pharmacy, error: pharmacyError } = await supabase
    .from("pharmacies")
    .select("id,name,ykiho")
    .eq("id", params.id)
    .single();

  if (pharmacyError || !pharmacy) {
    return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 });
  }

  if (!pharmacy.ykiho) {
    return NextResponse.json(
      { error: "This pharmacy has no HIRA ykiho" },
      { status: 400 }
    );
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
      updated_at: fetchedAt,
    })
    .eq("id", pharmacy.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    pharmacy_id: pharmacy.id,
    ykiho: pharmacy.ykiho,
    fetched_at: fetchedAt,
    total_count: parsed.totalCount,
    pharmacist_count: pharmacistCount,
    herbal_pharmacist_count: herbalPharmacistCount,
    rows: rows.map(({ raw: _raw, ...row }) => row),
  });
}
