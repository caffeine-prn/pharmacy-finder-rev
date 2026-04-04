import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { MainView } from "./MainView";

export default function HomePage() {
  return (
    <Suspense fallback={<Skeleton className="flex-1" />}>
      <MainView />
    </Suspense>
  );
}
