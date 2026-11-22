import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { UdipCalendarDashboard } from "./udip-calendar-dashboard";

async function HomeContent({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <UdipCalendarDashboard polish={locale === "pl"} />;
}

export default function Home(props: PageProps<"/[locale]">) {
  return (
    <Suspense fallback={null}>
      <HomeContent {...props} />
    </Suspense>
  );
}
