"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Gear } from "react-bootstrap-icons";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGE_COOKIE_KEY, persistLanguage } from "@/cookies";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DEFAULT_LOCALE, getNextLocale, isAppLocale } from "@/schemas/i18n";
import { Button } from "@/ui/basic";
import { ContrastSelectorIcon } from "@/ui/components/contrast-selector-icon";
import { LocaleFlag } from "@/ui/components/locale-flag";
import { ThemeSelectorIcon } from "@/ui/components/theme-selector-icon";

export function PreferencesMenu({
  languageCookieName = LANGUAGE_COOKIE_KEY,
  cookieDomain,
}: {
  languageCookieName?: string;
  cookieDomain?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const requestedLocale = useLocale();
  const locale = isAppLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const nextLocale = getNextLocale(locale);
  const switchLabel = t(`languageSwitchTo.${nextLocale}`);
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      {/* Expands smoothly to the left of the gear button */}
      <div
        aria-hidden={!open}
        inert={!open}
        className={`flex items-center gap-1.5 overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none ${
          open ? "mr-1.5 max-w-[120px] opacity-100" : "mr-0 max-w-0 opacity-0"
        }`}
      >
        <Button
          size="icon"
          aria-label={switchLabel}
          tooltip={switchLabel}
          tooltipPlacement="bottom"
          lang={locale}
          disabled={pending}
          aria-busy={pending}
          className="size-8 shrink-0 p-0"
          onClick={() => {
            persistLanguage(nextLocale, languageCookieName);
            startTransition(() => {
              router.replace(`${pathname}${window.location.search}${window.location.hash}`, {
                locale: nextLocale,
                scroll: false,
              });
            });
          }}
        >
          <LocaleFlag locale={locale} />
        </Button>
        <ThemeSelectorIcon cookieDomain={cookieDomain || undefined} className="size-8 shrink-0" />
        <ContrastSelectorIcon className="size-8 shrink-0" />
      </div>

      <Button
        size="icon"
        aria-label={t("navigation.preferences")}
        aria-expanded={open}
        tooltip={t("navigation.preferences")}
        tooltipPlacement="bottom"
        onClick={() => setOpen(v => !v)}
        className={`size-8 shrink-0 p-0 transition-colors ${open ? "border-primary text-primary" : ""}`}
      >
        <Gear
          aria-hidden="true"
          className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
      </Button>
    </div>
  );
}
