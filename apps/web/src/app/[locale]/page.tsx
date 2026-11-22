import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LOGGED_ACCESS, ROLE_LEVELS } from "@/schemas/access";
import { isAppLocale } from "@/schemas/i18n";
import { getAccess } from "@/server/auth/access";
import { getIdentityDirectory } from "@/server/auth/directory";
import { getSession } from "@/server/auth/session";
import { UdipHomeDashboard } from "./udip-home-dashboard";

async function HomeContent({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  let signedIn = false;
  let isAdmin = false;
  let firstName: string | null = null;

  try {
    const access = await getAccess(LOGGED_ACCESS);
    if (access.status === "allowed" && access.context.actorUuid) {
      signedIn = true;
      isAdmin = (access.context.roleLevel ?? 0) >= ROLE_LEVELS.ADMIN;
      const session = await getSession();
      if (session) {
        const profile = await getIdentityDirectory().byUuid(session.user.keycloakUuid);
        firstName = profile?.firstName?.trim() || profile?.name?.trim() || null;
      }
    }
  } catch {
    // Render signed-out home gracefully if session check fails transiently
  }

  return (
    <UdipHomeDashboard
      polish={locale === "pl"}
      signedIn={signedIn}
      firstName={firstName}
      isAdmin={isAdmin}
    />
  );
}

export default function Home(props: PageProps<"/[locale]">) {
  return (
    <Suspense fallback={null}>
      <HomeContent {...props} />
    </Suspense>
  );
}
