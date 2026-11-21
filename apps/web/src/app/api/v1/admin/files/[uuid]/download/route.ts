import { fileDownloadResponse } from "@/server/file-download";

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return fileDownloadResponse(uuid, new URL(request.url).searchParams.get("version"));
}
