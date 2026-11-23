import Image from "next/image";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/schemas/i18n";
import { Link } from "@/i18n/navigation";
import { AuthButton } from "@/ui/components/auth-button";
import { NavbarFrame } from "./navbar-frame";
import { PrimaryNavigation, SecondaryNavigation } from "./navbar-navigation";
import { PreferencesMenu } from "./preferences-menu";
import { layoutStyles } from "./styles";
import { getAdminAccess } from "@/server/auth/admin-access";
import { getAccess } from "@/server/auth/access";
import { LOGGED_ACCESS, ROLE_LEVELS } from "@/schemas/access";

async function AuthorizedNavigation({ secondary = false }: { secondary?: boolean }) {
  if (secondary) return <SecondaryNavigation allowAdmin={await getAdminAccess() === "allowed"} />;
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return <PrimaryNavigation />;
  return <PrimaryNavigation signedIn allowAdmin={(access.context.roleLevel ?? 0) >= ROLE_LEVELS.ADMIN} />;
}

export type NavbarProps = {
  appName: string;
  locale: AppLocale;
  languageCookieName?: string;
  cookieDomain?: string;
  className?: string;
};

export async function Navbar({ locale, languageCookieName, cookieDomain = "", className }: NavbarProps) {
  const t = await getTranslations({ locale, namespace: "common.navigation" });
  const auth = await getTranslations({ locale, namespace: "common.auth" });
  return (
    <NavbarFrame className={className}>
      <a href="#main-content" className={layoutStyles.skipLink}>{t("skipContent")}</a>
      <div data-navbar-main className={layoutStyles.navbarContent}>
        <Link href="/" locale={locale} aria-label={locale === "pl" ? "PUBLIQ — Asystent UDIP" : "PUBLIQ — UDIP Assistant"} className={layoutStyles.brand}>
          <Image src="/brand-icon.png" alt="" width={36} height={36} className="size-9 shrink-0 object-contain" />
          <span className="navbar-brand-name hidden flex-col leading-tight @min-[1024px]/navbar:inline-flex">
            <span className="text-sm font-bold tracking-tight text-foreground">PUBLIQ</span>
            <span className="text-[10px] font-medium text-muted-foreground">{locale === "pl" ? "Asystent UDIP" : "UDIP Assistant"}</span>
          </span>
        </Link>
        <Suspense fallback={<PrimaryNavigation />}><AuthorizedNavigation /></Suspense>
        <div className={layoutStyles.navbarActions}>
          <Suspense fallback={<span className={layoutStyles.preferencesFallback} aria-hidden="true" />}>
            <PreferencesMenu languageCookieName={languageCookieName} cookieDomain={cookieDomain} />
          </Suspense>
          <Suspense fallback={<span className="text-sm" role="status">{auth("pending")}</span>}>
            <AuthButton locale={locale} />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<SecondaryNavigation />}><AuthorizedNavigation secondary /></Suspense>
    </NavbarFrame>
  );
}

