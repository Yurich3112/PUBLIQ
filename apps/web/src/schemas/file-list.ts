import { z } from "zod";
import type { FileDetails } from "./file-status.ts";

export const filePageSizeSchema = z.literal([1, 10, 25, 50]);
export const FILE_PAGE_SIZES = [...filePageSizeSchema.values];
export const FILE_PAGE_SIZE = 25;
export const fileVersionNumber = z.number().int().min(1).max(2147483647);
export const fileRevisionTargetSchema = z.object({ uuid: z.uuid(), expectedVersion: fileVersionNumber });

export function parseFileVersion(value: string | null) {
  return value && /^[1-9]\d{0,9}$/.test(value) ? fileVersionNumber.safeParse(Number(value)).data : undefined;
}

const searchSchema = z.string().trim().max(200);
const tagsSchema = z.enum(["tagged", "untagged"]);
const revisionSchema = z.enum(["first", "later"]);
export const fileSortColumnSchema = z.enum(["name", "version", "status", "size", "modifiedAt"]);
export type FileSortColumn = z.infer<typeof fileSortColumnSchema>;
export const fileListQuerySchema = z.object({
  search: searchSchema, tags: tagsSchema.optional(), revision: revisionSchema.optional(),
  page: z.number().int().min(1).max(40001).default(1), limit: filePageSizeSchema.default(FILE_PAGE_SIZE),
  sort: fileSortColumnSchema.optional(), direction: z.enum(["asc", "desc"]).optional(),
});
export type FileListQuery = {
  search: string;
  tags?: z.infer<typeof tagsSchema>;
  revision?: z.infer<typeof revisionSchema>;
  page?: number;
  limit?: number;
  sort?: FileSortColumn;
  direction?: "asc" | "desc";
};

export function parseFileListQuery(params: Record<string, string | string[] | undefined>): FileListQuery {
  const query: FileListQuery = {
    search: searchSchema.safeParse(params.search).data ?? "",
    tags: tagsSchema.safeParse(params.tags).data,
    revision: revisionSchema.safeParse(params.revision).data,
    sort: fileSortColumnSchema.safeParse(params.sort).data,
    direction: params.direction === "desc" ? "desc" : "asc",
  };
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  return {
    ...query,
    page: Math.min(40001, page),
    limit: typeof params.limit === "string" ? FILE_PAGE_SIZES.find(size => String(size) === params.limit) ?? FILE_PAGE_SIZE : FILE_PAGE_SIZE,
  };
}

export function fileListUrlParams(query: FileListQuery): Record<string, string> {
  return {
    page: String(query.page ?? 1), limit: String(query.limit ?? FILE_PAGE_SIZE),
    ...(query.search ? { search: query.search } : {}), ...(query.tags ? { tags: query.tags } : {}),
    ...(query.revision ? { revision: query.revision } : {}),
    ...(query.sort ? { sort: query.sort, direction: query.direction ?? "asc" } : {}),
  };
}

export type FileListPage = {
  bucket: string;
  rows: FileListRow[];
  total: number;
  metadataReady: boolean;
};

export type FileListRow = {
  key: string;
  name: string;
  version?: number;
  size: number | bigint;
  modifiedAt: Date;
  details?: FileDetails;
  revisionCount?: number;
};

export type FileRevisionRow = {
  version: number;
  size: bigint;
  createdAt: Date;
};
