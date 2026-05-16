"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackAnalyticsEvent({
      eventName: "page_view",
      metadata: {
        title: document.title,
      },
    });
  }, [pathname]);

  return null;
}
