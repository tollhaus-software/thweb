package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
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
	ID                   uuid.UUID  `json:"id"`
	Email                string     `json:"email"`
	Roles                []string   `json:"roles"`
	Permissions          []string   `json:"permissions"`
	EffectivePermissions []string   `json:"effective_permissions"`
	FamilyID             *uuid.UUID `json:"family_id,omitempty"`
	LastLogin            *time.Time `json:"last_login,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
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
	}
	return false
}

func (s *UserWithPermissions) IsSelfFamily(familyID uuid.UUID) bool {
	return s.FamilyID != nil && *s.FamilyID == familyID
}

func (s *UserWithPermissions) EnsureImpliedPermissions() {
	hasFamiliesAll := false
	hasFeesAll := false
	permSet := make(map[string]bool)
	for _, p := range s.EffectivePermissions {
		permSet[p] = true
		if p == "*" || p == "families.all.read" {
			hasFamiliesAll = true
		}
		if p == "*" || p == "fees.all.read" {
			hasFeesAll = true
		}
	}
	if hasFamiliesAll {
		permSet["families.all.restrictedread"] = true
	}
	if hasFeesAll {
		permSet["fees.self.read"] = true
	}
	s.EffectivePermissions = make([]string, 0, len(permSet))
	for p := range permSet {
		s.EffectivePermissions = append(s.EffectivePermissions, p)
	}
}

// NormalizeEmail trims surrounding whitespace and converts the email address to lowercase,
// preserving dots in the username/local-part to support Google Workspace accounts.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
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
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Parents   []Parent  `json:"parents,omitempty"`
	Children  []Child   `json:"children,omitempty"`
}

func (f Family) DisplayName() string {
	if len(f.Parents) == 0 {
		return "Familie (ohne Eltern)"
	}
	names := make([]string, len(f.Parents))
	for i, p := range f.Parents {
		names[i] = p.FirstName + " " + p.LastName
	}
	return "Familie " + strings.Join(names, " & ")
}

type MultiValueEntry struct {
	Value           string `json:"value"`
	AddressList     bool   `json:"address_list"`
	IdentifierEmail bool   `json:"identifier_email"`
}

func (m *MultiValueEntry) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		m.Value = str
		m.AddressList = true
		m.IdentifierEmail = false
		return nil
	}
	type Alias MultiValueEntry
	var alias struct {
		Alias
		AddressListCamel     *bool `json:"addressList"`
		IdentifierEmailCamel *bool `json:"identifierEmail"`
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

type ChildGroupChange struct {
	ID          uuid.UUID `json:"id"`
	Child       uuid.UUID `json:"child"`
	ChangeDate  time.Time `json:"change_date"`
	TargetGroup int       `json:"target_group"` // 0: exit, 1: Kleine Gruppe, 2: Grosse Gruppe, 3: Hort
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Child struct {
	ID                         uuid.UUID          `json:"id"`
	FamilyID                   uuid.UUID          `json:"family_id"`
	FirstName                  string             `json:"first_name"`
	LastName                   string             `json:"last_name"`
	BirthDate                  time.Time          `json:"birth_date"`
	Notes                      string             `json:"notes"`
	VaccinationStatusProtected []byte             `json:"vaccination_status_protected,omitempty"`
	VaccinationChecks          []VaccinationCheck `json:"vaccination_checks,omitempty"`
	GroupChanges               []ChildGroupChange `json:"group_changes"`
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

