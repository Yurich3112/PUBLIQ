// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { fileListQuerySchema, parseFileListQuery, type FileListQuery } from "@/schemas/file-list";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { withAdminSession } from "@/server/auth/admin-action";
import { loadFileList } from "@/server/file-catalog";
import { Heading } from "@/ui/basic";
import { FilesResults } from "./files-results";
import { FilePreviewPanel } from "./file-preview-panel";

async function FilesContent({ params, searchParams }: PageProps<"/[locale]/admin/files">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const query = parseFileListQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "common.admin.files" });

  async function refreshFiles(nextQuery: FileListQuery = query) {
    "use server";
    return withAdminSession(async () => {
      const parsed = fileListQuerySchema.safeParse(nextQuery);
      if (!parsed.success) return { status: "failed" as const };
      const page = await loadFileList(parsed.data).catch(() => null);
      return page ? { status: "ok" as const, page } : { status: "failed" as const };
    });
  }

  return <article aria-labelledby="files-title" className="min-w-0 space-y-1">
    <Heading level={2} id="files-title" className="pb-4 text-xl">{t("title")}</Heading>
    <FilesResults locale={locale} query={query} initial={null} refreshAction={refreshFiles} />
    <FilePreviewPanel />
  </article>;
}

export default function FilesPage(props: PageProps<"/[locale]/admin/files">) {
  return <Suspense fallback={null}><FilesContent {...props} /></Suspense>;
}
