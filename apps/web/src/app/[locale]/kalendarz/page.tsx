export const instant = false;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { UdipCalendarDashboard } from "../udip-calendar-dashboard";

async function CalendarContent({ params }: PageProps<"/[locale]/kalendarz">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <UdipCalendarDashboard polish={locale === "pl"} />;
}

export default function KalendarzPage(props: PageProps<"/[locale]/kalendarz">) {
  return (
    <Suspense fallback={null}>
      <CalendarContent {...props} />
    </Suspense>
  );
}
