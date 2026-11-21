import {
  UdipDeptStatus,
  UdipProcessStatus,
  UdipRoutingType,
  UdipTemplateType,
  type Prisma,
  type PrismaClient,
} from './generated/prisma/client.js';

export type UdipHealthColor = 'GREEN' | 'RED';

export type UdipAlertCode =
  | 'WIELO_WYDZIALOWY'
  | 'BRAK_DYSPONENTA_ZUS_ZDMIKP'
  | 'BLIZNIACZA_SPRAWA_W_BAZIE'
  | 'TERMIN_PILNY'
  | 'KWERENDA_LUB_DOPRECYZOWANIE';

export interface UdipDepartmentQueryRecord {
  uuid: string;
  caseUuid: string;
  sortOrder: number;
  departmentName: string;
  departmentEmail: string | null;
  status: UdipDeptStatus;
  questionText: string | null;
  replyText: string | null;
  replyFileName: string | null;
  replyFileUuid: string | null;
  sentAt: Date | null;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UdipCaseRecord {
  uuid: string;
  caseNumber: string;
  year: number;
  sequenceNumber: number;
  registryNumber: string | null;
  applicantName: string;
  applicantContact: string | null;
  subject: string;
  receivedDate: Date;
  deadlineDate: Date;
  deadlineNote: string | null;
  answeredDate: Date | null;
  assigneeName: string;
  assigneeInitials: string;
  assigneeUserUuid: string | null;
  processStatus: UdipProcessStatus;
  isMultiDepartment: boolean;
  sourceFileUuid: string | null;
  sourceMode: string | null;
  verifiedRequestText: string | null;
  ocrConfidence: number | null;
  matchedCaseNumber: string | null;
  matchSimilarity: number | null;
  routingType: UdipRoutingType;
  externalAuthorityName: string | null;
  letterTemplateType: UdipTemplateType | null;
  draftResponseText: string | null;
  anonymizedResponseText: string | null;
  piiRedactionsCount: number;
  addedToKnowledgeGraph: boolean;
  createdByUuid: string | null;
  updatedByUuid: string | null;
  createdAt: Date;
  updatedAt: Date;
  daysRemaining: number;
  healthColor: UdipHealthColor;
  alerts: UdipAlertCode[];
  departmentQueries: UdipDepartmentQueryRecord[];
}

export interface UdipCaseListResult {
  total: number;
  greenCount: number;
  redCount: number;
  multiDepartmentCount: number;
  cases: UdipCaseRecord[];
}

export interface UdipCaseFilter {
  year?: number;
  processStatus?: UdipProcessStatus;
  healthColor?: UdipHealthColor;
  search?: string;
  referenceDate?: Date;
}

export interface CreateUdipCaseInput {
  year?: number;
  sequenceNumber?: number;
  registryNumber?: string | null;
  applicantName: string;
  applicantContact?: string | null;
  subject: string;
  receivedDate?: Date | string;
  deadlineDate?: Date | string;
  deadlineNote?: string | null;
  assigneeName?: string;
  assigneeInitials?: string;
  assigneeUserUuid?: string | null;
  processStatus?: UdipProcessStatus;
  sourceFileUuid?: string | null;
  sourceMode?: string | null;
  verifiedRequestText?: string | null;
  ocrConfidence?: number | null;
  matchedCaseNumber?: string | null;
  matchSimilarity?: number | null;
  routingType?: UdipRoutingType;
  externalAuthorityName?: string | null;
  letterTemplateType?: UdipTemplateType | null;
  draftResponseText?: string | null;
  actorUuid?: string | null;
  departments?: {
    departmentName: string;
    departmentEmail?: string | null;
    status?: UdipDeptStatus;
    questionText?: string | null;
    replyText?: string | null;
    replyFileName?: string | null;
    replyFileUuid?: string | null;
  }[];
}

export interface UpdateUdipCaseInput {
  processStatus?: UdipProcessStatus;
  deadlineDate?: Date | string;
  deadlineNote?: string | null;
  answeredDate?: Date | string | null;
  assigneeName?: string;
  assigneeInitials?: string;
  verifiedRequestText?: string | null;
  draftResponseText?: string | null;
  anonymizedResponseText?: string | null;
  piiRedactionsCount?: number;
  addedToKnowledgeGraph?: boolean;
  actorUuid?: string | null;
}

export interface UpsertUdipDepartmentReplyInput {
  departmentQueryUuid?: string;
  departmentName?: string;
  status?: UdipDeptStatus;
  replyText?: string | null;
  replyFileName?: string | null;
  replyFileUuid?: string | null;
  actorUuid?: string | null;
}

const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Format official UM Bydgoszcz BKS UDIP signature: BKS.IV.1431.<nr>.<rok> */
export function formatUdipCaseNumber(sequenceNumber: number, year: number): string {
  return `BKS.IV.1431.${sequenceNumber}.${year}`;
}

/** Extract initials from a clerk display name (e.g. "Pracownik 1" -> "P1", "Łukasz Okoński" -> "ŁO"). */
export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'BKS';
  return parts
    .slice(0, 3)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 8);
}

/**
 * Deterministically compute `daysRemaining`, `healthColor` ("GREEN" | "RED"), and `alerts`
 * for the Clerk Calendar/Table (10 cases: 5 Green / 5 Red).
 */
export function computeUdipCaseHealth(
  row: {
    processStatus: UdipProcessStatus;
    deadlineDate: Date;
    answeredDate: Date | null;
    isMultiDepartment: boolean;
    routingType: UdipRoutingType;
    matchedCaseNumber: string | null;
    departmentQueries?: { status: UdipDeptStatus }[];
  },
  referenceDate: Date = new Date(),
): {
  daysRemaining: number;
  healthColor: UdipHealthColor;
  alerts: UdipAlertCode[];
} {
  const refDay = startOfUtcDay(referenceDate);
  const deadlineDay = startOfUtcDay(row.deadlineDate);
  const daysRemaining =
    row.processStatus === UdipProcessStatus.E
      ? 0
      : Math.round((deadlineDay - refDay) / MS_PER_DAY);

  const hasKwerendaDept =
    row.departmentQueries?.some(d => d.status === UdipDeptStatus.KWERENDA_REQUESTED) ?? false;

  // Completed cases (status E) or comfortable active cases (>= 4 days left, not in Kwerenda C) are GREEN;
  // urgent/overdue deadlines (<= 3 days) or cases paused in Kwerenda/Doprecyzowanie (status C) are RED.
  const healthColor: UdipHealthColor =
    row.processStatus === UdipProcessStatus.E
      ? 'GREEN'
      : daysRemaining <= 3 || row.processStatus === UdipProcessStatus.C || hasKwerendaDept
        ? 'RED'
        : 'GREEN';

  const alerts: UdipAlertCode[] = [];
  if (row.isMultiDepartment) {
    alerts.push('WIELO_WYDZIALOWY');
  }
  if (row.routingType === UdipRoutingType.EXTERNAL_AUTHORITY) {
    alerts.push('BRAK_DYSPONENTA_ZUS_ZDMIKP');
  }
  if (row.matchedCaseNumber) {
    alerts.push('BLIZNIACZA_SPRAWA_W_BAZIE');
  }
  if (row.processStatus === UdipProcessStatus.C || hasKwerendaDept) {
    alerts.push('KWERENDA_LUB_DOPRECYZOWANIE');
  }
  if (row.processStatus !== UdipProcessStatus.E && daysRemaining <= 2) {
    alerts.push('TERMIN_PILNY');
  }

  return { daysRemaining, healthColor, alerts };
}

type RawUdipCaseWithDepts = Prisma.UdipCalendarCaseGetPayload<{
  include: { departmentQueries: true };
}>;

export function toUdipCaseRecord(
  row: RawUdipCaseWithDepts,
  referenceDate: Date = new Date(),
): UdipCaseRecord {
  const sortedDepts = [...row.departmentQueries].sort((a, b) => a.sortOrder - b.sortOrder);
  const isMultiDepartment = row.isMultiDepartment || sortedDepts.length >= 2;
  const { daysRemaining, healthColor, alerts } = computeUdipCaseHealth(
    { ...row, isMultiDepartment, departmentQueries: sortedDepts },
    referenceDate,
  );
  return {
    ...row,
    isMultiDepartment,
    daysRemaining,
    healthColor,
    alerts,
    departmentQueries: sortedDepts,
  };
}

function addUtcDays(base: Date, days: number): Date {
  return new Date(startOfUtcDay(base) + days * MS_PER_DAY);
}

/**
 * Build the 10 official Bydgoszcz cases from `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx`:
 * - 5 GREEN cases (completed on time in 2025 / early 2026)
 * - 5 RED cases (active urgent/multi-department/kwerenda cases in work right now)
 */
export function buildBydgoszczSeedCases(referenceDate: Date = new Date()) {
  const today = new Date(startOfUtcDay(referenceDate));

  return [
    // --- 5 GREEN CASES ---
    {
      caseNumber: 'BKS.IV.1431.293.2025',
      year: 2025,
      sequenceNumber: 293,
      registryNumber: '11820/2025',
      applicantName: 'Antoni Ptak Stowarzyszenie Obrony Zwierzątek',
      applicantContact: 'kontakt@obronazwierzatek.org.pl',
      subject: 'Opieka i odławianie bezdomnych zwierząt.',
      receivedDate: new Date('2025-06-12T00:00:00.000Z'),
      deadlineDate: new Date('2025-06-26T00:00:00.000Z'),
      deadlineNote: null,
      answeredDate: new Date('2025-06-26T00:00:00.000Z'),
      assigneeName: 'Pracownik 1',
      assigneeInitials: 'P1',
      processStatus: UdipProcessStatus.E,
      isMultiDepartment: true,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wniosek o udostępnienie informacji publicznej w zakresie programu opieki nad zwierzętami bezdomnymi, finansowania schroniska oraz odławiania bezdomnych zwierząt na terenie Miasta Bydgoszczy.',
      ocrConfidence: 0.99,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      addedToKnowledgeGraph: true,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Zieleni i Gospodarki Komunalnej',
          departmentEmail: 'wzgk@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Dane dot. budżetu programu opieki nad bezdomnymi zwierzętami oraz umów na odławianie.',
          replyText: 'Przekazano zestawienie wydatków oraz wykaz podmiotów realizujących odławianie zwierząt w 2024/2025 r.',
          replyFileName: 'Odpowiedz_WZGK_293_2025.pdf',
          sentAt: new Date('2025-06-13T08:30:00.000Z'),
          repliedAt: new Date('2025-06-23T14:15:00.000Z'),
        },
        {
          sortOrder: 1,
          departmentName: 'Schronisko dla Zwierząt w Bydgoszczy',
          departmentEmail: 'azory@schronisko.org.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Statystyki przyjęć, adopcji i zabiegów weterynaryjnych.',
          replyText: 'Przekazano roczne zestawienie liczby przyjętych psów i kotów oraz wykonanych zabiegów.',
          replyFileName: 'Statystyki_Schronisko_293_2025.docx',
          sentAt: new Date('2025-06-13T08:35:00.000Z'),
          repliedAt: new Date('2025-06-24T11:20:00.000Z'),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.307.2025',
      year: 2025,
      sequenceNumber: 307,
      registryNumber: '12410/2025',
      applicantName: 'Ewa Góra',
      applicantContact: 'ewa.gora@poczta.example.pl',
      subject:
        'Aktualne zestawienie liczby uczniów w szkołach podstawowych. Proszę też o podanie liczby obcokrajowców w poszczególnych szkołach.',
      receivedDate: new Date('2025-06-25T00:00:00.000Z'),
      deadlineDate: new Date('2025-07-09T00:00:00.000Z'),
      deadlineNote: null,
      answeredDate: new Date('2025-07-08T00:00:00.000Z'),
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.E,
      isMultiDepartment: false,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wnoszę o udostępnienie aktualnego zestawienia liczby uczniów w szkołach podstawowych prowadzonych przez Miasto Bydgoszcz z wyszczególnieniem liczby uczniów będących obcokrajowcami.',
      ocrConfidence: 0.99,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      addedToKnowledgeGraph: true,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Edukacji i Sportu',
          departmentEmail: 'wes@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Zestawienie liczby uczniów ogółem oraz uczniów cudzoziemców w szkołach podstawowych.',
          replyText: 'W załączeniu tabela SIO ze stanem uczniów i uczniów cudzoziemców w podziale na szkoły podstawowe.',
          replyFileName: 'Zestawienie_WES_307_2025.xlsx',
          sentAt: new Date('2025-06-26T09:00:00.000Z'),
          repliedAt: new Date('2025-07-04T13:10:00.000Z'),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.15.2026',
      year: 2026,
      sequenceNumber: 15,
      registryNumber: '1980/2026',
      applicantName: 'Jacek Rzeźbiarz',
      applicantContact: 'j.rzezbiarz@art.example.pl',
      subject:
        'Zapytanie o rzeźbę Ludmiły Stehnovej która została usunięta z wyspy Ronda Grunwaldzkiego.',
      receivedDate: new Date('2026-01-09T00:00:00.000Z'),
      deadlineDate: new Date('2026-01-23T00:00:00.000Z'),
      deadlineNote: null,
      answeredDate: new Date('2026-01-14T00:00:00.000Z'),
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.E,
      isMultiDepartment: false,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wniosek o informację dotyczącą aktualnego stanu i lokalizacji przechowywania rzeźby Ludmiły Stehnovej usuniętej z wyspy Ronda Grunwaldzkiego.',
      ocrConfidence: 0.99,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.EXTERNAL_AUTHORITY,
      externalAuthorityName:
        'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków — Delegatura w Bydgoszczy (ul. Jezuicka 2)',
      letterTemplateType: UdipTemplateType.EXTERNAL_REDIRECT,
      addedToKnowledgeGraph: true,
      departments: [],
    },
    {
      caseNumber: 'BKS.IV.1431.16.2026',
      year: 2026,
      sequenceNumber: 16,
      registryNumber: '3468/2026',
      applicantName: 'Jerzy Dociekliwy',
      applicantContact: 'ul. Gdańska, Bydgoszcz',
      subject:
        'Pytanie o liczbę punktów sprzedaży alkoholu powstałych od objęcia funkcji prezydenta przez Rafała Bruskiego do dzisiaj.',
      receivedDate: new Date('2026-01-09T00:00:00.000Z'),
      deadlineDate: new Date('2026-01-23T00:00:00.000Z'),
      deadlineNote: null,
      answeredDate: new Date('2026-01-20T00:00:00.000Z'),
      assigneeName: 'Pracownik 1',
      assigneeInitials: 'P1',
      processStatus: UdipProcessStatus.E,
      isMultiDepartment: false,
      sourceMode: 'handwritten_scan',
      verifiedRequestText:
        'PREZYDENT BYDGOSZCZ. Ile punktów sprzedaży alkoholu przybyło w Bydgoszczy od czasu objęcia funkcji Prezydenta przez R. Bruskiego do dnia dzisiejszego? Odpowiedź w trybie administracyjnym. Jerzy',
      ocrConfidence: 0.91,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      addedToKnowledgeGraph: true,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Uprawnień Komunikacyjnych (Zezwolenia Alkoholowe)',
          departmentEmail: 'wuk@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Dane dot. liczby punktów sprzedaży napojów alkoholowych w latach 2010–2026.',
          replyText:
            'W 2010 r. funkcjonowało 835 punktów sprzedaży alkoholu, natomiast na dzień 15.01.2026 r. funkcjonuje 719 punktów (spadek o 116 punktów).',
          replyFileName: null,
          sentAt: new Date('2026-01-10T09:15:00.000Z'),
          repliedAt: new Date('2026-01-16T12:40:00.000Z'),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.17.2026',
      year: 2026,
      sequenceNumber: 17,
      registryNumber: '3612/2026',
      applicantName: 'abcxyz@jahu.komm',
      applicantContact: 'abcxyz@jahu.komm',
      subject:
        'Proszę o udostępnienie informacji publicznej dot. realizacji umowy nr 102/TT/2019 z Jakotako spółką z o.o. zgodnie z załączonymi wnioskami.',
      receivedDate: new Date('2026-01-14T00:00:00.000Z'),
      deadlineDate: new Date('2026-01-28T00:00:00.000Z'),
      deadlineNote: null,
      answeredDate: new Date('2026-01-15T00:00:00.000Z'),
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.E,
      isMultiDepartment: false,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Proszę o udostępnienie informacji publicznej dotyczącej realizacji umowy nr 102/TT/2019 z Jakotako spółką z o.o.',
      ocrConfidence: 0.99,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.EXTERNAL_AUTHORITY,
      externalAuthorityName:
        'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP, ul. Toruńska 174a)',
      letterTemplateType: UdipTemplateType.EXTERNAL_REDIRECT,
      addedToKnowledgeGraph: true,
      departments: [],
    },

    // --- 5 RED CASES (Active in work: urgent deadlines, kwerenda, doprecyzowanie, multi-department) ---
    {
      caseNumber: 'BKS.IV.1431.18.2026',
      year: 2026,
      sequenceNumber: 18,
      registryNumber: '3790/2026',
      applicantName: 'Ksiądz',
      applicantContact: 'parafia@bydgoszcz.example.pl',
      subject:
        'Liczba mieszkańców wskazanych ulic według opłat za gospodarowanie odpadami komunalnymi.',
      receivedDate: addUtcDays(today, -14),
      deadlineDate: today, // 0 days left (due today!)
      deadlineNote: 'Termin ustawowy mija dzisiaj (14 dni)',
      answeredDate: null,
      assigneeName: 'Pracownik 1',
      assigneeInitials: 'P1',
      processStatus: UdipProcessStatus.B,
      isMultiDepartment: false,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Proszę o podanie liczby mieszkańców zamieszkujących wskazane ulice w Bydgoszczy według złożonych deklaracji o wysokości opłaty za gospodarowanie odpadami komunalnymi.',
      ocrConfidence: 0.98,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      addedToKnowledgeGraph: false,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Biuro Zarządzania Gospodarką Odpadami Komunalnymi',
          departmentEmail: 'odpady@um.bydgoszcz.pl',
          status: UdipDeptStatus.PENDING,
          questionText: 'Zestawienie liczby mieszkańców wg deklaracji odpadowych dla wskazanych ulic.',
          replyText: null,
          replyFileName: null,
          sentAt: addUtcDays(today, -12),
          repliedAt: null,
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.509.2026',
      year: 2026,
      sequenceNumber: 509,
      registryNumber: '18420/2026',
      applicantName: 'Ewa Górna',
      applicantContact: 'ewa.gorna@architektura.example.pl',
      subject:
        'Dokumentacja dotycząca basenu Astorii: projekt zagospodarowania terenu; projekt zagospodarowania zieleni; wizualizacje; zestawienie parametrów technicznych budynku.',
      receivedDate: addUtcDays(today, -15),
      deadlineDate: addUtcDays(today, 1), // 1 day left + doprecyzowanie
      deadlineNote: '19.08.2026/18.09.2026 - doprecyzowanie wniosku',
      answeredDate: null,
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.C,
      isMultiDepartment: true,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wnoszę o udostępnienie dokumentacji dotyczącej basenu Astorii: projekt zagospodarowania terenu, projekt zagospodarowania zieleni, wizualizacje oraz zestawienie parametrów technicznych budynku.',
      ocrConfidence: 0.99,
      matchedCaseNumber: null,
      matchSimilarity: null,
      routingType: UdipRoutingType.CLARIFICATION_7D,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.CLARIFICATION_CALL,
      addedToKnowledgeGraph: false,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Inwestycji Miasta',
          departmentEmail: 'wim@um.bydgoszcz.pl',
          status: UdipDeptStatus.KWERENDA_REQUESTED,
          questionText: 'Projekt zagospodarowania terenu oraz zestawienie parametrów technicznych Astorii.',
          replyText:
            'Dokumentacja obejmuje ponad 40 tomów — prosimy o wezwanie wnioskodawcy do doprecyzowania, których branż i etapów dotyczy wniosek.',
          replyFileName: null,
          sentAt: addUtcDays(today, -13),
          repliedAt: addUtcDays(today, -7),
        },
        {
          sortOrder: 1,
          departmentName: 'Wydział Zieleni i Gospodarki Komunalnej',
          departmentEmail: 'wzgk@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Projekt zagospodarowania zieleni wokół kompleksu Astoria.',
          replyText: 'Przekazano część opisową projektu nasadzeń wokół obiektu Astoria.',
          replyFileName: 'Astoria_Zielen_Opis.pdf',
          sentAt: addUtcDays(today, -13),
          repliedAt: addUtcDays(today, -4),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.543.2026',
      year: 2026,
      sequenceNumber: 543,
      registryNumber: '19811/2026',
      applicantName: 'Stowarzyszenie Obrony Zwierzątek',
      applicantContact: 'kontakt@obronazwierzatek.org.pl',
      subject: 'Opieka nad bezdomnymi zwierzętami i ich wyłapywanie.',
      receivedDate: addUtcDays(today, -13),
      deadlineDate: addUtcDays(today, 2), // Kwerenda Art. 13 ust. 2 UDIP
      deadlineNote: 'Kwerenda (Art. 13 ust. 2 UDIP — przedłużenie terminu)',
      answeredDate: null,
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.C,
      isMultiDepartment: true,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wniosek o udostępnienie danych dotyczących opieki nad bezdomnymi zwierzętami, kosztów utrzymania schroniska oraz liczby odłowionych zwierząt w bieżącym okresie.',
      ocrConfidence: 0.99,
      matchedCaseNumber: 'BKS.IV.1431.293.2025',
      matchSimilarity: 0.94,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.KWERENDA_EXTENSION,
      addedToKnowledgeGraph: false,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Zieleni i Gospodarki Komunalnej',
          departmentEmail: 'wzgk@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Dane finansowe i umowy dot. opieki nad bezdomnymi zwierzętami w 2026 r.',
          replyText: 'Przekazano wykaz zawartych umów i wydatków budżetowych za I–III kwartał 2026 r.',
          replyFileName: 'WZGK_Zwierzeta_543_2026.pdf',
          sentAt: addUtcDays(today, -11),
          repliedAt: addUtcDays(today, -3),
        },
        {
          sortOrder: 1,
          departmentName: 'Schronisko dla Zwierząt w Bydgoszczy',
          departmentEmail: 'azory@schronisko.org.pl',
          status: UdipDeptStatus.KWERENDA_REQUESTED,
          questionText: 'Szczegółowa ewidencja odłowionych zwierząt i kart weterynaryjnych.',
          replyText: 'Trwa weryfikacja 420 kart ewidencyjnych — wymagane wydłużenie terminu (kwerenda).',
          replyFileName: null,
          sentAt: addUtcDays(today, -11),
          repliedAt: addUtcDays(today, -2),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.590.2026',
      year: 2026,
      sequenceNumber: 590,
      registryNumber: '21405/2026',
      applicantName: 'Budowlanka S.A.',
      applicantContact: 'biuro@budowlanka.example.pl',
      subject: 'Kompleks Astoria.',
      receivedDate: addUtcDays(today, -15),
      deadlineDate: addUtcDays(today, -1), // 1 day overdue (-1)
      deadlineNote: 'Oczekuje na odpowiedź Wydziału Inwestycji Miasta',
      answeredDate: null,
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.B,
      isMultiDepartment: true,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wniosek o udostępnienie informacji publicznej dotyczącej rozliczenia inwestycji Kompleks Astoria, protokołów odbiorowych oraz kosztów eksploatacji.',
      ocrConfidence: 0.99,
      matchedCaseNumber: 'BKS.IV.1431.509.2026',
      matchSimilarity: 0.82,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      addedToKnowledgeGraph: false,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Inwestycji Miasta',
          departmentEmail: 'wim@um.bydgoszcz.pl',
          status: UdipDeptStatus.PENDING,
          questionText: 'Zestawienie umów wykonawczych, aneksów i protokołów odbioru Kompleksu Astoria.',
          replyText: null,
          replyFileName: null,
          sentAt: addUtcDays(today, -14),
          repliedAt: null,
        },
        {
          sortOrder: 1,
          departmentName: 'Bydgoskie Obiekty Sportowe (BOS)',
          departmentEmail: 'bos@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Koszty bieżącego utrzymania i harmonogram udostępniania basenu Astoria.',
          replyText: 'Przekazano zestawienie kosztów operacyjnych za I półrocze 2026 r.',
          replyFileName: 'BOS_Astoria_590_2026.pdf',
          sentAt: addUtcDays(today, -14),
          repliedAt: addUtcDays(today, -2),
        },
      ],
    },
    {
      caseNumber: 'BKS.IV.1431.599.2026',
      year: 2026,
      sequenceNumber: 599,
      registryNumber: '21988/2026',
      applicantName: 'Ewa Góra',
      applicantContact: 'ewa.gora@poczta.example.pl',
      subject:
        'Edytowalne zestawienie liczby uczniów oraz uczniów cudzoziemców w poszczególnych szkołach podstawowych w Bydgoszczy - stan na koniec czerwca 2026 oraz stan na wrzesień 2026.',
      receivedDate: addUtcDays(today, -13),
      deadlineDate: addUtcDays(today, 1), // 1 day left (due tomorrow!)
      deadlineNote: 'Gotowy szablon z bliźniaczej sprawy BKS.IV.1431.307.2025 (96%)',
      answeredDate: null,
      assigneeName: 'Pracownik 2',
      assigneeInitials: 'P2',
      processStatus: UdipProcessStatus.D,
      isMultiDepartment: false,
      sourceMode: 'digital_pdf',
      verifiedRequestText:
        'Wnoszę o udostępnienie edytowalnego zestawienia liczby uczniów oraz uczniów cudzoziemców w poszczególnych szkołach podstawowych w Bydgoszczy — stan na koniec czerwca 2026 oraz stan na wrzesień 2026.',
      ocrConfidence: 0.99,
      matchedCaseNumber: 'BKS.IV.1431.307.2025',
      matchSimilarity: 0.96,
      routingType: UdipRoutingType.INTERNAL_DEPARTMENTS,
      externalAuthorityName: null,
      letterTemplateType: UdipTemplateType.MERIT_RESPONSE,
      draftResponseText:
        'Odpowiadając na wniosek o udostępnienie informacji publicznej w sprawie liczby uczniów oraz uczniów cudzoziemców w szkołach podstawowych prowadzonych przez Miasto Bydgoszcz, w załączeniu przekazuję edytowalne zestawienie według stanu na czerwiec 2026 r. oraz wrzesień 2026 r.',
      addedToKnowledgeGraph: false,
      departments: [
        {
          sortOrder: 0,
          departmentName: 'Wydział Edukacji i Sportu',
          departmentEmail: 'wes@um.bydgoszcz.pl',
          status: UdipDeptStatus.REPLIED,
          questionText: 'Edytowalne zestawienie liczby uczniów i uczniów cudzoziemców (czerwiec i wrzesień 2026).',
          replyText:
            'W załączeniu tabela z danymi z Systemu Informacji Oświatowej (SIO) wg stanu na 30.06.2026 r. oraz 30.09.2026 r. Przygotowała: Anna Kowalska, tel. prywatny 601-234-567, PESEL 88041209876.',
          replyFileName: 'SIO_Szkoly_Podstawowe_2026.xlsx',
          sentAt: addUtcDays(today, -12),
          repliedAt: addUtcDays(today, -1),
        },
      ],
    },
  ];
}

/**
 * Idempotently seed the 10 Bydgoszcz UDIP cases and their expandable department rows inside an active transaction or client.
 */
export async function seedUdipCases(
  tx: Prisma.TransactionClient | PrismaClient,
  actorUuid?: string | null,
  referenceDate: Date = new Date(),
): Promise<number> {
  const seedCases = buildBydgoszczSeedCases(referenceDate);
  const existing = await tx.udipCalendarCase.findMany({
    where: { caseNumber: { in: seedCases.map(c => c.caseNumber) } },
    select: { caseNumber: true },
  });
  const existingSet = new Set(existing.map(row => row.caseNumber));
  let createdCount = 0;

  for (const item of seedCases) {
    if (existingSet.has(item.caseNumber)) continue;
    const { departments, ...caseFields } = item;
    await tx.udipCalendarCase.create({
      data: {
        ...caseFields,
        createdByUuid: actorUuid ?? null,
        updatedByUuid: actorUuid ?? null,
        departmentQueries: {
          create: departments,
        },
      },
    });
    createdCount++;
  }

  return createdCount;
}

/**
 * List UDIP cases sorted oldest-to-newest (`receivedDate ASC, sequenceNumber ASC`) with computed
 * `daysRemaining`, `healthColor` (5 Green / 5 Red), `alerts`, and inline `departmentQueries`.
 */
export async function listUdipCases(
  db: PrismaClient,
  filter: UdipCaseFilter = {},
): Promise<UdipCaseListResult> {
  const referenceDate = filter.referenceDate ?? new Date();
  const trimmedSearch = filter.search?.trim().replace(/[\\%_]/g, '\\$&') ?? '';

  const where: Prisma.UdipCalendarCaseWhereInput = {
    ...(filter.year !== undefined ? { year: filter.year } : {}),
    ...(filter.processStatus !== undefined ? { processStatus: filter.processStatus } : {}),
    ...(trimmedSearch
      ? {
          OR: [
            { caseNumber: { contains: trimmedSearch, mode: 'insensitive' } },
            { applicantName: { contains: trimmedSearch, mode: 'insensitive' } },
            { subject: { contains: trimmedSearch, mode: 'insensitive' } },
            { registryNumber: { contains: trimmedSearch, mode: 'insensitive' } },
            { externalAuthorityName: { contains: trimmedSearch, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const rows = await db.udipCalendarCase.findMany({
    where,
    orderBy: [{ year: 'asc' }, { receivedDate: 'asc' }, { sequenceNumber: 'asc' }],
    include: {
      departmentQueries: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const allMapped = rows.map(row => toUdipCaseRecord(row, referenceDate));
  const greenCount = allMapped.filter(c => c.healthColor === 'GREEN').length;
  const redCount = allMapped.filter(c => c.healthColor === 'RED').length;
  const multiDepartmentCount = allMapped.filter(c => c.isMultiDepartment).length;

  const filtered =
    filter.healthColor !== undefined
      ? allMapped.filter(c => c.healthColor === filter.healthColor)
      : allMapped;

  return {
    total: filtered.length,
    greenCount,
    redCount,
    multiDepartmentCount,
    cases: filtered,
  };
}

/** Fetch a single UDIP case by UUID or official caseNumber (`BKS.IV.1431.<nr>.<rok>`). */
export async function getUdipCase(
  db: PrismaClient,
  identifier: string,
  referenceDate: Date = new Date(),
): Promise<UdipCaseRecord | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const row = await db.udipCalendarCase.findUnique({
    where: isUuid ? { uuid: identifier } : { caseNumber: identifier },
    include: {
      departmentQueries: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  return row ? toUdipCaseRecord(row, referenceDate) : null;
}

/**
 * Create a new UDIP case (from `+ Nowy Wniosek` or OCR Verification confirm),
 * automatically allocating the next sequential `BKS.IV.1431.<nr>.<year>` number.
 */
export async function createUdipCase(
  db: PrismaClient,
  input: CreateUdipCaseInput,
  referenceDate: Date = new Date(),
): Promise<UdipCaseRecord> {
  return db.$transaction(async tx => {
    const receivedDate = input.receivedDate ? new Date(input.receivedDate) : new Date();
    const year = input.year ?? receivedDate.getUTCFullYear();

    let sequenceNumber = input.sequenceNumber;
    if (!sequenceNumber) {
      const aggregate = await tx.udipCalendarCase.aggregate({
        where: { year },
        _max: { sequenceNumber: true },
      });
      sequenceNumber = (aggregate._max.sequenceNumber ?? 0) + 1;
    }

    const caseNumber = formatUdipCaseNumber(sequenceNumber, year);
    const deadlineDate = input.deadlineDate
      ? new Date(input.deadlineDate)
      : addUtcDays(receivedDate, 14);
    const assigneeName = input.assigneeName?.trim() || 'Pracownik 1';
    const assigneeInitials =
      input.assigneeInitials?.trim() || deriveInitials(assigneeName);
    const departments = input.departments ?? [];
    const isMultiDepartment = departments.length >= 2;
    const processStatus =
      input.processStatus
      ?? (departments.length > 0 ? UdipProcessStatus.B : UdipProcessStatus.A);

    const created = await tx.udipCalendarCase.create({
      data: {
        caseNumber,
        year,
        sequenceNumber,
        registryNumber: input.registryNumber ?? null,
        applicantName: input.applicantName.trim(),
        applicantContact: input.applicantContact?.trim() || null,
        subject: input.subject.trim(),
        receivedDate,
        deadlineDate,
        deadlineNote: input.deadlineNote ?? null,
        assigneeName,
        assigneeInitials,
        assigneeUserUuid: input.assigneeUserUuid ?? null,
        processStatus,
        isMultiDepartment,
        sourceFileUuid: input.sourceFileUuid ?? null,
        sourceMode: input.sourceMode ?? null,
        verifiedRequestText: input.verifiedRequestText ?? null,
        ocrConfidence: input.ocrConfidence ?? null,
        matchedCaseNumber: input.matchedCaseNumber ?? null,
        matchSimilarity: input.matchSimilarity ?? null,
        routingType: input.routingType ?? UdipRoutingType.INTERNAL_DEPARTMENTS,
        externalAuthorityName: input.externalAuthorityName ?? null,
        letterTemplateType: input.letterTemplateType ?? null,
        draftResponseText: input.draftResponseText ?? null,
        createdByUuid: input.actorUuid ?? null,
        updatedByUuid: input.actorUuid ?? null,
        departmentQueries: {
          create: departments.map((dept, idx) => ({
            sortOrder: idx,
            departmentName: dept.departmentName.trim(),
            departmentEmail: dept.departmentEmail?.trim() || null,
            status: dept.status ?? UdipDeptStatus.PENDING,
            questionText: dept.questionText ?? null,
            replyText: dept.replyText ?? null,
            replyFileName: dept.replyFileName ?? null,
            replyFileUuid: dept.replyFileUuid ?? null,
            sentAt: new Date(),
            repliedAt: dept.status === UdipDeptStatus.REPLIED ? new Date() : null,
          })),
        },
      },
      include: {
        departmentQueries: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return toUdipCaseRecord(created, referenceDate);
  });
}

/** Update a UDIP case's process status (A–E), deadline/kwerenda, or draft/anonymized text. */
export async function updateUdipCase(
  db: PrismaClient,
  caseUuid: string,
  input: UpdateUdipCaseInput,
  referenceDate: Date = new Date(),
): Promise<UdipCaseRecord | null> {
  const existing = await db.udipCalendarCase.findUnique({ where: { uuid: caseUuid } });
  if (!existing) return null;

  const nextStatus = input.processStatus ?? existing.processStatus;
  const answeredDate =
    input.answeredDate !== undefined
      ? input.answeredDate
        ? new Date(input.answeredDate)
        : null
      : nextStatus === UdipProcessStatus.E && !existing.answeredDate
        ? new Date()
        : existing.answeredDate;

  const updated = await db.udipCalendarCase.update({
    where: { uuid: caseUuid },
    data: {
      ...(input.processStatus !== undefined ? { processStatus: input.processStatus } : {}),
      ...(input.deadlineDate !== undefined ? { deadlineDate: new Date(input.deadlineDate) } : {}),
      ...(input.deadlineNote !== undefined ? { deadlineNote: input.deadlineNote } : {}),
      answeredDate,
      ...(input.assigneeName !== undefined ? { assigneeName: input.assigneeName } : {}),
      ...(input.assigneeInitials !== undefined ? { assigneeInitials: input.assigneeInitials } : {}),
      ...(input.verifiedRequestText !== undefined
        ? { verifiedRequestText: input.verifiedRequestText }
        : {}),
      ...(input.draftResponseText !== undefined ? { draftResponseText: input.draftResponseText } : {}),
      ...(input.anonymizedResponseText !== undefined
        ? { anonymizedResponseText: input.anonymizedResponseText }
        : {}),
      ...(input.piiRedactionsCount !== undefined
        ? { piiRedactionsCount: input.piiRedactionsCount }
        : {}),
      ...(input.addedToKnowledgeGraph !== undefined
        ? { addedToKnowledgeGraph: input.addedToKnowledgeGraph }
        : {}),
      ...(input.actorUuid !== undefined ? { updatedByUuid: input.actorUuid } : {}),
    },
    include: {
      departmentQueries: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return toUdipCaseRecord(updated, referenceDate);
}

/**
 * Attach a department reply (pasted email text or PDF/DOCX file metadata) directly inside
 * the expandable Calendar Table row.
 */
export async function upsertUdipDepartmentReply(
  db: PrismaClient,
  caseUuid: string,
  input: UpsertUdipDepartmentReplyInput,
  referenceDate: Date = new Date(),
): Promise<UdipCaseRecord | null> {
  return db.$transaction(async tx => {
    const parent = await tx.udipCalendarCase.findUnique({
      where: { uuid: caseUuid },
      include: { departmentQueries: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!parent) return null;

    const nextStatus =
      input.status
      ?? (input.replyText || input.replyFileName || input.replyFileUuid
        ? UdipDeptStatus.REPLIED
        : UdipDeptStatus.PENDING);

    if (input.departmentQueryUuid) {
      const target = parent.departmentQueries.find(d => d.uuid === input.departmentQueryUuid);
      if (!target) return null;
      await tx.udipDepartmentQuery.update({
        where: { uuid: target.uuid },
        data: {
          ...(input.departmentName ? { departmentName: input.departmentName.trim() } : {}),
          status: nextStatus,
          ...(input.replyText !== undefined ? { replyText: input.replyText } : {}),
          ...(input.replyFileName !== undefined ? { replyFileName: input.replyFileName } : {}),
          ...(input.replyFileUuid !== undefined ? { replyFileUuid: input.replyFileUuid } : {}),
          repliedAt: nextStatus === UdipDeptStatus.REPLIED ? new Date() : target.repliedAt,
        },
      });
    } else if (input.departmentName) {
      await tx.udipDepartmentQuery.create({
        data: {
          caseUuid,
          sortOrder: parent.departmentQueries.length,
          departmentName: input.departmentName.trim(),
          status: nextStatus,
          replyText: input.replyText ?? null,
          replyFileName: input.replyFileName ?? null,
          replyFileUuid: input.replyFileUuid ?? null,
          sentAt: new Date(),
          repliedAt: nextStatus === UdipDeptStatus.REPLIED ? new Date() : null,
        },
      });
    } else {
      return null;
    }

    const refreshedDepts = await tx.udipDepartmentQuery.findMany({
      where: { caseUuid },
      orderBy: { sortOrder: 'asc' },
    });
    const allReplied =
      refreshedDepts.length > 0 && refreshedDepts.every(d => d.status === UdipDeptStatus.REPLIED);

    const updatedParent = await tx.udipCalendarCase.update({
      where: { uuid: caseUuid },
      data: {
        isMultiDepartment: refreshedDepts.length >= 2,
        ...(allReplied && parent.processStatus === UdipProcessStatus.B
          ? { processStatus: UdipProcessStatus.D }
          : {}),
        ...(input.actorUuid !== undefined ? { updatedByUuid: input.actorUuid } : {}),
      },
      include: {
        departmentQueries: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return toUdipCaseRecord(updatedParent, referenceDate);
  });
}
