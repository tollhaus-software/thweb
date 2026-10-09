export type Locale = 'de' | 'en';

export const CURRENT_LOCALE: Locale = 'de'; // Switch default locale in code here

const translations: Record<Locale, Record<string, string>> = {
  de: {
    title: 'Kindergarten-Verzeichnis',
    logout: 'Abmelden',
    parents: 'Eltern',
    children: 'Kinder',
    families: 'Familien',
    searchParents: 'Eltern suchen...',
    searchChildren: 'Kinder suchen...',
    addFamily: 'Familie hinzufügen',
    addParent: 'Elternteil hinzufügen',
    addChild: 'Kind hinzufügen',
    firstName: 'Vorname',
    lastName: 'Nachname',
    birthDate: 'Geburtsdatum',
    firstNameEdit: 'Vorname',
    lastNameEdit: 'Nachname',
    emailsEdit: 'E-Mails',
    phonesEdit: 'Telefonnummern',
    birthDateEdit: 'Geburtsdatum',
    startDate: 'Betreuungsbeginn',
    startdatum: 'Startdatum',
    exitDate: 'Betreuungsende',
    startGroup: 'Startgruppe',
    hortStartDate: 'Hort-Beginn',
    group2StartDate: 'Gr. Gruppe Beginn',
    group1: 'Kleine Gruppe',
    group2: 'Grosse Gruppe',
    group3: 'Hort',
    group: 'Gruppe',
    groupChange: 'Gruppenwechsel',
    manageGroupChanges: 'Gruppenwechsel verwalten',
    addGroupChange: 'Gruppenwechsel hinzufügen',
    targetGroup: 'Zielgruppe',
    groupChangeDeleteConfirm: 'Möchten Sie diesen Gruppenwechsel wirklich löschen?',
    noGroupChangesRecorded: 'Keine Gruppenwechsel für dieses Kind erfasst',
    exit: 'Austritt',
    exited: 'Ausgetreten',
    futureEnrollmentPrefix: 'ab',
    addEmail: 'E-Mail hinzufügen',
    addPhone: 'Telefonnummer hinzufügen',
    addParentTo: 'Elternteil hinzufügen zu',
    addChildTo: 'Kind hinzufügen zu',
    parent1: 'Elternteil 1',
    parent2: 'Elternteil 2',
    cancel: 'Abbrechen',
    newItem: 'Neuer Eintrag...',
    loading: 'Laden...',
    save: 'Speichern',
    requiredFields: 'Bitte füllen Sie alle Pflichtfelder aus.',
    parent1Required: 'Vorname und Nachname von Elternteil 1 sind erforderlich.',
    parent2Failed: 'Familie erstellt, aber Elternteil 2 konnte nicht hinzugefügt werden.',
    editFirstName: 'Vorname bearbeiten',
    editLastName: 'Nachname bearbeiten',
    editEmail: 'E-Mail bearbeiten',
    editPhone: 'Telefonnummer bearbeiten',
    editBirthDate: 'Geburtsdatum bearbeiten',
    editStartDate: 'Betreuungsbeginn bearbeiten',
    editExitDate: 'Betreuungsende bearbeiten',
    editStartGroup: 'Startgruppe bearbeiten',
    editHortStartDate: 'Hort-Beginn bearbeiten',
    editGroup2StartDate: 'Beginn Grosse Gruppe bearbeiten',
    invalidDateFormat: 'Bitte geben Sie ein gültiges Datum im Format TT.MM.JJJJ ein.',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    deleteFamilyConfirm: 'Sind Sie sicher, dass Sie diese Familie löschen möchten? Dadurch werden auch alle zugeordneten Eltern und Kinder gelöscht.',
    deleteParentConfirm: 'Sind Sie sicher, dass Sie diesen Elternteil löschen möchten?',
    deleteChildConfirm: 'Sind Sie sicher, dass Sie dieses Kind löschen möchten?',
    notes: 'Notizen',
    editNotes: 'Notizen bearbeiten',
    childcareFees: 'Betreuungsgebühren',
    startMonth: 'Startmonat',
    endMonth: 'Endmonat',
    selectFamilies: 'Familien auswählen',
    searchFamilies: 'Familien suchen...',
    selectAll: 'Alle auswählen',
    deselectAll: 'Alle abwählen',
    noFamiliesFound: 'Keine Familien gefunden',
    familiesSelected: 'Familien ausgewählt',
    calculating: 'Wird berechnet...',
    calculate: 'Berechnen',
    familyFeesGrid: 'Monatliche Gebühren pro Familie',
    family: 'Familie',
    feeChanges: 'Gebührenänderungen',
    effectiveMonth: 'Wirksamer Monat',
    previousFee: 'Vorherige Gebühr',
    newFee: 'Neue Gebühr',
    reason: 'Grund',
    noFeeChanges: 'Keine Gebührenänderungen in diesem Zeitraum erfasst',
    selectAtLeastOneFamily: 'Bitte wählen Sie mindestens eine Familie aus.',
    startMonthAfterEndMonth: 'Startmonat darf nicht nach Endmonat liegen.',
    changeHeader: 'Änderung',
    noDetails: 'Keine Details vorhanden',
    hygieneBelehrung: 'Hygienebelehrung',
    initialTraining: 'Schulung am',
    lastInstruction: 'Letzte Belehrung',
    manageEvents: 'Belehrungen verwalten',
    addEvent: 'Schulung hinzufügen',
    eventType: 'Typ',
    initialType: 'Initialschulung',
    recertifyType: 'Folgebelehrung',
    documentation: 'Dokumentation',
    noEventsRecorded: 'Keine Belehrungen für diese Person erfasst',
    date: 'Datum',
    manageHygieneTitle: 'Belehrungsnachweis für',
    invalidDate: 'Bitte geben Sie ein gültiges Datum ein',
    eventDeleteConfirm: 'Möchten Sie diese Schulung wirklich löschen?',
    th_membership: 'Mitgliedschaft',
    full_member: 'Voll',
    supporting_member: 'Förder',
    expired: 'beendet',
    manageMemberships: 'Mitgliedschaften verwalten',
    addMembership: 'Mitgliedschaft hinzufügen',
    membershipType: 'Typ',
    membershipDeleteConfirm: 'Möchten Sie diese Mitgliedschaft wirklich löschen?',
    noMembershipsRecorded: 'Keine Vereinsmitgliedschaft für diese Person erfasst',
    startDateLabel: 'Beginn',
    endDateLabel: 'Ende',
    columns: 'Spalten',
    toggleColumns: 'Spalten anzeigen/ausblenden',
    audit: 'Audit',
    timestamp: 'Zeitstempel',
    userLabel: 'Benutzer',
    operationLabel: 'Aktion',
    entityTypeLabel: 'Objekt-Typ',
    entityIdLabel: 'Objekt-ID',
    detailsLabel: 'Details',
    admin: 'Admin',
    roles: 'Rollen',
    users: 'Benutzer',
    addUser: 'Benutzer hinzufügen',
    addRole: 'Rolle hinzufügen',
    roleId: 'Rollen-ID',
    roleName: 'Rollenname',
    permissions: 'Berechtigungen',
    assignedRoles: 'Zugeordnete Rollen',
    effectivePermissions: 'Wirksame Berechtigungen',
    customPermissions: 'Benutzerdefinierte Berechtigungen',
    editUser: 'Benutzer bearbeiten',
    editRole: 'Rolle bearbeiten',
    deleteUserConfirm: 'Möchten Sie diesen Benutzer wirklich löschen?',
    deleteRoleConfirm: 'Möchten Sie diese Rolle wirklich löschen?',
    noChildrenYet: 'Noch keine Kinder hinzugefügt',
    vaccinationStatus: 'Impfstatus',
    showVaccinationStatus: 'Impfstatus anzeigen',
    vaccinationStatusUnlocked: 'Impfstatus entschlüsselt',
    vaccinationStatusHidden: 'Geschützt (Klicken zum Entsperren)',
    kmsAccessDenied: 'Sie haben keinen Zugriff auf den KMS-Schlüssel.',
    jumpToParent: 'Elternteil in der Tabelle „Eltern“ anzeigen',
    jumpToChild: 'Kind in der Tabelle „Kinder“ anzeigen',
    backToFamilies: 'Zurück zu Familien',
    dismiss: 'Schließen',
    viewingParentFromFamily: 'Elternteil von Familie',
    viewingChildFromFamily: 'Kind von Familie',
    dailyBrief: 'Tagesübersicht',
    kioskDashboard: 'Dashboard',
    whoIsCooking: 'Koch / Köchin',
    mealTitle: 'Es gibt:',
    tasksAndInfoTitle: 'Hinweise & Aufgaben',
    cleanCoffeeMachine: 'Kaffeemaschine reinigen',
    yellowBinPutOut: 'Gelbe Tonne rausstellen',
    yellowBinRetrieve: 'Gelbe Tonne reinholen',
    noCook: '–',
    noMeal: 'Kein Speiseplan für heute vorhanden',
    noTasks: 'Keine anstehenden Aufgaben',
    today: 'Heute',
    previousDay: 'Vorheriger Tag',
    nextDay: 'Nächster Tag',
    backToPortal: 'Zur Verwaltung',
    anleitungen: 'Anleitungen',
    home: 'Home',
  },
  en: {
    title: 'Kindergarten Directory',
    logout: 'Logout',
    parents: 'Parents',
    children: 'Children',
    families: 'Families',
    childcareFees: 'Childcare Fees',
    searchParents: 'Search parents...',
    searchChildren: 'Search children...',
    addFamily: 'Add Family',
    addParent: 'Add Parent',
    addChild: 'Add Child',
    firstName: 'First Name',
    lastName: 'Last Name',
    birthDate: 'Birth Date',
    firstNameEdit: 'First Name',
    lastNameEdit: 'Last Name',
    emailsEdit: 'Emails',
    phonesEdit: 'Phones',
    birthDateEdit: 'Birth Date',
    startDate: 'Start Date',
    startdatum: 'Start Date',
    exitDate: 'Exit Date',
    startGroup: 'Start Group',
    hortStartDate: 'Hort Start Date',
    group2StartDate: 'Large Group Start Date',
    group1: 'group 1',
    group2: 'group 2',
    group3: 'hort',
    group: 'Group',
    groupChange: 'Group Change',
    manageGroupChanges: 'Manage Group Changes',
    addGroupChange: 'Add Group Change',
    targetGroup: 'Target Group',
    groupChangeDeleteConfirm: 'Are you sure you want to delete this group change?',
    noGroupChangesRecorded: 'No group changes recorded for this child',
    exit: 'Exit',
    exited: 'Exited',
    futureEnrollmentPrefix: 'from',
    addEmail: 'Add email',
    addPhone: 'Add phone',
    addParentTo: 'Add Parent to',
    addChildTo: 'Add Child to',
    parent1: 'Parent 1',
    parent2: 'Parent 2',
    cancel: 'Cancel',
    newItem: 'New item...',
    loading: 'Loading...',
    save: 'Save',
    requiredFields: 'Please provide all required fields.',
    parent1Required: 'Parent 1 First name and Last name are required.',
    parent2Failed: 'Family created, but Parent 2 addition failed.',
    editFirstName: 'Edit first name',
    editLastName: 'Edit last name',
    editEmail: 'Edit email',
    editPhone: 'Edit phone',
    editBirthDate: 'Edit birth date',
    editStartDate: 'Edit start date',
    editExitDate: 'Edit exit date',
    editStartGroup: 'Edit start group',
    editHortStartDate: 'Edit hort start date',
    editGroup2StartDate: 'Edit Large Group start date',
    invalidDateFormat: 'Please enter a valid date in YYYY-MM-DD format.',
    edit: 'Edit',
    delete: 'Delete',
    deleteFamilyConfirm: 'Are you sure you want to delete this family? This will also delete all associated parents and children.',
    deleteParentConfirm: 'Are you sure you want to delete this parent?',
    deleteChildConfirm: 'Are you sure you want to delete this child?',
    notes: 'Notes',
    editNotes: 'Edit Notes',
    startMonth: 'Start Month',
    endMonth: 'End Month',
    selectFamilies: 'Select Families',
    searchFamilies: 'Search families...',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    noFamiliesFound: 'No families found',
    familiesSelected: 'families selected',
    calculating: 'Calculating...',
    calculate: 'Calculate',
    familyFeesGrid: 'Monthly Fees per Family',
    family: 'Family',
    feeChanges: 'Fee Changes',
    effectiveMonth: 'Effective Month',
    previousFee: 'Previous Fee',
    newFee: 'New Fee',
    reason: 'Reason',
    noFeeChanges: 'No fee changes recorded in this period',
    selectAtLeastOneFamily: 'Please select at least one family.',
    startMonthAfterEndMonth: 'Start month cannot be after end month.',
    changeHeader: 'Change',
    noDetails: 'No details available',
    hygieneBelehrung: 'Hygiene Instruction',
    initialTraining: 'Initial Training',
    lastInstruction: 'Last Instruction',
    manageEvents: 'Manage Instructions',
    addEvent: 'Add Event',
    eventType: 'Type',
    initialType: 'Initial',
    recertifyType: 'Recertify',
    documentation: 'Documentation',
    noEventsRecorded: 'No instruction events recorded for this parent',
    date: 'Date',
    manageHygieneTitle: 'Instruction Record for',
    invalidDate: 'Please enter a valid date',
    eventDeleteConfirm: 'Are you sure you want to delete this event?',
    th_membership: 'Membership',
    full_member: 'full',
    supporting_member: 'supporting',
    expired: 'expired',
    manageMemberships: 'Manage Memberships',
    addMembership: 'Add Membership',
    membershipType: 'Type',
    membershipDeleteConfirm: 'Are you sure you want to delete this membership?',
    noMembershipsRecorded: 'No membership records found for this parent',
    startDateLabel: 'Start Date',
    endDateLabel: 'End Date',
    columns: 'Columns',
    toggleColumns: 'Show/Hide Columns',
    audit: 'Audit',
    timestamp: 'Timestamp',
    userLabel: 'User',
    operationLabel: 'Action',
    entityTypeLabel: 'Entity Type',
    entityIdLabel: 'Entity ID',
    detailsLabel: 'Details',
    admin: 'Admin',
    roles: 'Roles',
    users: 'Users',
    addUser: 'Add User',
    addRole: 'Add Role',
    roleId: 'Role ID',
    roleName: 'Role Name',
    permissions: 'Permissions',
    assignedRoles: 'Assigned Roles',
    effectivePermissions: 'Effective Permissions',
    customPermissions: 'Custom Permissions',
    editUser: 'Edit User',
    editRole: 'Edit Role',
    deleteUserConfirm: 'Are you sure you want to delete this user?',
    deleteRoleConfirm: 'Are you sure you want to delete this role?',
    noChildrenYet: 'No children added yet',
    vaccinationStatus: 'Vaccination status',
    showVaccinationStatus: 'Show vaccination status',
    vaccinationStatusUnlocked: 'Vaccination status decrypted',
    vaccinationStatusHidden: 'Protected (Click to unlock)',
    kmsAccessDenied: 'User has no access to the KMS key.',
    jumpToParent: 'View parent in Parents table',
    jumpToChild: 'View child in Children table',
    backToFamilies: 'Back to Families',
    dismiss: 'Dismiss',
    viewingParentFromFamily: 'Parent from family',
    viewingChildFromFamily: 'Child from family',
    dailyBrief: 'Daily Brief',
    kioskDashboard: 'Dashboard',
    whoIsCooking: 'Cook',
    mealTitle: 'Menu:',
    tasksAndInfoTitle: 'Tasks & Notices',
    cleanCoffeeMachine: 'Clean coffee machine',
    yellowBinPutOut: 'Put out yellow bin',
    yellowBinRetrieve: 'Bring in yellow bin',
    noCook: '–',
    noMeal: 'No meal plan recorded',
    noTasks: 'No pending tasks',
    today: 'Today',
    previousDay: 'Previous Day',
    nextDay: 'Next Day',
    backToPortal: 'Back to Management',
    anleitungen: 'Anleitungen',
    home: 'Home',
  },
};

export const t = (key: string): string => {
  return translations[CURRENT_LOCALE]?.[key] || key;
};

// Format a Date object or ISO date string (YYYY-MM-DD...) to display format:
// DD.MM.YYYY for German locale ('de') and YYYY-MM-DD for others.
// Handles both Date instances and string representations (e.g. from JSON API responses).
export const formatDisplayDate = (dateOrStr: Date | string | null | undefined): string => {
  if (!dateOrStr) return '';
  if (dateOrStr instanceof Date && isNaN(dateOrStr.getTime())) return '';

  const dateOnly = dateOrStr instanceof Date
    ? `${dateOrStr.getFullYear()}-${String(dateOrStr.getMonth() + 1).padStart(2, '0')}-${String(dateOrStr.getDate()).padStart(2, '0')}`
    : dateOrStr.split('T')[0];

  if (CURRENT_LOCALE === 'de') {
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`; // DD.MM.YYYY
    }
  }
  return dateOnly;
};

// Parse display format input (DD.MM.YYYY for 'de', YYYY-MM-DD for others) to YYYY-MM-DD
export const parseInputDate = (inputValue: string): string => {
  if (!inputValue) return '';
  if (CURRENT_LOCALE === 'de') {
    const parts = inputValue.split('.');
    if (parts.length === 3) {
      const day = parts[0].trim().padStart(2, '0');
      const month = parts[1].trim().padStart(2, '0');
      const year = parts[2].trim();
      if (year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  return inputValue.trim();
};

/**
 * Calculates the number of full years and months elapsed between a start date and a reference date (defaulting to today).
 *
 * Input handling:
 * - If `startDate` is a native `Date` object, it is used directly.
 * - If `startDate` is a string (e.g. ISO-8601 string from backend JSON responses such as "2026-10-07T00:00:00Z"
 *   or "2026-10-07"), it is automatically parsed into a Date object.
 * - If the date is invalid or in the future relative to `referenceDate`, returns 0 years and 0 months.
 */
export const calculateYearsAndMonths = (
  startDate: Date | string,
  referenceDate: Date = new Date()
): { years: number; months: number } => {
  if (!startDate) return { years: 0, months: 0 };
  let start: Date;
  if (startDate instanceof Date) {
    start = startDate;
  } else {
    // When parsing strings like "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ", extract year/month/day
    // to avoid unwanted timezone day-shifts across local and UTC environments.
    const parts = startDate.split('T')[0].split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      start = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      start = new Date(startDate);
    }
  }

  if (isNaN(start.getTime())) {
    return { years: 0, months: 0 };
  }

  let years = referenceDate.getFullYear() - start.getFullYear();
  let months = referenceDate.getMonth() - start.getMonth();
  if (referenceDate.getDate() < start.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) {
    years = 0;
    months = 0;
  }
  return { years, months };
};

/**
 * Formats a date string (YYYY-MM-DD) into a translated long display format:
 * e.g., "Freitag, 9. Oktober 2026" (de) or "Friday, October 9, 2026" (en).
 */
export const formatDashboardDate = (
  dateOrStr: Date | string | null | undefined,
  locale: Locale = CURRENT_LOCALE
): string => {
  if (!dateOrStr) return '';
  let d: Date;
  if (dateOrStr instanceof Date) {
    d = dateOrStr;
  } else {
    const parts = dateOrStr.split('T')[0].split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(dateOrStr);
    }
  }
  if (isNaN(d.getTime())) return String(dateOrStr);

  const lang = locale === 'de' ? 'de-DE' : 'en-US';
  return new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
};


