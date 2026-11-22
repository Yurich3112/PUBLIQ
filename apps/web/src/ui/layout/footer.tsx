import type { AppLocale } from "@/schemas/i18n";
import { Link } from "@/i18n/navigation";
import { cx } from "@/ui/basic/styles";
import { BackToTop, SystemStatus } from "@/ui/components";
import { layoutStyles } from "./styles";

export type FooterProps = {
  appName: string;
  companyName: string;
  locale: AppLocale;
  languageCookieName?: string;
  className?: string;
};

export async function Footer({ appName, companyName, locale, className }: FooterProps) {
  const polish = locale === "pl";
  return (
    <footer data-shell-footer className={cx(layoutStyles.footer, className)}>
      <div className={layoutStyles.footerContent}>
        <div className={layoutStyles.footerIdentity}>
          <SystemStatus />
          <span className="font-semibold">{polish ? "PUBLIQ · UM Bydgoszcz" : appName}</span>
          <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
          <span className="text-muted-foreground">
            {polish ? "Biuro Komunikacji Społecznej (Zarządzenie nr 535/2024)" : companyName}
          </span>
        </div>
        <div className={layoutStyles.footerActions}>
          <Link
            href="/about"
            locale={locale}
            className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {polish ? "O systemie" : "About"}
          </Link>
          <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
          <Link
            href="/about/team"
            locale={locale}
            className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold tracking-tight text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            FeatureFromFuture - HACKNATION 2026
          </Link>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
