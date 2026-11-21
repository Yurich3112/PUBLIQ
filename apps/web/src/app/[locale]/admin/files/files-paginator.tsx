import { FILE_PAGE_SIZE, FILE_PAGE_SIZES, fileListUrlParams, type FileListQuery } from "@/schemas/file-list";
import type { AppLocale } from "@/schemas/i18n";
import { TablePaginator } from "@/ui/components/table-paginator";

export function FilesPaginator({ locale, query, rowCount, total }: {
  locale: AppLocale; query: FileListQuery; rowCount: number; total: number | null;
}) {
  return <TablePaginator locale={locale} namespace="common.admin.files" pathname="/admin/files"
    params={fileListUrlParams(query)} page={query.page ?? 1} limit={query.limit ?? FILE_PAGE_SIZE}
    total={total ?? 0} unavailable={total === null} rowCount={rowCount} sizes={FILE_PAGE_SIZES} />;
}
