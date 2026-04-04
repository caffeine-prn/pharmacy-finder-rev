// frontend/src/app/api/kakao-local/route.ts
import { NextRequest, NextResponse } from "next/server";

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY;

export async function GET(request: NextRequest) {
  if (!KAKAO_REST_KEY) {
    return NextResponse.json(
      { error: "Kakao API key not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("query");
  const x = searchParams.get("x"); // longitude
  const y = searchParams.get("y"); // latitude
  const radius = searchParams.get("radius") || "500";
  const category = searchParams.get("category_group_code") || "PM9"; // PM9 = 약국

  if (!query && !x) {
    return NextResponse.json(
      { error: "query or x/y required" },
      { status: 400 }
    );
  }

  try {
    // Try category search first if coordinates are provided
    if (x && y) {
      const categoryUrl = new URL(
        "https://dapi.kakao.com/v2/local/search/category.json"
      );
      categoryUrl.searchParams.set("category_group_code", category);
      categoryUrl.searchParams.set("x", x);
      categoryUrl.searchParams.set("y", y);
      categoryUrl.searchParams.set("radius", radius);
      categoryUrl.searchParams.set("sort", "distance");
      categoryUrl.searchParams.set("size", "5");

      const catRes = await fetch(categoryUrl.toString(), {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
      });
      const catData = await catRes.json();

      if (catData.documents?.length > 0) {
        return NextResponse.json(catData);
      }
    }

    // Fallback: keyword search
    if (query) {
      const keywordUrl = new URL(
        "https://dapi.kakao.com/v2/local/search/keyword.json"
      );
      keywordUrl.searchParams.set("query", query);
      if (x) keywordUrl.searchParams.set("x", x);
      if (y) keywordUrl.searchParams.set("y", y);
      if (x && y) keywordUrl.searchParams.set("radius", radius);
      keywordUrl.searchParams.set("size", "5");

      const kwRes = await fetch(keywordUrl.toString(), {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
      });
      const kwData = await kwRes.json();
      return NextResponse.json(kwData);
    }

    return NextResponse.json({ documents: [] });
  } catch (err) {
    console.error("Kakao proxy error:", err);
    return NextResponse.json(
      { error: "Kakao API request failed" },
      { status: 502 }
    );
  }
}
