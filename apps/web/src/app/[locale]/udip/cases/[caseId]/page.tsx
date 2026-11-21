import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { udipCaseIdSchema } from "@/schemas/udip";
import { getUdipActor } from "@/server/udip/access";
import { readUdipCase } from "@/server/udip/cases";
import { readUdipDraft } from "@/server/udip/drafts";

export const instant = false;

type Params = Promise<{ locale: string; caseId: string }>;

async function CaseDocumentIndex({ params }: { params: Params }) {
  const { locale, caseId } = await params;
  const id = udipCaseIdSchema.safeParse(caseId);
  if (!id.success) notFound();

  const access = await getUdipActor();
  if (access.status !== "ok") notFound();
  const [record, draft] = await Promise.all([readUdipCase(access.actor, id.data), readUdipDraft(access.actor, id.data)]);
  if (!record) notFound();

  const polish = locale === "pl";
  const casePath = `/${encodeURIComponent(locale)}/udip/cases/${id.data}` as const;
  const names = new Map(record.documents.map(document => [document.id, document.fileName ?? (
    document.kind === "departmentReply" ? (polish ? "Odpowiedź wydziału" : "Department reply") : (polish ? "Wniosek" : "Request")
  )]));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">{record.case.signature}</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{polish ? "Dokumenty" : "Documents"}</h2>
        <ul className="list-disc space-y-1 ps-6">
          {[...names].map(([documentId, name]) => (
            <li key={documentId}><Link className="underline" href={`${casePath}/documents/${documentId}`}>{name}</Link></li>
          ))}
        </ul>
      </section>
      {draft?.points && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{polish ? "Punkty szkicu i źródła" : "Draft points and sources"}</h2>
          <ol className="list-decimal space-y-4 ps-6">
            {draft.points.map((point, index) => (
              <li key={index} className="space-y-1">
                <h3 className="font-medium">{point.question}</h3>
                <p className="whitespace-pre-wrap">{point.status === "missing" && !polish ? "No supporting material" : point.text}</p>
                {point.sourceDocumentIds.length > 0 && (
                  <ul className="list-disc ps-6">
                    {point.sourceDocumentIds.map(documentId => (
                      <li key={documentId}><Link className="underline" href={`${casePath}/documents/${documentId}`}>
                        {names.get(documentId) ?? documentId}
                      </Link></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

export default function UdipCasePage({ params }: { params: Params }) {
  return <Suspense fallback={null}><CaseDocumentIndex params={params} /></Suspense>;
}
