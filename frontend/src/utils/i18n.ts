export type Locale = 'de' | 'en';

export const CURRENT_LOCALE: Locale = 'de'; // Switch default locale in code here

const translations: Record<Locale, Record<string, string>> = {
  de: {
    title: 'Kindergarten-Verzeichnis',
    logout: 'Abmelden',
    parents: 'Eltern(MGA)',
    children: 'Kinder(MGA)',
    families: 'Familien(MGA)',
    familiesOverview: 'Familien',
    monthlyFeesSelf: 'Monatliche Betreuungsgebühren',
    searchParents: 'Eltern suchen...',
    searchChildren: 'Kinder suchen...',
    addFamily: 'Familie hinzufügen',
    addParent: 'Elternteil hinzufügen',
    addChild: 'Kind hinzufügen',
    addChildShort: 'Kind',
    addParentShort: 'Elternteil',
    firstName: 'Vorname',
    lastName: 'Nachname',
    birthDate: 'Geburtsdatum',
    firstNameEdit: 'Vorname',
    lastNameEdit: 'Nachname',
    emailsEdit: 'E-Mails',
    phonesEdit: 'Tel.',
    address: 'Adresse',
    addressEdit: 'Adresse',
    addAddress: 'Adresse hinzufügen',
    editAddress: 'Adresse bearbeiten',
    sharedAddress: 'gemeinsame Adresse',
    individualAddresses: 'individuelle Adressen',
    addressListIncluded: 'In Adressliste aufnehmen',
    addressListExcluded: 'Nicht in Adressliste aufnehmen',
    addressListFlag: 'In Adressliste',
    identifierEmailFlag: 'Identifikator-E-Mail',
    identifierEmailActive: 'Als Identifikator-E-Mail festgelegt',
    identifierEmailInactive: 'Nicht als Identifikator-E-Mail festgelegt',
    identifierEmailPermissionRequired: 'Berechtigung families.all.write erforderlich, um diese Identifikator-E-Mail zu bearbeiten oder zu löschen',
    changes: 'Änderungen',
    addedEmail: 'E-Mail hinzugefügt',
    removedEmail: 'E-Mail entfernt',
    changedEmail: 'E-Mail geändert',
    addedPhone: 'Telefonnummer hinzugefügt',
    removedPhone: 'Telefonnummer entfernt',
    changedPhone: 'Telefonnummer geändert',
    inAddressListAdded: 'In Adressliste aufgenommen (📋)',
    inAddressListRemoved: 'Aus Adressliste entfernt (ohne 📋)',
    identifierEmailSet: 'Als Identifikator-E-Mail festgelegt (🆔)',
    identifierEmailUnset: 'Identifikator-E-Mail entfernt (ohne 🆔)',
    withoutAddressList: 'ohne 📋',
    birthDateEdit: 'Geburtsdatum',
    birthDateCardLabel: 'Geb.',
    startDate: 'Betreuungsbeginn',
    startdatum: 'Startdatum',
    startDateCardLabel: 'Start',
    exitDate: 'Betreuungsende',
    startGroup: 'Startgruppe',
    hortStartDate: 'Hort-Beginn',
    group2StartDate: 'Gr. Gruppe Beginn',
    group1: 'Kleine Gruppe',
    group2: 'Grosse Gruppe',
    group3: 'Hort',
    overviewGroup1: 'Kleine Gruppe',
    overviewGroup2: 'Große Gruppe',
    overviewGroup3: 'Hort',
    overviewGroupNone: 'Noch keine Gruppe',
    overviewGroupFormer: 'Ehemalige',
    groupingLabel: 'Gruppierung',
    groupByFamily: 'Nach Familie',
    groupByGroup: 'Nach Gruppe',
    group: 'Gruppe',
    groupChange: 'Gruppenwechsel',
    manageGroupChanges: 'Gruppenwechsel verwalten',
    viewGroupChanges: 'Gruppenwechsel anzeigen',
    addGroupChange: 'Gruppenwechsel hinzufügen',
    targetGroup: 'Zielgruppe',
    groupChangeDeleteConfirm: 'Möchten Sie diesen Gruppenwechsel wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.',
    noGroupChangesRecorded: 'Keine Gruppenwechsel für dieses Kind erfasst',
    exit: 'Austritt',
    exited: 'Ausgetreten',
    futureEnrollmentPrefix: 'ab',
    addEmail: 'E-Mail hinzufügen',
    tollhausEmail: 'Tollhaus E-Mail',
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
    deleteFamilyConfirm: 'Sind Sie sicher, dass Sie diese Familie löschen möchten? Dadurch werden auch alle zugeordneten Eltern und Kinder gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.',
    deleteParentConfirm: 'Sind Sie sicher, dass Sie diesen Elternteil löschen möchten? Dieser Vorgang kann nicht rückgängig gemacht werden.',
    deleteChildConfirm: 'Sind Sie sicher, dass Sie dieses Kind löschen möchten? Dieser Vorgang kann nicht rückgängig gemacht werden.',
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
    noFeeChanges: 'Keine Gebührenänderungen in diesem Zeitraum',
    selectAtLeastOneFamily: 'Bitte wählen Sie mindestens eine Familie aus.',
    startMonthAfterEndMonth: 'Startmonat darf nicht nach Endmonat liegen.',
    changeHeader: 'Änderung',
    noDetails: 'Keine Details vorhanden',
    hygieneBelehrung: 'Hygieneschulung',
    initialTraining: 'Initialschulung',
    lastInstruction: 'Letzte Auffrischung',
    manageEvents: 'Schulungen verwalten',
    addEvent: 'Schulung hinzufügen',
    eventType: 'Typ',
    initialType: 'Initialschulung',
    recertifyType: 'Auffrischung',
    documentation: 'Dokumentation',
    noEventsRecorded: 'Keine Schulungen für diese Person erfasst',
    date: 'Datum',
    manageHygieneTitle: 'Schulungsnachweis für',
    invalidDate: 'Bitte geben Sie ein gültiges Datum ein',
    eventDeleteConfirm: 'Möchten Sie diese Schulung wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.',
    th_membership: 'Mitglied',
    full_member: 'Voll',
    supporting_member: 'Förder',
    expired: 'beendet',
    manageMemberships: 'Mitgliedschaften verwalten',
    addMembership: 'Mitgliedschaft hinzufügen',
    membershipType: 'Typ',
    membershipDeleteConfirm: 'Möchten Sie diese Mitgliedschaft wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.',
    noMembershipsRecorded: 'Keine Vereinsmitgliedschaft für diese Person erfasst',
    startDateLabel: 'Beginn',
    endDateLabel: 'Ende',
    close: 'Schließen',
    cannotAddMembershipOngoing: 'Die letzte Mitgliedschaft hat noch kein Enddatum',
    invalidDateRange: 'Enddatum darf nicht vor dem Beginn liegen',
    endDateMustBeAfterStartDate: 'Das Enddatum muss nach dem Beginn liegen',
    membershipsCannotOverlap: 'Mitgliedschaftszeiträume dürfen sich nicht überschneiden',
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
    vaccinationType: 'Impfung',
    checkedBy: 'Gecheckt durch',
    editedBy: 'Bearbeitet durch',
    manageVaccinationStatus: 'Impfstatus verwalten',
    addVaccinationCheck: 'Impfnachweis hinzufügen',
    noVaccinationChecksRecorded: 'Keine Impfnachweise für diese Person erfasst',
    vaccinationCheckDeleteConfirm: 'Möchten Sie diesen Impfnachweis wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.',
    noVaccinationStatus: 'Kein Impfnachweis',
    pleaseSelect: '(bitte wählen)',
    showVaccinationStatus: 'Impfstatus anzeigen',
    vaccinationStatusUnlocked: 'Impfstatus entschlüsselt',
    vaccinationStatusHidden: 'Geschützt (Klicken zum Entsperren)',
    kmsAccessDenied: 'Sie haben keinen Zugriff auf den KMS-Schlüssel.',
    jumpToParent: 'Elternteil in der Tabelle „Eltern“ anzeigen',
    jumpToChild: 'Kind in der Tabelle „Kinder“ anzeigen',
    jumpToFamilyInChildren: 'Familie in der Tabelle „Kinder“ anzeigen',
    jumpToFamilyInParents: 'Familie in der Tabelle „Eltern“ anzeigen',
    jumpToChildrenShort: '→Kinder',
    jumpToParentsShort: '→Eltern',
    backToFamilies: 'Zurück zu Familien',
    backToParents: 'Zurück zu Eltern',
    backToChildren: 'Zurück zu Kinder',
    dismiss: 'Schließen',
    viewingParentFromFamily: 'Elternteil von Familie',
    viewingChildFromFamily: 'Kind von Familie',
    viewingFamily: 'Familie',
    dailyBrief: 'Tagesübersicht',
    kioskDashboard: 'Dashboard',
    whoIsCooking: 'Koch / Köchin',
    mealTitle: 'Es gibt:',
    tasksAndInfoTitle: 'Hinweise & Aufgaben',
    cleanCoffeeMachine: 'Kaffeemaschine reinigen',
    cleanRefrigerator: 'Kühlschrank reinigen',
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
    kioskCertificates: 'Kiosk-Zertifikate',
    kioskProvisioningTitle: 'Kiosk-Zertifikat bereitstellen',
    kioskProvisioningDesc: 'Erstellen Sie ein mTLS-Client-Zertifikat (.p12), um ein Kiosk-Tablet für den Zugriff auf das Tages-Dashboard (Port 1443) zu autorisieren.',
    deviceNameLabel: 'Gerätename / Kennung',
    deviceNamePlaceholder: 'z.B. kiosk-reception oder kiosk-kueche',
    kioskPasswordLabel: 'Export-Passwort (optional)',
    kioskPasswordPlaceholder: 'Passwort zum Schutz der .p12-Datei',
    validityDaysLabel: 'Gültigkeitsdauer (Tage)',
    generateCertBtn: 'Zertifikat generieren & herunterladen (.p12)',
    generatingCert: 'Zertifikat wird generiert...',
    kioskCaReady: 'Kiosk-Zertifizierungsstelle (CA) ist aktiv und bereit.',
    kioskCaNotReady: 'Kiosk-Zertifizierungsstelle (CA) ist auf dem Server noch nicht initialisiert.',
    kioskCertSuccess: 'Zertifikat erfolgreich generiert und heruntergeladen!',
    kioskInstallInstructions: 'Installationsanleitung: Übertragen Sie die .p12-Datei auf das Tablet, installieren Sie sie im Gerätespeicher als Benutzer-Zertifikat und öffnen Sie https://portal.tollhaus.online:1443/.',
    sessionExpiredTitle: 'Sitzung abgelaufen',
    sessionExpiredMessage: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an, um fortzufahren.',
    reauthButton: 'Erneut anmelden',
    reauthWaiting: 'Anmeldung läuft im Popup-Fenster...',
    reauthSuccess: 'Erfolgreich erneut angemeldet!',
    reauthPopupBlocked: 'Das Popup-Fenster wurde vom Browser blockiert. Bitte erlauben Sie Popups für diese Website, oder verwenden Sie den folgenden Link:',
    reauthOpenInNewTab: 'In neuem Tab öffnen',
    reauthMockLogin: 'Als Entwickler erneut anmelden',
    reauthPopupClosed: 'Das Anmeldefenster wurde geschlossen, ohne die Anmeldung abzuschließen.',
  },
  en: {
    title: 'Kindergarten Directory',
    logout: 'Logout',
    parents: 'Parents(MGA)',
    children: 'Children(MGA)',
    families: 'Families(MGA)',
    familiesOverview: 'Families',
    monthlyFeesSelf: 'Monthly Childcare Fees',
    childcareFees: 'Childcare Fees',
    searchParents: 'Search parents...',
    searchChildren: 'Search children...',
    addFamily: 'Add Family',
    addParent: 'Add Parent',
    addChild: 'Add Child',
    addChildShort: 'Child',
    addParentShort: 'Parent',
    firstName: 'First Name',
    lastName: 'Last Name',
    birthDate: 'Birth Date',
    firstNameEdit: 'First Name',
    lastNameEdit: 'Last Name',
    emailsEdit: 'Emails',
    phonesEdit: 'Tel.',
    address: 'Address',
    addressEdit: 'Address',
    addAddress: 'Add address',
    editAddress: 'Edit address',
    sharedAddress: 'gemeinsame Adresse',
    individualAddresses: 'individuelle Adressen',
    addressListIncluded: 'Include in address list',
    addressListExcluded: 'Do not include in address list',
    addressListFlag: 'In address list',
    identifierEmailFlag: 'Identifier email',
    identifierEmailActive: 'Designated as identifier email',
    identifierEmailInactive: 'Not designated as identifier email',
    identifierEmailPermissionRequired: 'families.all.write permission required to edit or delete this identifier email',
    changes: 'Changes',
    addedEmail: 'Added email',
    removedEmail: 'Removed email',
    changedEmail: 'Changed email',
    addedPhone: 'Added phone',
    removedPhone: 'Removed phone',
    changedPhone: 'Changed phone',
    inAddressListAdded: 'Added to address list (📋)',
    inAddressListRemoved: 'Removed from address list (without 📋)',
    identifierEmailSet: 'Designated as identifier email (🆔)',
    identifierEmailUnset: 'Removed as identifier email (without 🆔)',
    withoutAddressList: 'without 📋',
    birthDateEdit: 'Birth Date',
    birthDateCardLabel: 'Geb.',
    startDate: 'Start Date',
    startdatum: 'Start Date',
    startDateCardLabel: 'Start',
    exitDate: 'Exit Date',
    startGroup: 'Start Group',
    hortStartDate: 'Hort Start Date',
    group2StartDate: 'Large Group Start Date',
    group1: 'group 1',
    group2: 'group 2',
    group3: 'hort',
    overviewGroup1: 'Kleine Gruppe',
    overviewGroup2: 'Große Gruppe',
    overviewGroup3: 'Hort',
    overviewGroupNone: 'Noch keine Gruppe',
    overviewGroupFormer: 'Ehemalige',
    groupingLabel: 'Grouping',
    groupByFamily: 'By Family',
    groupByGroup: 'By Group',
    group: 'Group',
    groupChange: 'Group Change',
    manageGroupChanges: 'Manage Group Changes',
    viewGroupChanges: 'View Group Changes',
    addGroupChange: 'Add Group Change',
    targetGroup: 'Target Group',
    groupChangeDeleteConfirm: 'Are you sure you want to delete this group change? This action cannot be undone.',
    noGroupChangesRecorded: 'No group changes recorded for this child',
    exit: 'Exit',
    exited: 'Exited',
    futureEnrollmentPrefix: 'from',
    addEmail: 'Add email',
    tollhausEmail: 'Tollhaus Email',
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
    deleteFamilyConfirm: 'Are you sure you want to delete this family? This will also delete all associated parents and children. This action cannot be undone.',
    deleteParentConfirm: 'Are you sure you want to delete this parent? This action cannot be undone.',
    deleteChildConfirm: 'Are you sure you want to delete this child? This action cannot be undone.',
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
    noFeeChanges: 'No fee changes in this period',
    selectAtLeastOneFamily: 'Please select at least one family.',
    startMonthAfterEndMonth: 'Start month cannot be after end month.',
    changeHeader: 'Change',
    noDetails: 'No details available',
    hygieneBelehrung: 'Hygiene Training',
    initialTraining: 'Initial Training',
    lastInstruction: 'Last Refresher',
    manageEvents: 'Manage Trainings',
    addEvent: 'Add Training',
    eventType: 'Type',
    initialType: 'Initial Training',
    recertifyType: 'Refresher',
    documentation: 'Documentation',
    noEventsRecorded: 'No trainings recorded for this person',
    date: 'Date',
    manageHygieneTitle: 'Training Record for',
    invalidDate: 'Please enter a valid date',
    eventDeleteConfirm: 'Are you sure you want to delete this training? This action cannot be undone.',
    th_membership: 'Member',
    full_member: 'full',
    supporting_member: 'supporting',
    expired: 'expired',
    manageMemberships: 'Manage Memberships',
    addMembership: 'Add Membership',
    membershipType: 'Type',
    membershipDeleteConfirm: 'Are you sure you want to delete this membership? This action cannot be undone.',
    noMembershipsRecorded: 'No membership records found for this parent',
    startDateLabel: 'Start Date',
    endDateLabel: 'End Date',
    close: 'Close',
    cannotAddMembershipOngoing: 'The most recent membership has no end date',
    invalidDateRange: 'End date cannot be earlier than start date',
    endDateMustBeAfterStartDate: 'End date must be greater than start date',
    membershipsCannotOverlap: 'Membership time spans may not overlap',
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
    vaccinationType: 'Vaccination',
    checkedBy: 'Checked by',
    editedBy: 'Edited by',
    manageVaccinationStatus: 'Manage vaccination status',
    addVaccinationCheck: 'Add vaccination record',
    noVaccinationChecksRecorded: 'No vaccination records for this person',
    vaccinationCheckDeleteConfirm: 'Are you sure you want to delete this vaccination record? This action cannot be undone.',
    noVaccinationStatus: 'No vaccination record',
    pleaseSelect: '(please select)',
    showVaccinationStatus: 'Show vaccination status',
    vaccinationStatusUnlocked: 'Vaccination status decrypted',
    vaccinationStatusHidden: 'Protected (Click to unlock)',
    kmsAccessDenied: 'User has no access to the KMS key.',
    jumpToParent: 'View parent in Parents table',
    jumpToChild: 'View child in Children table',
    jumpToFamilyInChildren: 'View family in Children table',
    jumpToFamilyInParents: 'View family in Parents table',
    jumpToChildrenShort: '→Children',
    jumpToParentsShort: '→Parents',
    backToFamilies: 'Back to Families',
    backToParents: 'Back to Parents',
    backToChildren: 'Back to Children',
    dismiss: 'Dismiss',
    viewingParentFromFamily: 'Parent from family',
    viewingChildFromFamily: 'Child from family',
    viewingFamily: 'Family',
    dailyBrief: 'Daily Brief',
    kioskDashboard: 'Dashboard',
    whoIsCooking: 'Cook',
    mealTitle: 'Menu:',
    tasksAndInfoTitle: 'Tasks & Notices',
    cleanCoffeeMachine: 'Clean coffee machine',
    cleanRefrigerator: 'Clean refrigerator',
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
    kioskCertificates: 'Kiosk Certificates',
    kioskProvisioningTitle: 'Provision Kiosk Certificate',
    kioskProvisioningDesc: 'Generate an mTLS client certificate (.p12) to authorize a kiosk tablet for access to the Daily Dashboard (port 1443).',
    deviceNameLabel: 'Device Name / Identifier',
    deviceNamePlaceholder: 'e.g. kiosk-reception or kiosk-kitchen',
    kioskPasswordLabel: 'Export Password (optional)',
    kioskPasswordPlaceholder: 'Password protecting the .p12 bundle',
    validityDaysLabel: 'Validity Period (days)',
    generateCertBtn: 'Generate & Download Certificate (.p12)',
    generatingCert: 'Generating certificate...',
    kioskCaReady: 'Kiosk Certificate Authority (CA) is active and ready.',
    kioskCaNotReady: 'Kiosk Certificate Authority (CA) is not initialized on the server.',
    kioskCertSuccess: 'Certificate successfully generated and downloaded!',
    kioskInstallInstructions: 'Installation guide: Transfer the .p12 bundle to the device, install it in user credential storage, and open https://portal.tollhaus.online:1443/.',
    sessionExpiredTitle: 'Session Expired',
    sessionExpiredMessage: 'Your session has expired. Please re-authenticate to continue.',
    reauthButton: 'Re-authenticate',
    reauthWaiting: 'Logging in via popup window...',
    reauthSuccess: 'Successfully re-authenticated!',
    reauthPopupBlocked: 'The popup window was blocked by your browser. Please allow popups for this site, or use the link below:',
    reauthOpenInNewTab: 'Open in new tab',
    reauthMockLogin: 'Re-authenticate as Developer',
    reauthPopupClosed: 'The login window was closed without completing authentication.',
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

/**
 * Formats given name and surname into a Tollhaus email address:
 * <given name>.<surname>@tollhaus-stuttgart.de
 * Converts to lowercase and replaces German umlauts (ä->ae, ö->oe, ü->ue, ß->ss).
 */
export const formatTollhausEmail = (firstName: string, lastName: string): string => {
  const replaceUmlauts = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/ẞ/g, 'ss')
      .trim();
  };
  const fn = replaceUmlauts(firstName);
  const ln = replaceUmlauts(lastName);
  if (!fn && !ln) return '';
  return `${fn}.${ln}@tollhaus-stuttgart.de`;
};
