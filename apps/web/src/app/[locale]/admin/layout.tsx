import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAccess } from "@/server/auth/access";
import { ADMIN_ACCESS } from "@/schemas/access";
import { Heading, Throbber } from "@/ui/basic";

async function AdminBoundary({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAccess(ADMIN_ACCESS);
  const t = await getTranslations({ locale, namespace: "common.admin" });
  const polish = locale === "pl";
  return <section className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6" aria-labelledby="admin-title">
    <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
      <div>
        <Heading level={1} id="admin-title" className="text-xl">{t("title")}</Heading>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {polish
            ? "Biuro Komunikacji Społecznej · Zarządzanie Bazą Wiedzy, kontami i dostępnością lokalnych usług"
            : "Public Communication Office · Knowledge Base, clerk accounts, and local service health"}
        </p>
      </div>
    </header>
    {children}
  </section>;
}

export default function AdminLayout(props: LayoutProps<"/[locale]/admin">) {
  return <Suspense fallback={<div className="flex justify-center p-8"><Throbber /></div>}>
    <AdminBoundary {...props} />
  </Suspense>;
}
