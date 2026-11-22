export const instant = false;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { CaseWorkspace } from "./case-workspace";

async function CaseWorkspaceContent({ params }: PageProps<"/[locale]/sprawy/[uuid]">) {
  const { locale, uuid } = await params;
  if (!isAppLocale(locale)) notFound();
  return <CaseWorkspace caseUuid={uuid} polish={locale === "pl"} />;
}

export default function CaseWorkspacePage(props: PageProps<"/[locale]/sprawy/[uuid]">) {
  return (
    <Suspense fallback={null}>
      <CaseWorkspaceContent {...props} />
    </Suspense>
  );
}
