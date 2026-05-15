import Link from "next/link";
import { MapTrifold } from "@phosphor-icons/react/dist/ssr";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
          <MapTrifold size={24} />
        </div>
        <h1 className="text-xl font-semibold text-zinc-950">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          약국 정보가 이동했거나 주소가 잘못 입력됐을 수 있습니다.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            지도 보기
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            서비스 안내
          </Link>
        </div>
      </div>
    </div>
  );
}
