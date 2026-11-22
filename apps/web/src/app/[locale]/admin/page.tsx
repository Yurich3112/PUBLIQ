// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAdminAccess } from "@/server/auth/admin-access";

async function AdminRedirect({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  return redirect(`/${locale}/admin/knowledge`);
}

export default function AdminPage(props: PageProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={null}>
      <AdminRedirect {...props} />
    </Suspense>
  );
}
