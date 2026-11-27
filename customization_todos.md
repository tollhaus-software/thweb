# Customization & Multi-Facility Readiness TODOs (`thweb`)

This document catalogs the facility-specific assumptions, rules, terminology, and texts currently hardcoded in `thweb` (backend and frontend) that would need to be made configurable if `thweb` were used for another childcare facility (*Kita / Elterninitiative*).

---

## 1. Regional & Statutory Rules (State / Municipality)

### 1.1 Statutory Public Holidays (*Gesetzliche Feiertage*)
- **Current behavior:** Hardcoded to the 12 statutory public holidays of **Baden-Württemberg** (§ 1 FTG BW), including *Heilige Drei Könige*, *Fronleichnam*, and *Allerheiligen*.
- **Locations:**
  - `backend/internal/store/store_events.go` (`GetBadenWuerttembergHolidays`, `enrichWithBadenWuerttembergHolidays`)
  - `frontend/src/utils/calendarEvents.ts` (LLM PDF calendar import prompt mentions skipping BW statutory holidays and extracting Stuttgart school holidays)
- **To make configurable:** Parameterize holiday calculation by German federal state (`Bundesland` ISO code, e.g. `DE-BW`, `DE-BY`, `DE-BE`, etc.) configured via `system_settings` or environment variable.

### 1.2 Regular School Enrollment Cutoff Calculation (*Einschulung regulär*)
- **Current behavior:** Uses the **Baden-Württemberg school enrollment cutoff date transitions** (Stichtag shifted from Sept 30 `<= 2019` to Aug 31 `2020`, July 31 `2021`, and June 30 `>= 2022`).
- **Locations:**
  - `backend/internal/models/models.go` (`CalculateDefaultSchoolEnrollment`)
  - `frontend/src/utils/family.ts` (`calculateRegularSchoolEnrollment`)
- **To make configurable:** Configure the state's cutoff month/day schedule for school enrollment calculation.

---

## 2. Childcare Groups (*Gruppenstruktur*)

### 2.1 Hardcoded Group IDs (`1`, `2`, `3`) and Names (*Kleine Gruppe*, *Große Gruppe*, *Hort*)
- **Current behavior:** The application assumes 3 fixed groups (`1 = Kleine Gruppe`, `2 = Große Gruppe`, `3 = Hort`, plus `0 = Austritt/Exit`), with special UI columns for transitions into Group 2 (*Gr. Gruppe Beginn*) and Group 3 (*Hort-Beginn*).
- **Locations:**
  - **Database schema:** `backend/schema.sql` (`children_group_changes.target_group`)
  - **Backend group logic & filtering:**
    - `backend/internal/fees/fees.go` (`GroupName(group int)`)
    - `backend/internal/store/store_events.go` (`requiredGroupForEventType` maps `ea_kleine_gruppe -> 1`, `ea_grosse_gruppe -> 2`, `ea_hort -> 3`)
    - `backend/internal/store/dashboard_tasks.go` (default serving tasks: `serve_small_group`, `serve_large_group`, `serve_hort` with fixed times `11:45`, `12:00`, `13:00`)
  - **Frontend group labels, columns & filters:**
    - `frontend/src/utils/childGroup.ts` (`getGroupShortLabel`: `Kleine Gr.`, `Grosse Gr.`, `Hort`)
    - `frontend/src/utils/i18n.ts` (`group1`, `group2`, `group3`, `overviewGroup1..3`, `hortStartDate`, `group2StartDate`)
    - `frontend/src/components/Families/FamiliesOverviewTab.tsx` & `frontend/src/App.tsx` (group filter tabs, group badges, and columns for transition to Große Gruppe and Hort)
- **To make configurable:** Define groups in a `childcare_groups` table (with ID, name, short name, sort order, and transition column settings) instead of hardcoded integer switches.

---

## 3. Childcare Fee Calculation & Municipal Subsidies (*Betreuungsgebühren & Familiencard*)

### 3.1 Fee Tables & *Stuttgarter Familiencard*
- **Current behavior:**
  - Fee tables (`Gr1Regular`, `Gr1Familiencard`, `Gr2Regular`, `Gr2Familiencard`, `Gr3Regular`, `Gr3Familiencard`) are hardcoded in Go source code.
  - Pricing tiers depend on the number of children under 18 in the household (1 to 4+ children), whether the child has a **Stuttgarter Familiencard** (`children.familiencards` JSONB array of years), and whether enrollment starts on or after the 16th of the month (`IsHalf = true`, 50% fee).
- **Locations:**
  - `backend/internal/fees/fees.go`
  - `backend/schema.sql` (`children.familiencards`)
  - `frontend/src/components/Fees/ChildcareFeesTab.tsx` & `frontend/src/utils/i18n.ts`
- **To make configurable:** Store fee schedules (per group, effective date range, sibling discount tiers, municipal discount/card eligibility, and half-month cutoff day) in the database or a configuration file, and allow renaming or disabling the `Familiencard` field.

---

## 4. Daily Operations, Meals & Dashboard Rules

### 4.1 Vesper Days (*Vesper-Tage*)
- **Current behavior:** Wednesday and Thursday are hardcoded as Vesper days (`isVesperDay := targetDate.Weekday() == time.Wednesday || targetDate.Weekday() == time.Thursday`).
- **Locations:**
  - `backend/internal/store/store.go` (`GetDailyBrief`)
  - `frontend/src/utils/mealPlan.ts` (`isVesperDay`)
- **To make configurable:** Store Vesper weekdays (or whether Vesper days exist at all) in `system_settings`.

### 4.2 Default Dashboard TODOs & Serving Times
- **Current behavior:** `DefaultDashboardTodos()` seeds 12 Tollhaus-specific tasks (e.g., `Kleine Gruppe servieren (auf 11:45)`, `Große Gruppe servieren (auf 12:00)`, `Hort servieren (meist auf 13:00)`, BuFDI laundry/diaper tasks, Gelbe Tonne, refrigerator & dishwasher filter cleaning).
- **Locations:**
  - `backend/internal/store/dashboard_tasks.go` (`DefaultDashboardTodos`, `GetTaskAliases`)
- **Note:** While dashboard TODOs are editable via the admin UI (`dashboard_todos` table), the hardcoded task alias mappings (`GetTaskAliases`) and initial seed data in `dashboard_tasks.go` are Tollhaus-specific.

### 4.3 Calendar Event Types (*Termintypen*)
- **Current behavior:** `calendar_events` has a SQL `CHECK` constraint and backend/frontend maps with Tollhaus-specific event types (`ea_kleine_gruppe`, `ea_grosse_gruppe`, `ea_hort`, `ea_gesamt`, `ea_gesamt_and_mgv`, `putz_we`, `bau_we`, `garten_we`, `laternenfest`, `weihnachtsfeier`, `sommerfest`, etc.) and a Tollhaus-tailored LLM PDF extraction prompt.
- **Locations:**
  - `backend/schema.sql` & `backend/internal/models/models.go` (`ValidCalendarEventTypes`)
  - `frontend/src/utils/calendarEvents.ts` (`EVENT_TYPE_LIST`, `buildCalendarLlmPromptSpec`)

### 4.4 Employee & Volunteer Types (`bufdi`)
- **Current behavior:** Employee types are constrained to `('caregiver', 'cook', 'bufdi')` and volunteer absences are keyed around `bufdi` (*Bundesfreiwilligendienst*), although the display name (`bufdi_name`) is already configurable in `system_settings`.
- **Locations:**
  - `backend/schema.sql` (`employees.employee_type`, `volunteer_absences.type`)
  - `frontend/src/components/VolunteerAbsences/VolunteerAbsencesTab.tsx`

---

## 5. Branding, Terminology & Static Links in `thweb`

### 5.1 Facility Name, App Titles & PWA Manifest
- **Current behavior:** References to `"Tollhaus"`, `"Tollhaus App"`, and `"TH Portal"` appear across UI strings, PWA manifest, and HTML metadata.
- **Locations:**
  - `frontend/index.html` (`<title>TH Portal</title>`, `apple-mobile-web-app-title="Tollhaus"`)
  - `frontend/vite.config.ts` (`name: 'Tollhaus App'`, `short_name: 'Tollhaus App'`, `description: 'Tollhaus Portal'`)
  - `frontend/src/components/MainPage/PwaInstallCard.tsx` (`"Tollhaus als App nutzen"`, `"Installiere Tollhaus auf deinem Startbildschirm..."`)
  - `frontend/src/utils/i18n.ts` (`title: 'TH Portal'`, `overviewJobNone: 'Aktuell kein Tollhaus Job'`, `tollhausEmail: 'Tollhaus E-Mail'`)
  - `frontend/src/utils/calendarEvents.ts` (`schliesszeit: 'Schließzeit Tollhaus'`)
  - `frontend/src/components/Families/FamiliesTab.tsx` (`emptyText="(nicht im Tollhaus)"`)
  - `backend/schema.sql` (`th_memberships` table name)

### 5.2 Organizational Terminology (*MGA*, *PA*)
- **Current behavior:** Navigation and role names use Tollhaus-specific committee abbreviations:
  - **MGA** (*Mitglieder- und Gruppenangelegenheiten*)
  - **PA** (*Personalausschuss*)
- **Locations:**
  - `frontend/src/utils/i18n.ts` (`navMga`, `navPa`, `catDescMga`, `catDescPa`, `parents: 'Eltern(MGA)'`, `children: 'Kinder(MGA)'`, `families: 'Familien(MGA)'`)
  - `local_dev_roles.yaml`

### 5.3 Logos & Footer Links
- **Current behavior:**
  - Logos & icons in `frontend/public/` feature the Tollhaus branding.
  - `OAUTH2_PROXY_FOOTER` in `docker-compose.common.yml` and `scripts/run-e2e-isolated.sh` links to `https://www.tollhaus-stuttgart.de/impressum`.
