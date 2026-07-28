package models

import (
	"encoding/json"
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
	LastLogin            *time.Time `json:"last_login,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

func (s *UserWithPermissions) HasPermission(perm string) bool {
	for _, p := range s.EffectivePermissions {
		if p == "*" || p == perm {
			return true
		}
	}
	return false
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

type Parent struct {
	ID          uuid.UUID               `json:"id"`
	FamilyID    uuid.UUID               `json:"family_id"`
	FirstName   string                  `json:"first_name"`
	LastName    string                  `json:"last_name"`
	Emails      []string                `json:"emails"`
	Phones      []string                `json:"phones"`
	Notes       string                  `json:"notes"`
	Events      []HygieneBelehrungEvent `json:"events"`
	Memberships []THMembership          `json:"memberships"`
	CreatedAt   time.Time               `json:"created_at"`
	UpdatedAt   time.Time               `json:"updated_at"`
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

type Child struct {
	ID            uuid.UUID  `json:"id"`
	FamilyID      uuid.UUID  `json:"family_id"`
	FirstName     string     `json:"first_name"`
	LastName      string     `json:"last_name"`
	BirthDate     time.Time  `json:"birth_date"`
	StartDate     *time.Time `json:"start_date"`
	ExitDate      *time.Time `json:"exit_date"`
	StartGroup      *int       `json:"start_group"`
	HortStartDate   *time.Time `json:"hort_start_date"`
	Group2StartDate *time.Time `json:"group2_start_date"`
	Notes           string     `json:"notes"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
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
