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
  Activity,
} from 'lucide-react';
import { t } from './i18n';

export type TabId =
  | 'familiesOverview'
  | 'families'
  | 'parents'
  | 'children'
  | 'members'
  | 'jobs'
  | 'employees'
  | 'childcareFees'
  | 'hygieneBelehrung'
  | 'mealPlan'
  | 'mealAllergens'
  | 'audit'
  | 'admin'
  | 'activity'
  | 'kiosk'
  | 'dashboard';

export type NavigationCategory = 'families' | 'mga' | 'fees' | 'pa' | 'kochen' | 'hygiene' | 'more';

export interface UserPermissionsContext {
  canReadOverview: boolean;
  canReadFamiliesAll: boolean;
  canReadFees: boolean;
  canReadMembers: boolean;
  canReadJobs: boolean;
  canReadEmployees: boolean;
  canViewMealPlan: boolean;
  canReadMealAllergens: boolean;
  hasHygieneWrite: boolean;
  canReadAudit: boolean;
  canManageUsers: boolean;
  canViewActivity: boolean;
  canProvisionKiosk: boolean;
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
        labelKey: 'navFees',
        defaultLabel: 'Gebühren',
        accessibleName: 'Betreuungsgebühren',
        descriptionKey: 'subtabDescFees',
        defaultDescription: 'Berechnung und Übersicht monatlicher Betreuungsgebühren.',
        icon: CircleDollarSign,
        isVisible: (ctx) => ctx.canReadFees,
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
    ],
  },
  {
    id: 'hygiene',
    labelKey: 'navHygiene',
    defaultLabel: 'Hygiene',
    descriptionKey: 'catDescHygiene',
    defaultDescription: 'Infektionsschutz- und Hygienebelehrungen.',
    icon: Sparkles,
    items: [
      {
        id: 'hygieneBelehrung',
        labelKey: 'navHygiene',
        defaultLabel: 'Hygiene',
        accessibleName: 'Hygiene',
        descriptionKey: 'subtabDescHygiene',
        defaultDescription: 'Nachverfolgung von Infektionsschutz- und Hygienebelehrungen.',
        icon: Sparkles,
        isVisible: (ctx) => ctx.canReadFamiliesAll || ctx.hasHygieneWrite,
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
        id: 'dashboard',
        labelKey: 'dashboard',
        defaultLabel: 'Dashboard',
        accessibleName: 'Dashboard',
        descriptionKey: 'subtabDescDashboard',
        defaultDescription: 'Tagesübersicht für den Kiosk-Modus.',
        icon: LayoutDashboard,
        isVisible: () => true,
      },
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
        labelKey: 'admin',
        defaultLabel: 'Admin',
        accessibleName: 'Admin',
        descriptionKey: 'subtabDescAdmin',
        defaultDescription: 'Benutzerverwaltung und Berechtigungen.',
        icon: Shield,
        isVisible: (ctx) => ctx.canManageUsers,
      },
      {
        id: 'activity',
        labelKey: 'activity',
        defaultLabel: 'Aktivität & Feature-Nutzung',
        accessibleName: 'Aktivität & Feature-Nutzung',
        descriptionKey: 'subtabDescActivity',
        defaultDescription: 'Übersicht über Feature-Nutzung und authentifizierte Benutzer.',
        icon: Activity,
        isVisible: (ctx) => ctx.canViewActivity,
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
  const visible = getVisibleSubTabsForCategory(catId, perms);
  return visible.length > 1;
};

export const getFirstPermittedTabForCategory = (
  catId: NavigationCategory | string,
  perms: UserPermissionsContext
): TabId => {
  const visible = getVisibleSubTabsForCategory(catId, perms);
  if (visible.length > 0) return visible[0].id;
  // Fallbacks if no visible tab
  return 'familiesOverview';
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
