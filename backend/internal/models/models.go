package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// User represents the database table entity for users.
type User struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	Permissions []string   `json:"permissions"` // direct custom permission overrides
	LastLogin   *time.Time `json:"last_login,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// UserWithPermissions represents a user with computed roles and effective permissions.
type UserWithPermissions struct {
	ID                   uuid.UUID             `json:"id"`
	Email                string                `json:"email"`
	Roles                []string              `json:"roles"`
	Permissions          []string              `json:"permissions"`
	EffectivePermissions []string              `json:"effective_permissions"`
	FamilyID             *uuid.UUID            `json:"family_id,omitempty"`
	LastLogin            *time.Time            `json:"last_login,omitempty"`
	CreatedAt            time.Time             `json:"created_at"`
	UpdatedAt            time.Time             `json:"updated_at"`
	Simulation           *SimulationInfo       `json:"simulation,omitempty"`
	ActualUser           *UserWithPermissions  `json:"-"`
}

func (s *UserWithPermissions) HasPermission(perm string) bool {
	for _, p := range s.EffectivePermissions {
		if p == "*" || p == perm {
			return true
		}
		if perm == "families.all.restrictedread" && (p == "families.all.read" || p == "*") {
			return true
		}
		if perm == "fees.self.read" && (p == "fees.all.read" || p == "*") {
			return true
		}
		if perm == "memberships.self.read" && (p == "memberships.all.read" || p == "memberships.all.write" || p == "*") {
			return true
		}
		if perm == "memberships.all.read" && (p == "memberships.all.write" || p == "*") {
			return true
		}
		if perm == "employees.all.read" && (p == "employees.all.write" || p == "*") {
			return true
		}
		if perm == "allergies.children.read" && (p == "allergies.children.write" || p == "*") {
			return true
		}
		if perm == "allergies.employees.read" && (p == "allergies.employees.write" || p == "*") {
			return true
		}
		if perm == "meal_allergens.read" && (p == "meal_allergens.write" || p == "*") {
			return true
		}
	}
	return false
}

func (s *UserWithPermissions) IsSelfFamily(familyID uuid.UUID) bool {
	return s.FamilyID != nil && *s.FamilyID == familyID
}

func (s *UserWithPermissions) EnsureImpliedPermissions() {
	hasFamiliesAll := false
	hasFeesAll := false
	hasMembershipsWrite := false
	hasMembershipsAll := false
	hasEmployeesWrite := false
	hasAllergiesChildrenWrite := false
	hasAllergiesEmployeesWrite := false
	hasMealAllergensWrite := false
	permSet := make(map[string]bool)
	for _, p := range s.EffectivePermissions {
		permSet[p] = true
		if p == "*" || p == "families.all.read" {
			hasFamiliesAll = true
		}
		if p == "*" || p == "fees.all.read" {
			hasFeesAll = true
		}
		if p == "*" || p == "memberships.all.write" {
			hasMembershipsWrite = true
		}
		if p == "*" || p == "memberships.all.read" {
			hasMembershipsAll = true
		}
		if p == "*" || p == "employees.all.write" {
			hasEmployeesWrite = true
		}
		if p == "*" || p == "allergies.children.write" {
			hasAllergiesChildrenWrite = true
		}
		if p == "*" || p == "allergies.employees.write" {
			hasAllergiesEmployeesWrite = true
		}
		if p == "*" || p == "meal_allergens.write" {
			hasMealAllergensWrite = true
		}
	}
	if hasFamiliesAll {
		permSet["families.all.restrictedread"] = true
	}
	if hasFeesAll {
		permSet["fees.self.read"] = true
	}
	if hasMembershipsWrite {
		permSet["memberships.all.read"] = true
		hasMembershipsAll = true
	}
	if hasMembershipsAll {
		permSet["memberships.self.read"] = true
	}
	if hasEmployeesWrite {
		permSet["employees.all.read"] = true
	}
	if hasAllergiesChildrenWrite {
		permSet["allergies.children.read"] = true
	}
	if hasAllergiesEmployeesWrite {
		permSet["allergies.employees.read"] = true
	}
	if hasMealAllergensWrite {
		permSet["meal_allergens.read"] = true
	}
	s.EffectivePermissions = make([]string, 0, len(permSet))
	for p := range permSet {
		s.EffectivePermissions = append(s.EffectivePermissions, p)
	}
}

// RemovePermissions removes the specified permissions from EffectivePermissions.
func (s *UserWithPermissions) RemovePermissions(denied []string) {
	if len(denied) == 0 || len(s.EffectivePermissions) == 0 {
		return
	}
	denyMap := make(map[string]bool, len(denied))
	for _, d := range denied {
		denyMap[d] = true
	}
	filtered := make([]string, 0, len(s.EffectivePermissions))
	for _, p := range s.EffectivePermissions {
		if !denyMap[p] {
			filtered = append(filtered, p)
		}
	}
	s.EffectivePermissions = filtered
}

// NormalizeEmail trims surrounding whitespace and converts the email address to lowercase,
// preserving dots in the username/local-part to support Google Workspace accounts.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// SimulationInfo holds state and metadata about an active permissions simulation.
type SimulationInfo struct {
	Active                       bool     `json:"active"`
	Mode                         string   `json:"mode"` // "user" or "custom"
	SimulatedUser                string   `json:"simulated_user,omitempty"`
	SimulatedRoles               []string `json:"simulated_roles,omitempty"`
	SimulatedPermissions         []string `json:"simulated_permissions,omitempty"`
	OriginalEmail                string   `json:"original_email"`
	OriginalRoles                []string `json:"original_roles"`
	OriginalEffectivePermissions []string `json:"original_effective_permissions"`
}

// SimulationConfig represents the request/cookie payload configuring a simulation session.
type SimulationConfig struct {
	Active      bool     `json:"active"`
	Mode        string   `json:"mode"` // "user" or "custom"
	UserEmail   string   `json:"user_email,omitempty"`
	Roles       []string `json:"roles,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

// SimulationCandidate represents an option in the user simulation dropdown.
type SimulationCandidate struct {
	Email                string     `json:"email"`
	Source               string     `json:"source"` // "user", "identifier_email", or "both"
	Roles                []string   `json:"roles"`
	Permissions          []string   `json:"permissions"`
	EffectivePermissions []string   `json:"effective_permissions"`
	FamilyID             *uuid.UUID `json:"family_id,omitempty"`
}

// AllKnownPermissions lists all granular permissions defined in the application.
var AllKnownPermissions = []string{
	"*",
	"families.all.read",
	"families.all.restrictedread",
	"families.all.write",
	"families.self.selfservice",
	"children.all.read",
	"children.all.write",
	"fees.all.read",
	"fees.self.read",
	"hygiene.all.read",
	"hygiene.all.write",
	"memberships.all.write",
	"memberships.all.read",
	"memberships.self.read",
	"employees.all.write",
	"employees.all.read",
	"allergies.children.read",
	"allergies.children.write",
	"allergies.employees.read",
	"allergies.employees.write",
	"allergies.summary.read",
	"mealplan.view",
	"meal_allergens.read",
	"meal_allergens.write",
	"audit.view",
	"users.all.manage",
	"vaccination.status.manage",
	"provision.kiosk.cert",
	"dashboard.read",
	"permissions.simulate",
}

// IntersectPermissions returns the intersection of effective permissions between actual and simulated.
func IntersectPermissions(actual, simulated []string) []string {
	actualHasWildcard := false
	actualMap := make(map[string]bool, len(actual))
	for _, p := range actual {
		if p == "*" {
			actualHasWildcard = true
		}
		actualMap[p] = true
	}

	simulatedHasWildcard := false
	simulatedMap := make(map[string]bool, len(simulated))
	for _, p := range simulated {
		if p == "*" {
			simulatedHasWildcard = true
		}
		simulatedMap[p] = true
	}

	if actualHasWildcard && simulatedHasWildcard {
		return []string{"*"}
	}
	if actualHasWildcard {
		res := make([]string, 0, len(simulatedMap))
		for p := range simulatedMap {
			res = append(res, p)
		}
		sort.Strings(res)
		return res
	}
	if simulatedHasWildcard {
		res := make([]string, 0, len(actualMap))
		for p := range actualMap {
			res = append(res, p)
		}
		sort.Strings(res)
		return res
	}

	var res []string
	for p := range simulatedMap {
		if actualMap[p] {
			res = append(res, p)
		}
	}
	sort.Strings(res)
	return res
}

type Role struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Permissions []string  `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Family struct {
	ID         uuid.UUID `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	FamilyName string    `json:"family_name,omitempty"`
	Parents    []Parent  `json:"parents,omitempty"`
	Children   []Child   `json:"children,omitempty"`
}

// FormatFamilyName formats parents' surnames into a standardized family name:
// unique non-empty surnames are sorted alphabetically and joined with " / ".
// If no surnames exist, fallback is returned (defaulting to "Familie").
func FormatFamilyName(parents []Parent, fallback ...string) string {
	defaultFallback := "Familie"
	if len(fallback) > 0 && fallback[0] != "" {
		defaultFallback = fallback[0]
	}

	surnamesMap := make(map[string]struct{})
	for _, p := range parents {
		trimmed := strings.TrimSpace(p.LastName)
		if trimmed != "" {
			surnamesMap[trimmed] = struct{}{}
		}
	}
	if len(surnamesMap) == 0 {
		return defaultFallback
	}

	surnames := make([]string, 0, len(surnamesMap))
	for s := range surnamesMap {
		surnames = append(surnames, s)
	}

	sort.Slice(surnames, func(i, j int) bool {
		lowI, lowJ := strings.ToLower(surnames[i]), strings.ToLower(surnames[j])
		if lowI != lowJ {
			return lowI < lowJ
		}
		return surnames[i] < surnames[j]
	})

	return strings.Join(surnames, " / ")
}

func (f Family) GetFamilyName() string {
	if f.FamilyName != "" {
		return f.FamilyName
	}
	return FormatFamilyName(f.Parents)
}

func (f Family) DisplayName() string {
	return f.GetFamilyName()
}

type MultiValueEntry struct {
	Value           string `json:"value"`
	AddressList     bool   `json:"address_list"`
	IdentifierEmail bool   `json:"identifier_email"`
	Type            string `json:"type,omitempty"`
}

func (m *MultiValueEntry) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		m.Value = str
		m.AddressList = true
		m.IdentifierEmail = false
		m.Type = ""
		return nil
	}
	type Alias MultiValueEntry
	var alias struct {
		Alias
		AddressListCamel     *bool   `json:"addressList"`
		IdentifierEmailCamel *bool   `json:"identifierEmail"`
		TypeCamel            *string `json:"type"`
	}
	if err := json.Unmarshal(data, &alias); err != nil {
		return err
	}
	*m = MultiValueEntry(alias.Alias)
	if alias.AddressListCamel != nil {
		m.AddressList = *alias.AddressListCamel
	}
	if alias.IdentifierEmailCamel != nil {
		m.IdentifierEmail = *alias.IdentifierEmailCamel
	}
	if alias.TypeCamel != nil {
		m.Type = *alias.TypeCamel
	}
	return nil
}

type MultiValueList []MultiValueEntry

func (l MultiValueList) Value() (driver.Value, error) {
	if l == nil {
		return "[]", nil
	}
	b, err := json.Marshal(l)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (l *MultiValueList) Scan(src interface{}) error {
	if src == nil {
		*l = MultiValueList{}
		return nil
	}
	switch s := src.(type) {
	case []byte:
		if len(s) == 0 {
			*l = MultiValueList{}
			return nil
		}
		return json.Unmarshal(s, l)
	case string:
		if len(s) == 0 {
			*l = MultiValueList{}
			return nil
		}
		return json.Unmarshal([]byte(s), l)
	default:
		return fmt.Errorf("cannot scan %T into MultiValueList", src)
	}
}

type Parent struct {
	ID                         uuid.UUID               `json:"id"`
	FamilyID                   uuid.UUID               `json:"family_id"`
	FirstName                  string                  `json:"first_name"`
	FirstNameForAddressList    string                  `json:"first_name_for_address_list"`
	LastName                   string                  `json:"last_name"`
	Emails                     MultiValueList          `json:"emails"`
	Phones                     MultiValueList          `json:"phones"`
	Address                    string                  `json:"address"`
	Notes                      string                  `json:"notes"`
	VaccinationStatusProtected []byte                  `json:"vaccination_status_protected,omitempty"`
	VaccinationChecks          []VaccinationCheck      `json:"vaccination_checks,omitempty"`
	Events                     []HygieneBelehrungEvent `json:"events"`
	Memberships                []THMembership          `json:"memberships"`
	CreatedAt                  time.Time               `json:"created_at"`
	UpdatedAt                  time.Time               `json:"updated_at"`
}

type HygieneBelehrungEvent struct {
	ID            uuid.UUID `json:"id"`
	ParentID      uuid.UUID `json:"parent_id"`
	EventDate     time.Time `json:"event_date"`
	EventType     string    `json:"event_type"` // "initial", "recertify"
	Documentation string    `json:"documentation"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type VaccinationCheck struct {
	VaccinationType   string `json:"vaccination_type"`
	VaccinationStatus string `json:"vaccination_status,omitempty"`
	CheckedBy         string `json:"checked_by"`
	CheckedOn         string `json:"checked_on"`
	ProofSeen         string `json:"proof_seen"`
	EntryCreatedBy    string `json:"entry_created_by,omitempty"`
}

type VaccinationStatusProtected struct {
	VaccinationChecks []VaccinationCheck `json:"vaccination_checks"`
}

// AllergyItem represents an extensible allergy entry inside AllergiesProtectedPayload.
// It unmarshals from either a JSON object `{"name": "..."}` or a plain JSON string `"..."`.
type AllergyItem struct {
	Name string `json:"name"`
}

func (a *AllergyItem) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		a.Name = strings.TrimSpace(str)
		return nil
	}
	var obj struct {
		Name  string `json:"name"`
		Value string `json:"value"`
		Type  string `json:"type"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return err
	}
	if obj.Name != "" {
		a.Name = strings.TrimSpace(obj.Name)
	} else if obj.Value != "" {
		a.Name = strings.TrimSpace(obj.Value)
	} else {
		a.Name = strings.TrimSpace(obj.Type)
	}
	return nil
}

// AllergiesProtectedPayload is the extensible JSON envelope encrypted inside allergies_protected.
type AllergiesProtectedPayload struct {
	Allergies []AllergyItem `json:"allergies"`
}

// SanitizeAllergiesList trims entries and filters out empty strings.
func SanitizeAllergiesList(items []string) []string {
	out := make([]string, 0, len(items))
	for _, s := range items {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// EncodeAllergiesPayload serializes a slice of allergy strings into the extensible JSON payload.
func EncodeAllergiesPayload(allergies []string) ([]byte, error) {
	cleaned := SanitizeAllergiesList(allergies)
	items := make([]AllergyItem, 0, len(cleaned))
	for _, name := range cleaned {
		items = append(items, AllergyItem{Name: name})
	}
	payload := AllergiesProtectedPayload{
		Allergies: items,
	}
	return json.Marshal(payload)
}

// DecodeAllergiesPayload deserializes an AllergiesProtectedPayload (or plain JSON string array) into a slice of strings.
func DecodeAllergiesPayload(rawJSON []byte) ([]string, error) {
	if len(rawJSON) == 0 {
		return []string{}, nil
	}
	var payload AllergiesProtectedPayload
	if err := json.Unmarshal(rawJSON, &payload); err == nil && payload.Allergies != nil {
		out := make([]string, 0, len(payload.Allergies))
		for _, item := range payload.Allergies {
			trimmed := strings.TrimSpace(item.Name)
			if trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out, nil
	}
	var plainSlice []AllergyItem
	if err := json.Unmarshal(rawJSON, &plainSlice); err == nil {
		out := make([]string, 0, len(plainSlice))
		for _, item := range plainSlice {
			trimmed := strings.TrimSpace(item.Name)
			if trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out, nil
	}
	return nil, fmt.Errorf("invalid allergies payload JSON")
}

// StringSlicesEqual returns true if two string slices have identical elements in order.
func StringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

type ChildGroupChange struct {
	ID          uuid.UUID `json:"id"`
	Child       uuid.UUID `json:"child"`
	ChangeDate  time.Time `json:"change_date"`
	TargetGroup int       `json:"target_group"` // 0: exit, 1: Kleine Gruppe, 2: Grosse Gruppe, 3: Hort
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type FamiliencardList []int

func (l FamiliencardList) Value() (driver.Value, error) {
	if l == nil {
		return "[]", nil
	}
	b, err := json.Marshal(l)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (l *FamiliencardList) Scan(src interface{}) error {
	if src == nil {
		*l = FamiliencardList{}
		return nil
	}
	var raw []byte
	switch s := src.(type) {
	case []byte:
		raw = s
	case string:
		raw = []byte(s)
	default:
		return fmt.Errorf("cannot scan %T into FamiliencardList", src)
	}

	if len(raw) == 0 {
		*l = FamiliencardList{}
		return nil
	}

	return json.Unmarshal(raw, l)
}

type Child struct {
	ID                         uuid.UUID          `json:"id"`
	FamilyID                   uuid.UUID          `json:"family_id"`
	FirstName                  string             `json:"first_name"`
	FirstNameForAddressList    string             `json:"first_name_for_address_list"`
	LastName                   string             `json:"last_name"`
	BirthDate                  time.Time          `json:"birth_date"`
	SchoolEnrollmentDefault    *int               `json:"school_enrollment_default,omitempty"`
	Notes                      string             `json:"notes"`
	VaccinationStatusProtected []byte             `json:"vaccination_status_protected,omitempty"`
	VaccinationChecks          []VaccinationCheck `json:"vaccination_checks,omitempty"`
	AllergiesProtected         []byte             `json:"allergies_protected,omitempty"`
	Allergies                  []string           `json:"allergies,omitempty"`
	AllergiesUpdated           bool               `json:"allergies_updated,omitempty"`
	ClearAllergies             bool               `json:"-"`
	GroupChanges               []ChildGroupChange `json:"group_changes"`
	Familiencards              FamiliencardList   `json:"familiencards"`
	CreatedAt                  time.Time          `json:"created_at"`
	UpdatedAt                  time.Time          `json:"updated_at"`
}

type AuditLog struct {
	ID             uuid.UUID       `json:"id"`
	TransactionID  uuid.UUID       `json:"transaction_id"`
	FamilyID       *uuid.UUID      `json:"family_id"`
	EntityType     string          `json:"entity_type"`
	EntityID       uuid.UUID       `json:"entity_id"`
	Operation      string          `json:"operation"`
	BeforeSnapshot json.RawMessage `json:"before_snapshot,omitempty"`
	AfterSnapshot  json.RawMessage `json:"after_snapshot,omitempty"`
	ChangedBy      *uuid.UUID      `json:"changed_by"`
	ChangedByEmail string          `json:"changed_by_email"`
	CreatedAt      time.Time       `json:"created_at"`
}

type AuditLogFilter struct {
	Search   string     `json:"search,omitempty"`
	Before   *time.Time `json:"before,omitempty"`
	BeforeID *uuid.UUID `json:"before_id,omitempty"`
	Limit    int        `json:"limit,omitempty"`
}

type THMembership struct {
	ID             uuid.UUID  `json:"id"`
	ParentID       uuid.UUID  `json:"parent_id"`
	StartDate      time.Time  `json:"start_date"`
	EndDate        *time.Time `json:"end_date"`
	MembershipType string     `json:"membership_type"` // "full_member", "supporting_member"
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type DailyBriefResponse struct {
	Date           string   `json:"date"`
	WhoIsCooking   string   `json:"who_is_cooking"`
	MealComponents []string `json:"meal_components"`
	TasksAndInfo   []string `json:"tasks_and_info"`
}

// MemberRow represents an active member displayed in the "Members" (Vereinsmitglieder) tab.
type MemberRow struct {
	ID                    uuid.UUID      `json:"id"`
	FamilyID              uuid.UUID      `json:"family_id"`
	FamilyName            string         `json:"family_name,omitempty"`
	FirstName             string         `json:"first_name"`
	LastName              string         `json:"last_name"`
	MembershipType        string         `json:"membership_type"`
	FirstBecameMemberDate time.Time      `json:"first_became_member_date"`
	LastTypeChangeDate    *time.Time     `json:"last_type_change_date,omitempty"`
	Memberships           []THMembership `json:"memberships"`
}

type Employee struct {
	ID                         uuid.UUID      `json:"id"`
	FirstName                  string         `json:"first_name"`
	LastName                   string         `json:"last_name"`
	EmployeeType               string         `json:"employee_type"` // "caregiver", "cook", "bufdi"
	Emails                     MultiValueList `json:"emails"`
	Phones                     MultiValueList `json:"phones"`
	Address                    string         `json:"address"`
	IsKinderschutzbeauftragter bool           `json:"is_kinderschutzbeauftragter"`
	AllergiesProtected         []byte         `json:"allergies_protected,omitempty"`
	Allergies                  []string       `json:"allergies,omitempty"`
	AllergiesUpdated           bool           `json:"allergies_updated,omitempty"`
	ClearAllergies             bool           `json:"-"`
	CreatedAt                  time.Time      `json:"created_at"`
	UpdatedAt                  time.Time      `json:"updated_at"`
}

func (e *Employee) UnmarshalJSON(data []byte) error {
	type Alias Employee
	var aux struct {
		Alias
		GivenName                  *string        `json:"given_name"`
		Surname                    *string        `json:"surname"`
		Type                       *string        `json:"type"`
		IsKinderschutzbeauftragter *bool          `json:"is_kinderschutzbeauftragter"`
		IsChildProtectionOfficer   *bool          `json:"is_child_protection_officer"`
		AllergiesRaw               *[]AllergyItem `json:"allergies"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	*e = Employee(aux.Alias)
	if aux.GivenName != nil && e.FirstName == "" {
		e.FirstName = *aux.GivenName
	}
	if aux.Surname != nil && e.LastName == "" {
		e.LastName = *aux.Surname
	}
	if aux.Type != nil && e.EmployeeType == "" {
		e.EmployeeType = *aux.Type
	}
	if aux.IsKinderschutzbeauftragter != nil {
		e.IsKinderschutzbeauftragter = *aux.IsKinderschutzbeauftragter
	} else if aux.IsChildProtectionOfficer != nil {
		e.IsKinderschutzbeauftragter = *aux.IsChildProtectionOfficer
	}
	if aux.AllergiesRaw != nil {
		allergies := make([]string, 0, len(*aux.AllergiesRaw))
		for _, item := range *aux.AllergiesRaw {
			if item.Name != "" {
				allergies = append(allergies, item.Name)
			}
		}
		e.Allergies = allergies
	}
	return nil
}

func (e Employee) MarshalJSON() ([]byte, error) {
	type Alias Employee
	return json.Marshal(&struct {
		Alias
		Type                     string `json:"type"`
		IsChildProtectionOfficer bool   `json:"is_child_protection_officer"`
	}{
		Alias:                    Alias(e),
		Type:                     e.EmployeeType,
		IsChildProtectionOfficer: e.IsKinderschutzbeauftragter,
	})
}

// CalculateDefaultSchoolEnrollment computes the default/regular school enrollment year (Einschulung regulär):
// Take the child's birthday and add 6 years. This gives us the variable sixthBirthday.
// - If the calendar year of sixthBirthday is 2019 or earlier:
//     If the calendar month of sixthBirthday is September or earlier: calendarYearOf(sixthBirthday)
//     Otherwise: calendarYearOf(sixthBirthday) + 1
// - If the calendar year of sixthBirthday is 2020:
//     If the calendar month of sixthBirthday is August or earlier: calendarYearOf(sixthBirthday)
//     Otherwise: calendarYearOf(sixthBirthday) + 1
// - If the calendar year of sixthBirthday is 2021:
//     If the calendar month of sixthBirthday is July or earlier: calendarYearOf(sixthBirthday)
//     Otherwise: calendarYearOf(sixthBirthday) + 1
// - If the calendar year of sixthBirthday is 2022 or later:
//     If the calendar month of sixthBirthday is June or earlier: calendarYearOf(sixthBirthday)
//     Otherwise: calendarYearOf(sixthBirthday) + 1
func CalculateDefaultSchoolEnrollment(birthDate time.Time) *int {
	if birthDate.IsZero() {
		return nil
	}
	sixthBirthday := birthDate.AddDate(6, 0, 0)
	year := sixthBirthday.Year()
	month := sixthBirthday.Month()

	var result int
	if year <= 2019 {
		if month <= time.September {
			result = year
		} else {
			result = year + 1
		}
	} else if year == 2020 {
		if month <= time.August {
			result = year
		} else {
			result = year + 1
		}
	} else if year == 2021 {
		if month <= time.July {
			result = year
		} else {
			result = year + 1
		}
	} else {
		if month <= time.June {
			result = year
		} else {
			result = year + 1
		}
	}
	return &result
}

// CalculateRegularSchoolEnrollment is an alias for CalculateDefaultSchoolEnrollment.
func CalculateRegularSchoolEnrollment(birthDate time.Time) *int {
	return CalculateDefaultSchoolEnrollment(birthDate)
}

func (c *Child) PopulateComputedFields() {
	if !c.BirthDate.IsZero() {
		c.SchoolEnrollmentDefault = CalculateDefaultSchoolEnrollment(c.BirthDate)
	}
}

func (c Child) MarshalJSON() ([]byte, error) {
	if c.SchoolEnrollmentDefault == nil && !c.BirthDate.IsZero() {
		c.PopulateComputedFields()
	}
	type Alias Child
	return json.Marshal((Alias)(c))
}

type MealAllergenStatus string

const (
	MealAllergenStatusUnspecified  MealAllergenStatus = "unspecified"
	MealAllergenStatusNotRelevant  MealAllergenStatus = "not_relevant"
	MealAllergenStatusNotFinalized MealAllergenStatus = "not_finalized"
	MealAllergenStatusFinalized    MealAllergenStatus = "finalized"
)

func IsValidMealAllergenStatus(s MealAllergenStatus) bool {
	switch s {
	case MealAllergenStatusUnspecified, MealAllergenStatusNotRelevant, MealAllergenStatusNotFinalized, MealAllergenStatusFinalized:
		return true
	default:
		return false
	}
}

type MealAllergenComponent struct {
	Name      string   `json:"name"`
	Allergens []string `json:"allergens"`
}

type MealAllergenComponentList []MealAllergenComponent

func (l MealAllergenComponentList) Value() (driver.Value, error) {
	if l == nil {
		return "[]", nil
	}
	b, err := json.Marshal(l)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (l *MealAllergenComponentList) Scan(src interface{}) error {
	if src == nil {
		*l = MealAllergenComponentList{}
		return nil
	}
	var raw []byte
	switch s := src.(type) {
	case []byte:
		raw = s
	case string:
		raw = []byte(s)
	default:
		return fmt.Errorf("cannot scan %T into MealAllergenComponentList", src)
	}
	if len(raw) == 0 {
		*l = MealAllergenComponentList{}
		return nil
	}
	return json.Unmarshal(raw, l)
}

type MealAllergenDocumentation struct {
	PDFURL string `json:"pdf_url,omitempty"`
}

func (d MealAllergenDocumentation) Value() (driver.Value, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (d *MealAllergenDocumentation) Scan(src interface{}) error {
	if src == nil {
		*d = MealAllergenDocumentation{}
		return nil
	}
	var raw []byte
	switch s := src.(type) {
	case []byte:
		raw = s
	case string:
		raw = []byte(s)
	default:
		return fmt.Errorf("cannot scan %T into MealAllergenDocumentation", src)
	}
	if len(raw) == 0 {
		*d = MealAllergenDocumentation{}
		return nil
	}
	return json.Unmarshal(raw, d)
}

type MealAllergenDay struct {
	Date               string                    `json:"date"`
	HasAllergenRecord  bool                      `json:"has_allergen_record"`
	CookParentID       *uuid.UUID                `json:"cook_parent_id,omitempty"`
	CookEmployeeID     *uuid.UUID                `json:"cook_employee_id,omitempty"`
	CookCustomName     string                    `json:"cook_custom_name"`
	CookDisplayName    string                    `json:"cook_display_name"`
	MealComponents     MealAllergenComponentList `json:"meal_components"`
	Status             MealAllergenStatus        `json:"status"`
	Documentation      MealAllergenDocumentation `json:"documentation"`
	PlanCookName       string                    `json:"plan_cook_name"`
	PlanMealComponents []string                  `json:"plan_meal_components"`
	HasPlanMeal        bool                      `json:"has_plan_meal"`
	CreatedAt          *time.Time                `json:"created_at,omitempty"`
	UpdatedAt          *time.Time                `json:"updated_at,omitempty"`
}

type CookOption struct {
	ID          uuid.UUID `json:"id"`
	Type        string    `json:"type"` // "parent" or "employee"
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	DisplayName string    `json:"display_name"`
}




