export const instant = false;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LOGGED_ACCESS, ROLE_LEVELS } from "@/schemas/access";
import { isAppLocale } from "@/schemas/i18n";
import { requireAccess } from "@/server/auth/access";
import { CaseWorkspace } from "./case-workspace";

async function CaseWorkspaceContent({ params }: PageProps<"/[locale]/sprawy/[uuid]">) {
  const { locale, uuid } = await params;
  if (!isAppLocale(locale)) notFound();
  const context = await requireAccess(LOGGED_ACCESS);
  const isAdmin = (context.roleLevel ?? 0) >= ROLE_LEVELS.ADMIN;
  return <CaseWorkspace caseUuid={uuid} polish={locale === "pl"} isAdmin={isAdmin} />;
}

export default function CaseWorkspacePage(props: PageProps<"/[locale]/sprawy/[uuid]">) {
  return (
    <Suspense fallback={null}>
      <CaseWorkspaceContent {...props} />
    </Suspense>
  );
}
