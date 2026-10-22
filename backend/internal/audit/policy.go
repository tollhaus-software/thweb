package audit

import (
	"encoding/json"

	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

// EntityPolicy defines permission and sanitization rules for an entity type in the audit log.
type EntityPolicy struct {
	// CanUserView returns true if the user has permission to see audit entries of this entity type.
	CanUserView func(user *models.UserWithPermissions, familyID *uuid.UUID) bool

	// SanitizeSnapshot redacts or filters sensitive fields within the snapshot based on user's permissions.
	SanitizeSnapshot func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{}
}

// stripSensitiveHealthFields removes GDPR Art. 9 sensitive health fields (vaccination and allergies)
// as a defense-in-depth guarantee so they are never exposed via audit log snapshots.
func stripSensitiveHealthFields(m map[string]interface{}) {
	delete(m, "vaccination_checks")
	delete(m, "vaccination_status_protected")
	delete(m, "allergies")
	delete(m, "allergies_protected")
	delete(m, "dietary_notes")
	delete(m, "emergency_instructions")
}

// AuditRegistry holds the security policies for all entity types recorded in audit_log.
// Any entity type not explicitly registered here will fail-closed (hidden from non-superadmins).
var AuditRegistry = map[string]EntityPolicy{
	"family": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			if user.HasPermission("families.all.read") {
				return true
			}
			if familyID != nil && user.IsSelfFamily(*familyID) && user.HasPermission("families.self.selfservice") {
				return true
			}
			return false
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			stripSensitiveHealthFields(snapshot)

			if parentsRaw, ok := snapshot["parents"].([]interface{}); ok {
				for _, pItem := range parentsRaw {
					if pMap, ok := pItem.(map[string]interface{}); ok {
						stripSensitiveHealthFields(pMap)
						if !user.HasPermission("families.all.read") {
							pMap["notes"] = ""
						}
					}
				}
			}
			if childrenRaw, ok := snapshot["children"].([]interface{}); ok {
				for _, cItem := range childrenRaw {
					if cMap, ok := cItem.(map[string]interface{}); ok {
						stripSensitiveHealthFields(cMap)
						if !user.HasPermission("families.all.read") {
							cMap["notes"] = ""
						}
					}
				}
			}
			return snapshot
		},
	},
	"parent": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			if user.HasPermission("families.all.read") {
				return true
			}
			if familyID != nil && user.IsSelfFamily(*familyID) && user.HasPermission("families.self.selfservice") {
				return true
			}
			return false
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			stripSensitiveHealthFields(snapshot)

			// Non-staff users (e.g. self-service or restricted) cannot see staff notes
			if !user.HasPermission("families.all.read") {
				snapshot["notes"] = ""

				// Filter emails to address_list only
				if emailsRaw, ok := snapshot["emails"].([]interface{}); ok {
					var filteredEmails []interface{}
					for _, item := range emailsRaw {
						if m, ok := item.(map[string]interface{}); ok {
							if addrList, _ := m["address_list"].(bool); addrList {
								filteredEmails = append(filteredEmails, m)
							}
						}
					}
					snapshot["emails"] = filteredEmails
				}

				// Filter phones to address_list only
				if phonesRaw, ok := snapshot["phones"].([]interface{}); ok {
					var filteredPhones []interface{}
					for _, item := range phonesRaw {
						if m, ok := item.(map[string]interface{}); ok {
							if addrList, _ := m["address_list"].(bool); addrList {
								filteredPhones = append(filteredPhones, m)
							}
						}
					}
					snapshot["phones"] = filteredPhones
				}
			}
			return snapshot
		},
	},
	"child": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			if user.HasPermission("families.all.read") || user.HasPermission("children.all.write") || user.HasPermission("allergies.children.read") || user.HasPermission("allergies.children.write") {
				return true
			}
			if familyID != nil && user.IsSelfFamily(*familyID) && user.HasPermission("families.self.selfservice") {
				return true
			}
			return false
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			stripSensitiveHealthFields(snapshot)

			if !user.HasPermission("families.all.read") && !user.HasPermission("children.all.write") {
				snapshot["notes"] = ""
			}
			return snapshot
		},
	},
	"child_group_change": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			if user.HasPermission("families.all.read") || user.HasPermission("children.all.write") {
				return true
			}
			if familyID != nil && user.IsSelfFamily(*familyID) && user.HasPermission("families.self.selfservice") {
				return true
			}
			return false
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			return snapshot
		},
	},
	"hygiene_event": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			return user.HasPermission("families.all.read") || user.HasPermission("hygiene.all.write")
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			return snapshot
		},
	},
	"th_membership": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			return user.HasPermission("families.all.read") ||
				user.HasPermission("memberships.all.read") ||
				user.HasPermission("memberships.all.write") ||
				user.HasPermission("fees.all.read") ||
				(familyID != nil && user.IsSelfFamily(*familyID) && user.HasPermission("memberships.self.read"))
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			return snapshot
		},
	},
	"employee": {
		CanUserView: func(user *models.UserWithPermissions, familyID *uuid.UUID) bool {
			return user.HasPermission("employees.all.read") || user.HasPermission("employees.all.write") || user.HasPermission("allergies.employees.read") || user.HasPermission("allergies.employees.write")
		},
		SanitizeSnapshot: func(user *models.UserWithPermissions, snapshot map[string]interface{}) map[string]interface{} {
			stripSensitiveHealthFields(snapshot)
			return snapshot
		},
	},
}

// AllowedEntityTypesForUser returns a list of entity type strings that the user is potentially authorized to view.
// If the user has "*" superadmin permission, it returns nil (meaning all types allowed).
func AllowedEntityTypesForUser(user *models.UserWithPermissions) []string {
	if user == nil {
		return []string{}
	}
	if user.HasPermission("*") {
		return nil
	}

	var allowed []string
	if user.HasPermission("families.all.read") || (user.FamilyID != nil && user.HasPermission("families.self.selfservice")) {
		allowed = append(allowed, "family", "parent")
	}
	if user.HasPermission("families.all.read") || user.HasPermission("children.all.write") || user.HasPermission("allergies.children.read") || user.HasPermission("allergies.children.write") || (user.FamilyID != nil && user.HasPermission("families.self.selfservice")) {
		allowed = append(allowed, "child", "child_group_change")
	}
	if user.HasPermission("families.all.read") || user.HasPermission("hygiene.all.write") {
		allowed = append(allowed, "hygiene_event")
	}
	if user.HasPermission("families.all.read") || user.HasPermission("memberships.all.read") || user.HasPermission("memberships.all.write") || user.HasPermission("fees.all.read") || (user.FamilyID != nil && user.HasPermission("memberships.self.read")) {
		allowed = append(allowed, "th_membership")
	}
	if user.HasPermission("employees.all.read") || user.HasPermission("employees.all.write") || user.HasPermission("allergies.employees.read") || user.HasPermission("allergies.employees.write") {
		allowed = append(allowed, "employee")
	}

	return allowed
}

// CanUserViewEntity returns true if the user is authorized to view audit records of the specified entity type.
// If the entity type is unknown, it fails closed (returns false unless the user has "*" superadmin permission).
func CanUserViewEntity(user *models.UserWithPermissions, entityType string, familyID *uuid.UUID) bool {
	if user == nil {
		return false
	}
	if user.HasPermission("*") {
		return true
	}

	policy, exists := AuditRegistry[entityType]
	if !exists {
		// Fail-closed default: unknown entity types are hidden from non-superadmins
		return false
	}

	return policy.CanUserView(user, familyID)
}

// SanitizeSnapshot applies entity-specific field sanitization to a raw JSON snapshot.
func SanitizeSnapshot(user *models.UserWithPermissions, entityType string, rawJSON []byte) []byte {
	if len(rawJSON) == 0 {
		return rawJSON
	}

	var m map[string]interface{}
	if err := json.Unmarshal(rawJSON, &m); err != nil {
		return rawJSON
	}

	policy, exists := AuditRegistry[entityType]
	if exists && policy.SanitizeSnapshot != nil {
		m = policy.SanitizeSnapshot(user, m)
	} else {
		// Defense-in-depth: always strip sensitive health fields
		stripSensitiveHealthFields(m)
	}

	sanitized, err := json.Marshal(m)
	if err != nil {
		return rawJSON
	}
	return sanitized
}

// FilterAuditLogsForUser applies row-level security and field-level sanitization to a slice of audit logs.
func FilterAuditLogsForUser(user *models.UserWithPermissions, logs []models.AuditLog) []models.AuditLog {
	if user == nil {
		return []models.AuditLog{}
	}

	filtered := make([]models.AuditLog, 0, len(logs))
	for _, l := range logs {
		if !CanUserViewEntity(user, l.EntityType, l.FamilyID) {
			continue
		}

		sanitizedLog := l
		if len(l.BeforeSnapshot) > 0 {
			sanitizedLog.BeforeSnapshot = SanitizeSnapshot(user, l.EntityType, l.BeforeSnapshot)
		}
		if len(l.AfterSnapshot) > 0 {
			sanitizedLog.AfterSnapshot = SanitizeSnapshot(user, l.EntityType, l.AfterSnapshot)
		}
		filtered = append(filtered, sanitizedLog)
	}

	return filtered
}
