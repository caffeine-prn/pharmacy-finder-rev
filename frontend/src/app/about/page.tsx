import Link from "next/link";
import { ArrowLeft, Database, ClockCounterClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";

const sources = [
  {
    title: "행안부 약국/동물약국 인허가 정보",
    body: "약국의 위치, 주소, 개설일, 영업상태와 동물약국 여부를 확인하는 기본 원천입니다.",
  },
  {
    title: "HIRA 약국 기본목록 및 개폐업 정보",
    body: "요양기관번호가 있는 약국을 대조하고, 분기 기준 기본목록 이후의 개업·폐업·휴업 이벤트를 보강합니다.",
  },
  {
    title: "HIRA 인력 정보",
    body: "분기 파일을 초기 기준으로 쓰고, 약국별 HIRA API 조회 결과가 있으면 그 값을 우선합니다.",
  },
  {
    title: "국립중앙의료원 공공 심야/휴일 정보",
    body: "일부 약국의 운영시간 정보를 보강합니다. 실제 영업 여부는 방문 전 전화 확인이 필요합니다.",
  },
];

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-zinc-200 pb-6">
          <Link
            href="/"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft size={16} />
            지도 돌아가기
          </Link>
          <p className="mb-2 text-sm font-medium text-emerald-700">서비스 안내</p>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            전국 약국 찾기
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            공공데이터를 매일 동기화해 약국 위치, 개설일, 요양기관번호, 동물약국 여부,
            약사·한약사 인력 정보를 함께 볼 수 있게 만든 운영형 지도입니다.
          </p>
        </header>

        <section className="grid gap-3 py-6 sm:grid-cols-3">
          <SummaryCard
            icon={<Database size={18} />}
            label="데이터"
            value="공공 원천 대조"
            body="행안부, HIRA, NMC 데이터를 서로 맞춰 봅니다."
          />
          <SummaryCard
            icon={<ClockCounterClockwise size={18} />}
            label="갱신"
            value="매일 자동화"
            body="약국 기본정보와 인력조회 배치를 분리해 갱신합니다."
          />
          <SummaryCard
            icon={<WarningCircle size={18} />}
            label="주의"
            value="방문 전 확인"
            body="실제 영업시간과 재고는 각 약국에 직접 확인해야 합니다."
          />
        </section>

        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">데이터 출처와 역할</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {sources.map((source) => (
              <div key={source.title} className="px-4 py-4">
                <h3 className="text-sm font-semibold text-zinc-900">{source.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{source.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">공유 전 알아둘 점</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-800">
            <li>이 서비스는 공공데이터 기반 참고용 서비스이며, 공식 행정 증명은 아닙니다.</li>
            <li>영업시간, 휴업, 위치 정보는 원천 데이터 반영 시점에 따라 실제와 다를 수 있습니다.</li>
            <li>인력 정보는 HIRA API 조회 기준일이 표시된 값을 우선하며, 조회 전 항목은 분기 파일 기준일 수 있습니다.</li>
          </ul>
        </section>

        <div className="mt-5 flex flex-wrap gap-2 pb-10">
          <Link
            href="/"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            지도 보기
          </Link>
          <Link
            href="/log"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            동기화 로그 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-sm leading-5 text-zinc-500">{body}</p>
    </div>
  );
}
