import React from 'react';
import {
  Users,
  CircleDollarSign,
  Briefcase,
  Utensils,
  Sparkles,
  MoreHorizontal,
  LayoutDashboard,
  History,
  Shield,
  Key,
  Baby,
  Award,
  Hammer,
  ShieldAlert,
  Calendar,
  CalendarDays,
  Upload,
  Activity,
  Home,
  FileText,
  ListTodo,
} from 'lucide-react';
import { t } from './i18n';

export type TabId =
  | 'main'
  | 'events'
  | 'eventsImport'
  | 'familiesOverview'
  | 'families'
  | 'parents'
  | 'children'
  | 'alumni'
  | 'members'
  | 'jobs'
  | 'employees'
  | 'volunteerAbsences'
  | 'childcareFees'
  | 'childcareFeesAll'
  | 'hygieneBelehrung'
  | 'hygieneDocument'
  | 'kochenHygiene'
  | 'mealPlan'
  | 'mealAllergens'
  | 'audit'
  | 'admin'
  | 'activity'
  | 'kiosk'
  | 'dashboard'
  | 'dashboardTodos';

export type NavigationCategory = 'main' | 'events' | 'families' | 'mga' | 'fees' | 'pa' | 'kochen' | 'hygiene' | 'more';

export interface UserPermissionsContext {
  canReadOverview: boolean;
  canReadEvents?: boolean;
  canImportEvents?: boolean;
  canReadFamiliesAll: boolean;
  canReadFees: boolean;
  canReadFeesAll?: boolean;
  hasFamily?: boolean;
  canReadMembers: boolean;
  canReadJobs: boolean;
  canReadEmployees: boolean;
  canReadVolunteerAbsences?: boolean;
  canViewMealPlan: boolean;
  canReadMealAllergens: boolean;
  hasHygieneWrite: boolean;
  canManageHygiene?: boolean;
  canAccessPersonalHygiene?: boolean;
  canReadAudit: boolean;
  canManageUsers: boolean;
  canViewActivity: boolean;
  canProvisionKiosk: boolean;
  canUseDashboard: boolean;
  canManageDashboardTodos?: boolean;
  canViewMainPage?: boolean;
}

export interface NavSubItem {
  id: TabId;
  labelKey: string;
  defaultLabel: string;
  accessibleName?: string;
  descriptionKey?: string;
  defaultDescription: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isVisible: (ctx: UserPermissionsContext) => boolean;
}

export interface NavCategory {
  id: NavigationCategory;
  labelKey: string;
  defaultLabel: string;
  accessibleName?: string;
  descriptionKey?: string;
  defaultDescription: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: NavSubItem[];
  collapsibleInSidebar?: boolean;
}

export const NAVIGATION_CATEGORIES: NavCategory[] = [
  {
    id: 'main',
    labelKey: 'navMain',
    defaultLabel: 'Start',
    accessibleName: 'Start',
    descriptionKey: 'catDescMain',
    defaultDescription: 'Tagesübersicht über Kochen, Essen und wichtige Kita-Infos.',
    icon: Home,
    items: [
      {
        id: 'main',
        labelKey: 'subtabMain',
        defaultLabel: 'Start',
        accessibleName: 'Start',
        descriptionKey: 'subtabDescMain',
        defaultDescription: 'Tagesübersicht über Kochen, Essen und wichtige Kita-Infos.',
        icon: Home,
        isVisible: (ctx) => Boolean(ctx.canViewMainPage),
      },
    ],
  },
  {
    id: 'events',
    labelKey: 'navEvents',
    defaultLabel: 'Termine',
    accessibleName: 'Termine',
    descriptionKey: 'catDescEvents',
    defaultDescription: 'Kita-Kalender, Schließzeiten, Elternabende und Feste.',
    icon: CalendarDays,
    items: [
      {
        id: 'events',
        labelKey: 'subtabEvents',
        defaultLabel: 'Termine',
        accessibleName: 'Termine',
        descriptionKey: 'subtabDescEvents',
        defaultDescription: 'Kita-Kalender, Schließzeiten, Elternabende und Feste.',
        icon: CalendarDays,
        isVisible: (ctx) => Boolean(ctx.canReadEvents),
      },
      {
        id: 'eventsImport',
        labelKey: 'subtabEventsImport',
        defaultLabel: 'TSV Import',
        accessibleName: 'TSV Import',
        descriptionKey: 'subtabDescEventsImport',
        defaultDescription: 'Termine per TSV-Tabelle und KI-Prompt in den Kalender importieren.',
        icon: Upload,
        isVisible: (ctx) => Boolean(ctx.canImportEvents),
      },
    ],
  },
  {
    id: 'families',
    labelKey: 'navFamilies',
    defaultLabel: 'Familien',
    descriptionKey: 'catDescFamilies',
    defaultDescription: 'Tagesaktuelle Übersicht aller Kita-Familien und Gruppen.',
    icon: Users,
    items: [
      {
        id: 'familiesOverview',
        labelKey: 'subtabFamilies',
        defaultLabel: 'Familien',
        accessibleName: 'Familien',
        descriptionKey: 'subtabDescOverview',
        defaultDescription: 'Tagesaktuelle Übersicht der Kita-Gruppen und Familien.',
        icon: Users,
        isVisible: (ctx) => ctx.canReadOverview,
      },
    ],
  },
  {
    id: 'mga',
    labelKey: 'navMga',
    defaultLabel: 'MGA',
    descriptionKey: 'catDescMga',
    defaultDescription: 'Mitglieder- und Gruppenangelegenheiten: Familien, Eltern, Kinder, Vereinsmitglieder und Jobs.',
    icon: Users,
    items: [
      {
        id: 'families',
        labelKey: 'subtabFamilies',
        defaultLabel: 'Familien',
        accessibleName: 'Familien(MGA)',
        descriptionKey: 'subtabDescFamilies',
        defaultDescription: 'Familienstammdaten, Kontaktdaten und Adresslisten aller Kita-Familien.',
        icon: Users,
        isVisible: (ctx) => ctx.canReadFamiliesAll,
      },
      {
        id: 'parents',
        labelKey: 'subtabParents',
        defaultLabel: 'Eltern',
        accessibleName: 'Eltern(MGA)',
        descriptionKey: 'subtabDescParents',
        defaultDescription: 'Kontaktdaten, Telefonnummern, Adressen und Abholberechtigungen der Eltern.',
        icon: Users,
        isVisible: (ctx) => ctx.canReadFamiliesAll,
      },
      {
        id: 'children',
        labelKey: 'subtabChildren',
        defaultLabel: 'Kinder',
        accessibleName: 'Kinder(MGA)',
        descriptionKey: 'subtabDescChildren',
        defaultDescription: 'Kinderstammdaten, Gruppen, Geburtstage, Impfstatus und Einschulung.',
        icon: Baby,
        isVisible: (ctx) => ctx.canReadFamiliesAll,
      },
      {
        id: 'members',
        labelKey: 'subtabMembers',
        defaultLabel: 'Vereinsmitglieder',
        accessibleName: 'Vereinsmitglieder',
        descriptionKey: 'subtabDescMembers',
        defaultDescription: 'Vereinsmitglieder, Mitgliedschaftsarten und Beitrittsdaten.',
        icon: Award,
        isVisible: (ctx) => ctx.canReadMembers,
      },
      {
        id: 'jobs',
        labelKey: 'subtabJobs',
        defaultLabel: 'Jobs',
        accessibleName: 'Jobs(MGA)',
        descriptionKey: 'subtabDescJobs',
        defaultDescription: 'Gemeinschaftsarbeit, Elternjobs und Zuweisungen an Familien.',
        icon: Hammer,
        isVisible: (ctx) => ctx.canReadJobs,
      },
    ],
  },
  {
    id: 'fees',
    labelKey: 'navFees',
    defaultLabel: 'Gebühren',
    accessibleName: 'Betreuungsgebühren',
    descriptionKey: 'catDescFees',
    defaultDescription: 'Berechnung und Übersicht der monatlichen Betreuungsgebühren.',
    icon: CircleDollarSign,
    items: [
      {
        id: 'childcareFees',
        labelKey: 'subtabChildcareFeesPersonal',
        defaultLabel: 'Meine Gebühren',
        accessibleName: 'Meine Gebühren',
        descriptionKey: 'subtabDescChildcareFeesPersonal',
        defaultDescription: 'Berechnung und Übersicht der eigenen monatlichen Betreuungsgebühren.',
        icon: CircleDollarSign,
        isVisible: (ctx) => ctx.canReadFees,
      },
      {
        id: 'childcareFeesAll',
        labelKey: 'subtabChildcareFeesAll',
        defaultLabel: 'Betreuungsgebühren (alle)',
        accessibleName: 'Betreuungsgebühren (alle)',
        descriptionKey: 'subtabDescChildcareFeesAll',
        defaultDescription: 'Berechnung und Übersicht aller monatlichen Betreuungsgebühren.',
        icon: CircleDollarSign,
        isVisible: (ctx) => Boolean(ctx.canReadFeesAll),
      },
    ],
  },
  {
    id: 'pa',
    labelKey: 'navPa',
    defaultLabel: 'PA',
    descriptionKey: 'catDescPa',
    defaultDescription: 'Personalverwaltung und Mitarbeitendenstammdaten.',
    icon: Briefcase,
    items: [
      {
        id: 'employees',
        labelKey: 'subtabEmployees',
        defaultLabel: 'Mitarbeitende',
        accessibleName: 'Mitarbeitende(PA)',
        descriptionKey: 'subtabDescEmployees',
        defaultDescription: 'Mitarbeitendenstammdaten, Qualifikationen und Kinderschutz.',
        icon: Briefcase,
        isVisible: (ctx) => ctx.canReadEmployees,
      },
      {
        id: 'volunteerAbsences',
        labelKey: 'subtabVolunteerAbsences',
        defaultLabel: 'Abwesenheit Freiwillige',
        accessibleName: 'Abwesenheit Freiwillige(PA)',
        descriptionKey: 'subtabDescVolunteerAbsences',
        defaultDescription: 'Übersicht und Verwaltung der Abwesenheiten von Freiwilligen.',
        icon: Calendar,
        isVisible: (ctx) => Boolean(ctx.canReadVolunteerAbsences),
      },
    ],
  },
  {
    id: 'kochen',
    labelKey: 'navKochen',
    defaultLabel: 'Kochen',
    descriptionKey: 'catDescKochen',
    defaultDescription: 'Essensplanung, Wochenspeisepläne und Allergenmanagement.',
    icon: Utensils,
    items: [
      {
        id: 'mealAllergens',
        labelKey: 'subtabAllergens',
        defaultLabel: 'Allergene',
        accessibleName: 'Essen/Allergene',
        descriptionKey: 'subtabDescAllergens',
        defaultDescription: 'Übersicht und Abgleich bekannter Nahrungsmittelallergien.',
        icon: ShieldAlert,
        isVisible: (ctx) => ctx.canReadMealAllergens,
      },
      {
        id: 'mealPlan',
        labelKey: 'subtabMealPlan',
        defaultLabel: 'Wochenplan',
        accessibleName: 'Essen/Wochenplan',
        descriptionKey: 'subtabDescMealPlan',
        defaultDescription: 'Wöchentlicher Speiseplan, Menükomponenten und Druckansicht.',
        icon: Calendar,
        isVisible: (ctx) => ctx.canViewMealPlan,
      },
      {
        id: 'kochenHygiene',
        labelKey: 'subtabKochenHygiene',
        defaultLabel: 'Hygiene',
        accessibleName: 'Kochen/Hygiene',
        descriptionKey: 'subtabDescKochenHygiene',
        defaultDescription: 'Persönlicher Status zur Hygienebelehrung (§ 43 IfSG) und Leitfaden.',
        icon: Sparkles,
        isVisible: (ctx) => Boolean(ctx.canAccessPersonalHygiene),
      },
      {
        id: 'dashboard',
        labelKey: 'dashboard',
        defaultLabel: 'Kochansicht',
        accessibleName: 'Kochansicht',
        descriptionKey: 'subtabDescDashboard',
        defaultDescription: 'Tagesübersicht für Kochen und Küche.',
        icon: LayoutDashboard,
        isVisible: (ctx) => ctx.canUseDashboard,
      },
      {
        id: 'dashboardTodos',
        labelKey: 'subtabDashboardTodos',
        defaultLabel: 'TODOs verwalten',
        accessibleName: 'Kochen/TODOs',
        descriptionKey: 'subtabDescDashboardTodos',
        defaultDescription: 'Aufgaben und Hinweise der Kochansicht verwalten.',
        icon: ListTodo,
        isVisible: (ctx) => Boolean(ctx.canManageDashboardTodos),
      },
    ],
  },
  {
    id: 'hygiene',
    labelKey: 'navHygieneamt',
    defaultLabel: 'Hygieneamt',
    descriptionKey: 'catDescHygieneamt',
    defaultDescription: 'Infektionsschutz und Nachverfolgung der Belehrungen.',
    icon: Sparkles,
    items: [
      {
        id: 'hygieneBelehrung',
        labelKey: 'subtabHygieneBelehrungen',
        defaultLabel: 'Belehrungen',
        accessibleName: 'Hygieneamt/Belehrungen',
        descriptionKey: 'subtabDescHygieneBelehrungen',
        defaultDescription: 'Übersicht aller Belehrungen und Auffrischungen.',
        icon: Sparkles,
        isVisible: (ctx) => Boolean(ctx.canManageHygiene || ctx.hasHygieneWrite),
      },
      {
        id: 'hygieneDocument',
        labelKey: 'subtabHygieneDocument',
        defaultLabel: 'Belehrungsdokument',
        accessibleName: 'Hygieneamt/Belehrungsdokument',
        descriptionKey: 'subtabDescHygieneDocument',
        defaultDescription: 'Konfiguration des Dokuments zur Hygiene-Folgebelehrung.',
        icon: FileText,
        isVisible: (ctx) => Boolean(ctx.canManageHygiene),
      },
    ],
  },
  {
    id: 'more',
    labelKey: 'navMore',
    defaultLabel: 'Mehr',
    descriptionKey: 'catDescMore',
    defaultDescription: 'Zusätzliche Werkzeuge, Historie und Verwaltung.',
    icon: MoreHorizontal,
    collapsibleInSidebar: true,
    items: [
      {
        id: 'audit',
        labelKey: 'audit',
        defaultLabel: 'Historie',
        accessibleName: 'Historie',
        descriptionKey: 'subtabDescAudit',
        defaultDescription: 'Audit-Protokoll und Änderungshistorie aller Datensätze.',
        icon: History,
        isVisible: (ctx) => ctx.canReadAudit,
      },
      {
        id: 'admin',
        labelKey: 'adminUsers',
        defaultLabel: 'Admin/Benutzer',
        accessibleName: 'Admin',
        descriptionKey: 'subtabDescAdmin',
        defaultDescription: 'Benutzerverwaltung und Berechtigungen.',
        icon: Shield,
        isVisible: (ctx) => ctx.canManageUsers,
      },
      {
        id: 'activity',
        labelKey: 'feedbackAndActivity',
        defaultLabel: 'Admin/Feedback und Aktivität',
        accessibleName: 'Admin/Feedback und Aktivität',
        descriptionKey: 'subtabDescActivity',
        defaultDescription: 'Übersicht über Feedback, Feature-Nutzung und authentifizierte Benutzer.',
        icon: Activity,
        isVisible: (ctx) => ctx.canViewActivity || ctx.canManageUsers,
      },
      {
        id: 'kiosk',
        labelKey: 'kioskCertificates',
        defaultLabel: 'Kiosk-Zertifikate',
        accessibleName: 'Kiosk-Zertifikate',
        descriptionKey: 'subtabDescKiosk',
        defaultDescription: 'Bereitstellung und Verwaltung von Kiosk-Zertifikaten.',
        icon: Key,
        isVisible: (ctx) => ctx.canProvisionKiosk,
      },
    ],
  },
];

export const getCategoryForTab = (tab: TabId | string): NavigationCategory | '' => {
  // Check if tab is one of the items in a category first (e.g. 'families' belongs to 'mga')
  for (const cat of NAVIGATION_CATEGORIES) {
    if (cat.items.some((item) => item.id === tab)) {
      return cat.id;
    }
  }

  // If tab is already a category id (e.g. landing page 'mga' or 'kochen')
  const matchedCat = NAVIGATION_CATEGORIES.find((cat) => cat.id === tab);
  if (matchedCat) return matchedCat.id;

  return '';
};

export const getCategoryConfig = (catId: NavigationCategory): NavCategory | undefined => {
  return NAVIGATION_CATEGORIES.find((cat) => cat.id === catId);
};

export const getVisibleNavigationCategories = (
  perms: UserPermissionsContext
): Array<NavCategory & { visibleItems: NavSubItem[] }> => {
  return NAVIGATION_CATEGORIES.map((cat) => ({
    ...cat,
    visibleItems: cat.items.filter((item) => item.isVisible(perms)),
  })).filter((cat) => cat.visibleItems.length > 0);
};

export const getVisibleSubTabsForCategory = (
  catId: NavigationCategory | string,
  perms: UserPermissionsContext
): NavSubItem[] => {
  const cat = NAVIGATION_CATEGORIES.find((c) => c.id === catId);
  if (!cat) return [];
  return cat.items.filter((item) => item.isVisible(perms));
};

export const categoryHasLandingPage = (
  catId: NavigationCategory | string,
  perms: UserPermissionsContext
): boolean => {
  // events, fees and pa categories land directly on their primary page and use subtabs
  if (catId === 'events' || catId === 'fees' || catId === 'pa') return false;
  const visible = getVisibleSubTabsForCategory(catId, perms);
  return visible.length > 1;
};

export const getFirstPermittedTabForCategory = (
  catId: NavigationCategory | string,
  perms: UserPermissionsContext
): TabId => {
  if (catId === 'fees') {
    if (perms.canReadFeesAll && perms.hasFamily === false) {
      return 'childcareFeesAll';
    }
    if (perms.canReadFees) {
      return 'childcareFees';
    }
  }
  const visible = getVisibleSubTabsForCategory(catId, perms);
  if (visible.length > 0) return visible[0].id;
  // Fallbacks if no visible tab
  return perms.canViewMainPage ? 'main' : 'familiesOverview';
};

export const getCategoryLabel = (cat: NavCategory): string => {
  return t(cat.labelKey) || cat.defaultLabel;
};

export const getCategoryDescription = (cat: NavCategory): string => {
  return (cat.descriptionKey ? t(cat.descriptionKey) : '') || cat.defaultDescription;
};

export const getSubItemLabel = (item: NavSubItem): string => {
  return t(item.labelKey) || item.defaultLabel;
};

export const getSubItemDescription = (item: NavSubItem): string => {
  return (item.descriptionKey ? t(item.descriptionKey) : '') || item.defaultDescription;
};
