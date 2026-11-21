import {
  InstitutionKind,
  UdipTemplateType,
  type Prisma,
  type PrismaClient,
} from './generated/prisma/client.js';

export type UdipRoutingScenario =
  | 'OUR_OFFICE_NEW'
  | 'OUR_OFFICE_SIMILAR_FOUND'
  | 'EXTERNAL_INSTITUTION'
  | 'OTHER_INTERNAL_DEPARTMENT';

export interface LlmInstitutionJsonEntry {
  code: string;
  kind: InstitutionKind;
  name: string;
  competencies: string[];
  email: string | null;
  address: string | null;
  legalBasis: string | null;
}

export interface ResponseTemplateRecord {
  uuid: string;
  caseNumber: string;
  fileName: string;
  mimeType: string;
  templateType: UdipTemplateType;
  summary: string;
  extractedBodyText: string;
  fileUuid: string | null;
  kbNodeUuid: string | null;
}

export const SEED_INSTITUTIONS: readonly {
  code: string;
  kind: InstitutionKind;
  name: string;
  shortDescription: string;
  competencies: string[];
  email: string | null;
  address: string | null;
  phone: string | null;
  legalBasis: string | null;
}[] = [
  {
    code: 'BKS',
    kind: InstitutionKind.OUR_BKS_OFFICE,
    name: 'Biuro Komunikacji Społecznej (BKS — Administrator Informacji Publicznej)',
    shortDescription: 'Koordynuje wnioski UDIP, BIP, kontakty medialne, komunikację społeczną oraz Zarządzenie 535/2024.',
    competencies: ['bip', 'udip', 'komunikacja społeczna', 'media', 'rzecznik', 'konsultacje społeczne', 'zarządzenie 535/2024'],
    email: 'bks@um.bydgoszcz.pl',
    address: '85-102 Bydgoszcz, ul. Jezuicka 1',
    phone: '(52) 58-58-365',
    legalBasis: 'Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy',
  },
  {
    code: 'DEPT:WES',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Wydział Edukacji i Sportu',
    shortDescription: 'Szkoły podstawowe i ponadpodstawowe, przedszkola, dane SIO, liczba uczniów i uczniów cudzoziemców.',
    competencies: ['edukacja', 'szkoły podstawowe', 'uczniowie', 'cudzoziemcy', 'obcokrajowcy', 'przedszkola', 'sio', 'sport'],
    email: 'wes@um.bydgoszcz.pl',
    address: '85-130 Bydgoszcz, ul. Grudziądzka 9-15',
    phone: '(52) 58-58-400',
    legalBasis: null,
  },
  {
    code: 'DEPT:WZGK',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Wydział Zieleni i Gospodarki Komunalnej',
    shortDescription: 'Program opieki nad bezdomnymi zwierzętami, umowy na odławianie zwierząt, zieleń miejska i parki.',
    competencies: ['zieleń', 'parki', 'drzewa', 'bezdomne zwierzęta', 'odławianie', 'wyłapywanie', 'gospodarka komunalna'],
    email: 'wzgk@um.bydgoszcz.pl',
    address: '85-102 Bydgoszcz, ul. Jezuicka 4a',
    phone: '(52) 58-58-220',
    legalBasis: null,
  },
  {
    code: 'DEPT:SCHRONISKO',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Schronisko dla Zwierząt w Bydgoszczy',
    shortDescription: 'Ewidencja przyjęć, adopcji, zabiegów weterynaryjnych oraz statystyki bezdomnych zwierząt.',
    competencies: ['schronisko', 'bezdomne zwierzęta', 'adopcje', 'psy', 'koty', 'weterynaria'],
    email: 'azory@schronisko.org.pl',
    address: '85-435 Bydgoszcz, ul. Grunwaldzka 298',
    phone: '(52) 372-21-30',
    legalBasis: null,
  },
  {
    code: 'DEPT:WIM',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Wydział Inwestycji Miasta',
    shortDescription: 'Realizacja inwestycji miejskich, basen Astoria, projekty zagospodarowania terenu, umowy i odbiory.',
    competencies: ['inwestycje', 'astoria', 'basen', 'budowa', 'projekt zagospodarowania', 'umowy wykonawcze', 'odbiory'],
    email: 'wim@um.bydgoszcz.pl',
    address: '85-130 Bydgoszcz, ul. Grudziądzka 9-15',
    phone: '(52) 58-58-300',
    legalBasis: null,
  },
  {
    code: 'DEPT:BOS',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Bydgoskie Obiekty Sportowe (BOS)',
    shortDescription: 'Eksploatacja i koszty utrzymania miejskich obiektów sportowych, w tym kompleksu Astoria.',
    competencies: ['astoria', 'obiekty sportowe', 'pływalnia', 'koszty eksploatacji', 'harmonogram'],
    email: 'bos@um.bydgoszcz.pl',
    address: '85-064 Bydgoszcz, ul. Królowej Jadwigi 23',
    phone: '(52) 58-59-100',
    legalBasis: null,
  },
  {
    code: 'DEPT:WUK',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Wydział Uprawnień Komunikacyjnych (Zezwolenia Alkoholowe)',
    shortDescription: 'Rejestr punktów sprzedaży napojów alkoholowych, koncesje, zezwolenia oraz rejestracja pojazdów.',
    competencies: ['alkohol', 'punkty sprzedaży alkoholu', 'koncesje', 'zezwolenia alkoholowe', 'prawa jazdy'],
    email: 'wuk@um.bydgoszcz.pl',
    address: '85-130 Bydgoszcz, ul. Grudziądzka 9-15',
    phone: '(52) 58-58-600',
    legalBasis: null,
  },
  {
    code: 'DEPT:BZGOK',
    kind: InstitutionKind.INTERNAL_DEPARTMENT,
    name: 'Biuro Zarządzania Gospodarką Odpadami Komunalnymi',
    shortDescription: 'Deklaracje śmieciowe, opłaty za gospodarowanie odpadami komunalnymi i liczba mieszkańców wg ulic.',
    competencies: ['odpady komunalne', 'śmieci', 'deklaracje', 'opłaty za odpady', 'liczba mieszkańców'],
    email: 'odpady@um.bydgoszcz.pl',
    address: '85-032 Bydgoszcz, ul. Wojska Polskiego 65',
    phone: '(52) 58-58-000',
    legalBasis: null,
  },
  {
    code: 'EXT:ZUS',
    kind: InstitutionKind.EXTERNAL_INSTITUTION,
    name: 'Zakład Ubezpieczeń Społecznych (ZUS) — Oddział w Bydgoszczy',
    shortDescription: 'Emerytury, renty, składki na ubezpieczenia społeczne — UM Bydgoszcz nie jest dysponentem danych.',
    competencies: ['zus', 'emerytury', 'renty', 'składki', 'ubezpieczenia społeczne', 'świadczenia'],
    email: 'cot@zus.pl',
    address: '85-085 Bydgoszcz, ul. Św. Trójcy 33',
    phone: '(22) 560-16-00',
    legalBasis: 'Art. 4 ust. 3 UDIP — UM Bydgoszcz nie jest dysponentem danych ZUS.',
  },
  {
    code: 'EXT:ZDMIKP',
    kind: InstitutionKind.EXTERNAL_INSTITUTION,
    name: 'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP)',
    shortDescription: 'Zarządzanie drogami, komunikacja publiczna, umowy drogowe (np. 102/TT/2019), bilety, rozkłady.',
    competencies: ['zdmikp', 'drogi', 'komunikacja publiczna', 'autobusy', 'tramwaje', 'umowy drogowe', '102/tt/2019'],
    email: 'zarzad@zdmikp.bydgoszcz.pl',
    address: '85-844 Bydgoszcz, ul. Toruńska 174a',
    phone: '(52) 582-27-23',
    legalBasis: 'Art. 4 ust. 3 UDIP — właściwym dysponentem danych jest ZDMiKP.',
  },
  {
    code: 'EXT:WKZ',
    kind: InstitutionKind.EXTERNAL_INSTITUTION,
    name: 'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków — Delegatura w Bydgoszczy',
    shortDescription: 'Ochrona zabytków, rejestr zabytków, rzeźby i pomniki (w tym rzeźba Ludmiły Stehnovej).',
    competencies: ['wkz', 'konserwator zabytków', 'zabytki', 'rzeźba', 'pomniki', 'stehnova'],
    email: 'bydgoszcz@torun.wkz.gov.pl',
    address: '85-102 Bydgoszcz, ul. Jezuicka 2',
    phone: '(52) 322-44-17',
    legalBasis: 'Art. 4 ust. 3 UDIP — właściwym dysponentem danych jest Kujawsko-Pomorski WKZ.',
  },
];

export const SEED_RESPONSE_TEMPLATES: readonly {
  caseNumber: string;
  fileName: string;
  templateType: UdipTemplateType;
  summary: string;
  extractedBodyText: string;
}[] = [
  {
    caseNumber: 'BKS.IV.1431.307.2025',
    fileName: 'Odpowiedź - BKS.IV.1431.307.2025.anonymised.pdf',
    templateType: UdipTemplateType.MERIT_RESPONSE,
    summary: 'Szablon odpowiedzi merytorycznej z zestawieniem liczby uczniów i uczniów cudzoziemców w szkołach podstawowych.',
    extractedBodyText:
      'Szanowna Pani,\n\nodpowiadając na wystosowany przez Panią wniosek o udostępnienie informacji publicznej w sprawie liczby uczniów oraz uczniów cudzoziemców w szkołach podstawowych prowadzonych przez Miasto Bydgoszcz, w załączeniu przekazuję edytowalne zestawienie przygotowane przez Wydział Edukacji i Sportu na podstawie danych z Systemu Informacji Oświatowej (SIO).\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.293.2025',
    fileName: 'Odpowiedź - BKS.IV.1431.293.2025.anonymised.pdf',
    templateType: UdipTemplateType.MERIT_RESPONSE,
    summary: 'Szablon odpowiedzi wielo-wydziałowej (WZGK + Schronisko) w sprawie opieki i odławiania bezdomnych zwierząt.',
    extractedBodyText:
      'Szanowny Panie,\n\nodpowiadając na wniosek o udostępnienie informacji publicznej dotyczący opieki nad bezdomnymi zwierzętami oraz ich odławiania na terenie Miasta Bydgoszczy, przedstawiam poniżej zestawienie danych przygotowane we współpracy z Wydziałem Zieleni i Gospodarki Komunalnej oraz Schroniskiem dla Zwierząt w Bydgoszczy:\n\nAd 1. [Budżet i umowy programu opieki nad zwierzętami — WZGK]\nAd 2. [Statystyki przyjęć, adopcji i zabiegów — Schronisko]\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.15.2026',
    fileName: 'Odpowiedź - BKS.IV.1431.15.2026.anonymised.pdf',
    templateType: UdipTemplateType.EXTERNAL_REDIRECT,
    summary: 'Szablon pisma o braku dysponenta (Art. 4 ust. 3 UDIP) — przekierowanie do Wojewódzkiego Konserwatora Zabytków.',
    extractedBodyText:
      'Szanowny Panie,\n\nodpowiadając na wystosowany przez Pana wniosek o udostępnienie informacji publicznej, uprzejmie informuję, iż Urząd Miasta Bydgoszczy nie jest dysponentem wnioskowanych danych. Jednocześnie wskazuję, iż zgodnie z zasadą dostępu do informacji publicznej wyrażoną w art. 4 ust. 3 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej (t.j. Dz. U. z 2022 r. poz. 902) obowiązane do udostępnienia informacji publicznej są podmioty publiczne będące w posiadaniu tych informacji.\n\nW związku z powyższym Wnioskodawca winien się zwrócić do Kujawsko-Pomorskiego Wojewódzkiego Konserwatora Zabytków — Delegatura w Bydgoszczy, ul. Jezuicka 2, 85-102 Bydgoszcz, e-mail: bydgoszcz@torun.wkz.gov.pl.\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.16.2026',
    fileName: 'Odpowiedź - BKS.IV.1431.16.2026.anonymised.pdf',
    templateType: UdipTemplateType.MERIT_RESPONSE,
    summary: 'Szablon odpowiedzi merytorycznej w sprawie liczby punktów sprzedaży alkoholu w Bydgoszczy.',
    extractedBodyText:
      'Szanowny Panie,\n\nodpowiadając na wniosek o udostępnienie informacji publicznej dotyczący liczby punktów sprzedaży napojów alkoholowych w Bydgoszczy, informuję na podstawie danych Wydziału Uprawnień Komunikacyjnych, iż liczba aktywnych punktów sprzedaży alkoholu wynosiła [dane 2010] oraz [dane bieżące].\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.17.2026',
    fileName: 'Odpowiedź - BKS.IV.1431.17.2026.anonymised.pdf',
    templateType: UdipTemplateType.EXTERNAL_REDIRECT,
    summary: 'Szablon pisma o braku dysponenta (Art. 4 ust. 3 UDIP) — przekierowanie do ZDMiKP.',
    extractedBodyText:
      'Szanowny Panie,\n\nodpowiadając na wystosowany przez Pana wniosek o udostępnienie informacji publicznej, uprzejmie informuję, iż Urząd Miasta Bydgoszczy nie jest dysponentem wnioskowanych danych. Zgodnie z art. 4 ust. 3 ustawy o dostępie do informacji publicznej obowiązane do udostępnienia informacji publicznej są podmioty publiczne będące w posiadaniu tych informacji.\n\nW związku z powyższym Wnioskodawca winien się zwrócić do Zarządu Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy, ul. Toruńska 174a, 85-844 Bydgoszcz, e-mail: zarzad@zdmikp.bydgoszcz.pl.\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.543.2026',
    fileName: 'Kwerenda - BKS.IV.1431.543.2026.pdf',
    templateType: UdipTemplateType.KWERENDA_EXTENSION,
    summary: 'Szablon zawiadomienia o przedłużeniu terminu odpowiedzi — Kwerenda (Art. 13 ust. 2 UDIP).',
    extractedBodyText:
      'Szanowni Państwo,\n\nna podstawie art. 13 ust. 2 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej zawiadamiam, że ze względu na obszerny zakres wnioskowanych danych oraz konieczność przeprowadzenia szczegółowej kwerendy w podległych jednostkach, termin udzielenia odpowiedzi zostaje przedłużony do dnia [nowy termin].\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
  {
    caseNumber: 'BKS.IV.1431.509.2026',
    fileName: 'Doprecyzowanie - BKS.IV.1431.509.2026.pdf',
    templateType: UdipTemplateType.CLARIFICATION_CALL,
    summary: 'Szablon wezwania do doprecyzowania zakresu wniosku (7 dni).',
    extractedBodyText:
      'Szanowna Pani,\n\nw związku ze złożonym wnioskiem o udostępnienie informacji publicznej uprzejmie proszę o doprecyzowanie zakresu żądanej dokumentacji w terminie 7 dni od otrzymania niniejszego pisma, co umożliwi sprawne przygotowanie odpowiedzi.\n\nŁączę wyrazy szacunku,\nBiuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy',
  },
];

/** Export the separate InstitutionRegistry table as compact JSON ready to pass into the local LLM. */
export async function exportInstitutionRegistryForLlm(
  db: PrismaClient,
): Promise<LlmInstitutionJsonEntry[]> {
  const rows = await db.institutionRegistry.findMany({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });
  return rows.map(row => ({
    code: row.code,
    kind: row.kind,
    name: row.name,
    competencies: row.competencies,
    email: row.email,
    address: row.address,
    legalBasis: row.legalBasis,
  }));
}

/** Fetch an archived reference response PDF & extracted text by case number from ResponseTemplateArchive. */
export async function getResponseTemplateByCaseNumber(
  db: PrismaClient,
  caseNumber: string,
): Promise<ResponseTemplateRecord | null> {
  const row = await db.responseTemplateArchive.findUnique({
    where: { caseNumber },
  });
  if (!row) return null;
  return {
    uuid: row.uuid,
    caseNumber: row.caseNumber,
    fileName: row.fileName,
    mimeType: row.mimeType,
    templateType: row.templateType,
    summary: row.summary,
    extractedBodyText: row.extractedBodyText,
    fileUuid: row.fileUuid,
    kbNodeUuid: row.kbNodeUuid,
  };
}

/** List all archived reference response templates in ResponseTemplateArchive. */
export async function listResponseTemplates(
  db: PrismaClient,
): Promise<ResponseTemplateRecord[]> {
  const rows = await db.responseTemplateArchive.findMany({
    orderBy: { caseNumber: 'desc' },
  });
  return rows.map(row => ({
    uuid: row.uuid,
    caseNumber: row.caseNumber,
    fileName: row.fileName,
    mimeType: row.mimeType,
    templateType: row.templateType,
    summary: row.summary,
    extractedBodyText: row.extractedBodyText,
    fileUuid: row.fileUuid,
    kbNodeUuid: row.kbNodeUuid,
  }));
}

/**
 * Determine which of the 4 operational UDIP scenarios applies:
 * 1. OUR_OFFICE_NEW — do nas (BKS), brak podobnej sprawy w bazie -> oryginalna analiza z pomocą AI
 * 2. OUR_OFFICE_SIMILAR_FOUND — do nas, znaleziono podobną sprawę -> AI generuje draft z ResponseTemplateArchive
 * 3. EXTERNAL_INSTITUTION — inna instytucja (ZUS / ZDMiKP / WKZ) -> sugestia przekierowania (Art. 4 ust. 3 UDIP)
 * 4. OTHER_INTERNAL_DEPARTMENT — inny dział UM Bydgoszcz -> sugestia wydziałów (RED oczekuje / GREEN otrzymano)
 */
export function classifyRoutingScenario(params: {
  isTwinMatch: boolean;
  isExternalAuthority: boolean;
  recommendedDepartments: readonly string[];
}): UdipRoutingScenario {
  if (params.isExternalAuthority) {
    return 'EXTERNAL_INSTITUTION';
  }
  const hasOtherInternalDepartment = params.recommendedDepartments.some(
    dept => !dept.toLowerCase().includes('biuro komunikacji społecznej'),
  );
  if (hasOtherInternalDepartment) {
    return 'OTHER_INTERNAL_DEPARTMENT';
  }
  if (params.isTwinMatch) {
    return 'OUR_OFFICE_SIMILAR_FOUND';
  }
  return 'OUR_OFFICE_NEW';
}

/** Idempotently seed both dedicated tables: InstitutionRegistry and ResponseTemplateArchive. */
export async function seedInstitutionsAndTemplates(
  tx: Prisma.TransactionClient | PrismaClient,
): Promise<{ institutions: number; templates: number }> {
  const existingInsts = await tx.institutionRegistry.findMany({
    where: { code: { in: SEED_INSTITUTIONS.map(i => i.code) } },
    select: { code: true },
  });
  const instSet = new Set(existingInsts.map(i => i.code));
  let institutions = 0;

  for (const item of SEED_INSTITUTIONS) {
    if (instSet.has(item.code)) continue;
    await tx.institutionRegistry.create({ data: item });
    institutions++;
  }

  const existingTemplates = await tx.responseTemplateArchive.findMany({
    where: { caseNumber: { in: SEED_RESPONSE_TEMPLATES.map(t => t.caseNumber) } },
    select: { caseNumber: true },
  });
  const templateSet = new Set(existingTemplates.map(t => t.caseNumber));

  const kbNodes = await tx.kbNode.findMany({
    where: { externalKey: { in: SEED_RESPONSE_TEMPLATES.map(t => t.caseNumber) } },
    select: { uuid: true, externalKey: true },
  });
  const kbNodeIdByKey = new Map(kbNodes.map(n => [n.externalKey, n.uuid]));

  let templates = 0;
  for (const tpl of SEED_RESPONSE_TEMPLATES) {
    if (templateSet.has(tpl.caseNumber)) continue;
    await tx.responseTemplateArchive.create({
      data: {
        caseNumber: tpl.caseNumber,
        fileName: tpl.fileName,
        templateType: tpl.templateType,
        summary: tpl.summary,
        extractedBodyText: tpl.extractedBodyText,
        kbNodeUuid: kbNodeIdByKey.get(tpl.caseNumber) ?? null,
      },
    });
    templates++;
  }

  return { institutions, templates };
}
