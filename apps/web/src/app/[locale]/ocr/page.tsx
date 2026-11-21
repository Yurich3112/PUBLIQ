import { Suspense } from "react";
import { LOGGED_ACCESS } from "@/schemas/access";
import { requireAccess } from "@/server/auth/access";
import { OcrSplitVerifier } from "./ocr-split-verifier";

export const instant = false;

async function PrivateOcrWorkspace() {
  await requireAccess(LOGGED_ACCESS);
  return <OcrSplitVerifier />;
}

export default function OcrPage() {
  return (
    <Suspense fallback={null}>
      <PrivateOcrWorkspace />
    </Suspense>
  );
}
