export const instant = false;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { KnowledgeGraphStudio } from "./knowledge-graph-studio";

async function AdminKnowledgeContent({ params }: PageProps<"/[locale]/admin/knowledge">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  return <KnowledgeGraphStudio polish={locale === "pl"} />;
}

export default function AdminKnowledgePage(props: PageProps<"/[locale]/admin/knowledge">) {
  return (
    <Suspense fallback={null}>
      <AdminKnowledgeContent {...props} />
    </Suspense>
  );
}
