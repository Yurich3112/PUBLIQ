export type NavigationIcon = "home" | "calendar" | "about" | "team" | "chat" | "ocr" | "admin" | "knowledge" | "colors" | "asides" | "components" | "user" | "files" | "products" | "tags" | "queue" | "settings" | "monitoring";
export type NavigationHref = "/" | "/kalendarz" | "/about" | "/about/team" | "/chat" | "/chat/settings" | "/ocr" | "/admin" | "/admin/knowledge" | "/admin/users" | "/admin/files" | "/admin/products" | "/admin/tags" | "/admin/queue" | "/admin/settings" | "/admin/monitoring" | "/test" | `/test#${string}`;
export type NavigationLabel = "home" | "calendar" | "caseDetail" | "about" | "team" | "chat" | "ocr" | "llm" | "admin" | "knowledge" | "overview" | "users" | "files" | "products" | "tags" | "queue" | "settings" | "monitoring" | "gallery" | "colors" | "asides" | "buttons" | "userPanel";
export type NavigationItem = { href: NavigationHref; label: NavigationLabel; icon: NavigationIcon; exact?: boolean };

const home: NavigationItem = { href: "/", label: "home", icon: "home", exact: true };
const calendar: NavigationItem = { href: "/kalendarz", label: "calendar", icon: "calendar" };
const ocr: NavigationItem = { href: "/ocr", label: "ocr", icon: "ocr" };
const knowledgeAdmin: NavigationItem = { href: "/admin/knowledge", label: "knowledge", icon: "knowledge" };
const admin: NavigationItem = { href: "/admin", label: "admin", icon: "admin" };

/** Visibility is supplied by the server's role decision; destinations still enforce authorization. */
export function primaryNavigation(allowAdmin: boolean, signedIn: boolean): NavigationItem[] {
  return [home, ...(signedIn ? [calendar, ocr] : []), ...(allowAdmin ? [knowledgeAdmin] : [])];
}

export function normalizeNavigationPath(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}

export function navigationActive(pathname: string, item: NavigationItem): boolean {
  const path = normalizeNavigationPath(pathname);
  const target = normalizeNavigationPath(item.href);
  if (target === "/admin/knowledge" && !item.exact && (path === "/admin" || path.startsWith("/admin/"))) return true;
  return path === target || (!item.exact && target !== "/" && path.startsWith(`${target}/`));
}

export function secondaryNavigation(pathname: string, allowAdmin: boolean): { label: "adminNavigation" | "galleryNavigation"; items: NavigationItem[] } | null {
  const path = normalizeNavigationPath(pathname);
  if (allowAdmin && navigationActive(path, admin)) return {
    label: "adminNavigation", items: [
      { href: "/admin/knowledge", label: "knowledge", icon: "knowledge", exact: true },
      { href: "/admin/users", label: "users", icon: "user", exact: true },
      { href: "/admin/monitoring", label: "monitoring", icon: "monitoring", exact: true },
    ],
  };
  if (path === "/test") return { label: "galleryNavigation", items: [
    { href: "/test#gallery-semantic-colors", label: "colors", icon: "colors" },
    { href: "/test#gallery-asides", label: "asides", icon: "asides" },
    { href: "/test#gallery-user-panel-v2", label: "userPanel", icon: "user" },
    { href: "/test#gallery-buttons", label: "buttons", icon: "components" },
  ] };
  return null;
}

export type BreadcrumbRoute = { label: "home" | "calendar" | "caseDetail" | "about" | "team" | "chat" | "ocr" | "ocrShow" | "admin" | "knowledge" | "users" | "files" | "products" | "tags" | "queue" | "settings" | "monitoring" | "createProduct" | "gallery" | "accessDenied" | "llm"; href?: "/" | "/kalendarz" | "/about" | "/chat" | "/ocr" | "/admin" | "/admin/knowledge" | "/test" | "/admin/products" };
export function pageBreadcrumbs(pathname: string): BreadcrumbRoute[] {
  const path = normalizeNavigationPath(pathname);
  if (path === "/kalendarz") return [{ label: "home", href: "/" }, { label: "calendar" }];
  if (path.startsWith("/sprawy/")) return [{ label: "home", href: "/" }, { label: "calendar", href: "/kalendarz" }, { label: "caseDetail" }];
  if (path === "/ocr") return [{ label: "home", href: "/" }, { label: "ocr" }];
  if (path === "/ocr/pokaz") return [{ label: "home", href: "/" }, { label: "ocr", href: "/ocr" }, { label: "ocrShow" }];
  if (path === "/admin/knowledge") return [{ label: "home", href: "/" }, { label: "admin", href: "/admin/knowledge" }, { label: "knowledge" }];
  if (path === "/admin/monitoring") return [{ label: "home", href: "/" }, { label: "admin", href: "/admin/knowledge" }, { label: "monitoring" }];
  if (path === "/admin/users") return [{ label: "home", href: "/" }, { label: "admin", href: "/admin/knowledge" }, { label: "users" }];
  if (path === "/admin/files" || path === "/admin/products" || path === "/admin/tags" || path === "/admin/queue" || path === "/admin/settings") {
    return [{ label: "home", href: "/" }, { label: "admin", href: "/admin/knowledge" }, { label: path === "/admin/files" ? "files" : path === "/admin/tags" ? "tags" : path === "/admin/queue" ? "queue" : path === "/admin/settings" ? "settings" : "products" }];
  }
  if (path === "/admin/products/create") return [
    { label: "home", href: "/" }, { label: "admin", href: "/admin/knowledge" }, { label: "products", href: "/admin/products" }, { label: "createProduct" },
  ];
  const current = path === "/admin" ? "admin" : path === "/test" ? "gallery" : path === "/access-denied" ? "accessDenied" : null;
  return current ? [{ label: "home", href: "/" }, { label: current }] : [];
}

/** Hysteresis prevents the shrinking sticky header from repeatedly crossing its own scroll threshold. */
export function navbarAtTop(previous: boolean, scrollY: number): boolean {
  return scrollY <= 8 ? true : scrollY >= 72 ? false : previous;
}
