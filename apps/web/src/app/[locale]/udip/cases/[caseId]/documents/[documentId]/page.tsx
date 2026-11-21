import { Suspense } from "react";
import { notFound } from "next/navigation";
import { API_ROUTES } from "@/config/api-routes";
import { udipCaseIdSchema } from "@/schemas/udip";
import { getUdipActor } from "@/server/udip/access";
import { readUdipDocument } from "@/server/udip/documents";
import { TranscriptionReview } from "./transcription-review";

export const instant = false;

type Params = Promise<{ locale: string; caseId: string; documentId: string }>;

async function DocumentReview({ params }: { params: Params }) {
  const { locale, caseId, documentId } = await params;
  const caseUuid = udipCaseIdSchema.safeParse(caseId);
  const documentUuid = udipCaseIdSchema.safeParse(documentId);
  if (!caseUuid.success || !documentUuid.success) notFound();

  const access = await getUdipActor();
  if (access.status !== "ok") notFound();
  const document = await readUdipDocument(access.actor, caseUuid.data, documentUuid.data);
  if (!document) notFound();

  const documentEndpoint = API_ROUTES.udip.document
    .replace("{caseId}", caseUuid.data)
    .replace("{documentId}", documentUuid.data);
  return <TranscriptionReview key={document.id} document={document} endpoint={documentEndpoint} polish={locale === "pl"} />;
}

export default function UdipDocumentPage({ params }: { params: Params }) {
  return <Suspense fallback={null}><DocumentReview params={params} /></Suspense>;
}
