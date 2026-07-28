package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// Executes `fn` in a SQL transaction
func (s *Store) WithTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Store) CreateFamilyWithParent(ctx context.Context, userID uuid.UUID, parent models.Parent) (*models.Family, error) {
	family := &models.Family{ID: uuid.New()}
	transactionID := uuid.New()

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		// 1. Create family
		_, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", family.ID)
		if err != nil {
			return err
		}

		// 2. Create parent
		parent.ID = uuid.New()
		parent.FamilyID = family.ID
		_, err = tx.Exec(ctx,
			"INSERT INTO parents (id, family_id, first_name, last_name, emails, phones, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)",
			parent.ID, parent.FamilyID, parent.FirstName, parent.LastName, parent.Emails, parent.Phones, parent.Notes)
		if err != nil {
			return err
		}

		// 3. Audit logs
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "family", family.ID, "INSERT", nil, family, userID); err != nil {
			return err
		}
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "parent", parent.ID, "INSERT", nil, parent, userID); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return family, nil
}

func (s *Store) recordAudit(ctx context.Context, tx pgx.Tx, tid uuid.UUID, fid *uuid.UUID, etype string, eid uuid.UUID, op string, before interface{}, after interface{}, userID uuid.UUID) error {
	var beforePayload, afterPayload []byte
	var err error

	if before != nil {
		beforePayload, err = json.Marshal(before)
		if err != nil {
			return err
		}
	}

	if after != nil {
		afterPayload, err = json.Marshal(after)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO audit_log (transaction_id, family_id, entity_type, entity_id, operation, before_snapshot, after_snapshot, changed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
		tid, fid, etype, eid, op, beforePayload, afterPayload, userID)
	return err
}

func (s *Store) ListFamilies(ctx context.Context) ([]models.Family, error) {
	rows, err := s.db.Query(ctx, `
		SELECT f.id, f.created_at, 
			   COALESCE((
				   SELECT json_agg(json_build_object(
					   'id', p.id,
					   'family_id', p.family_id,
					   'first_name', p.first_name,
					   'last_name', p.last_name,
					   'emails', p.emails,
					   'phones', p.phones,
					   'notes', p.notes,
					   'events', COALESCE((
						   SELECT json_agg(json_build_object(
							   'id', e.id,
							   'parent_id', e.parent_id,
							   'event_date', e.event_date::timestamptz,
							   'event_type', e.event_type,
							   'documentation', e.documentation,
							   'created_at', e.created_at,
							   'updated_at', e.updated_at
						   ) ORDER BY e.event_date DESC)
						   FROM hygiene_belehrung_events e WHERE e.parent_id = p.id
					   ), '[]'),
					   'memberships', COALESCE((
						   SELECT json_agg(json_build_object(
							   'id', m.id,
							   'parent_id', m.parent_id,
							   'start_date', m.start_date::timestamptz,
							   'end_date', m.end_date::timestamptz,
							   'membership_type', m.membership_type,
							   'created_at', m.created_at,
							   'updated_at', m.updated_at
						   ) ORDER BY m.start_date DESC)
						   FROM th_memberships m WHERE m.parent_id = p.id
					   ), '[]'),
					   'created_at', p.created_at,
					   'updated_at', p.updated_at
				   )) FROM parents p WHERE p.family_id = f.id
			   ), '[]'),
			   COALESCE((
				   SELECT json_agg(json_build_object(
					   'id', c.id,
					   'family_id', c.family_id,
					   'first_name', c.first_name,
					   'last_name', c.last_name,
					   'birth_date', c.birth_date::timestamptz,
					   'start_date', c.start_date::timestamptz,
					   'exit_date', c.exit_date::timestamptz,
					   'start_group', c.start_group,
					   'hort_start_date', c.hort_start_date::timestamptz,
					   'group2_start_date', c.group2_start_date::timestamptz,
					   'notes', c.notes,
					   'created_at', c.created_at,
					   'updated_at', c.updated_at
				   )) FROM children c WHERE c.family_id = f.id
			   ), '[]')
		FROM families f
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	families := []models.Family{}
	for rows.Next() {
		var f models.Family
		var parentsJSON, childrenJSON []byte
		if err := rows.Scan(&f.ID, &f.CreatedAt, &parentsJSON, &childrenJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(parentsJSON, &f.Parents); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(childrenJSON, &f.Children); err != nil {
			return nil, err
		}
		families = append(families, f)
	}

	return families, nil
}

func (s *Store) GetHistory(ctx context.Context, entityID uuid.UUID) ([]models.AuditLog, error) {
	rows, err := s.db.Query(ctx, "SELECT id, transaction_id, family_id, entity_type, entity_id, operation, before_snapshot, after_snapshot, changed_by, created_at FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC", entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		if err := rows.Scan(&l.ID, &l.TransactionID, &l.FamilyID, &l.EntityType, &l.EntityID, &l.Operation, &l.BeforeSnapshot, &l.AfterSnapshot, &l.ChangedBy, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (s *Store) UpdateFamilyParents(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, parents []models.Parent) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", familyID)
		if err != nil {
			return err
		}
		for _, p := range parents {
			var oldParent models.Parent
			err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, emails, phones, notes FROM parents WHERE id = $1 AND family_id = $2", p.ID, familyID).Scan(
				&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Notes,
			)
			isNew := (err == pgx.ErrNoRows)

			res, err := tx.Exec(ctx,
				"UPDATE parents SET first_name = $1, last_name = $2, emails = $3, phones = $4, notes = $5, updated_at = NOW() WHERE id = $6 AND family_id = $7",
				p.FirstName, p.LastName, p.Emails, p.Phones, p.Notes, p.ID, familyID)
			if err != nil {
				return err
			}

			if res.RowsAffected() == 0 || isNew {
				if p.ID == uuid.Nil {
					p.ID = uuid.New()
				}
				p.FamilyID = familyID
				_, err = tx.Exec(ctx,
					"INSERT INTO parents (id, family_id, first_name, last_name, emails, phones, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)",
					p.ID, p.FamilyID, p.FirstName, p.LastName, p.Emails, p.Phones, p.Notes)
				if err != nil {
					return err
				}
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "INSERT", nil, p, userID); err != nil {
					return err
				}
			} else {
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "UPDATE", oldParent, p, userID); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s *Store) UpdateChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID, child models.Child) error {
	transactionID := uuid.New()

	// If start_group is Hort (3), hort_start_date equals start_date
	if child.StartGroup != nil && *child.StartGroup == 3 {
		child.HortStartDate = child.StartDate
	}

	return s.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", child.FamilyID)
		if err != nil {
			return err
		}

		var oldChild models.Child
		err = tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, birth_date, start_date, exit_date, start_group, hort_start_date, group2_start_date, notes FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.LastName, &oldChild.BirthDate, &oldChild.StartDate, &oldChild.ExitDate, &oldChild.StartGroup, &oldChild.HortStartDate, &oldChild.Group2StartDate, &oldChild.Notes,
		)
		isNew := (err == pgx.ErrNoRows)

		res, err := tx.Exec(ctx,
			"UPDATE children SET first_name = $1, last_name = $2, birth_date = $3, start_date = $4, exit_date = $5, start_group = $6, hort_start_date = $7, group2_start_date = $8, notes = $9, updated_at = NOW() WHERE id = $10",
			child.FirstName, child.LastName, child.BirthDate, child.StartDate, child.ExitDate, child.StartGroup, child.HortStartDate, child.Group2StartDate, child.Notes, childID)
		if err != nil {
			return err
		}

		if res.RowsAffected() == 0 || isNew {
			if child.ID == uuid.Nil {
				child.ID = childID
			}
			_, err = tx.Exec(ctx,
				"INSERT INTO children (id, family_id, first_name, last_name, birth_date, start_date, exit_date, start_group, hort_start_date, group2_start_date, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
				child.ID, child.FamilyID, child.FirstName, child.LastName, child.BirthDate, child.StartDate, child.ExitDate, child.StartGroup, child.HortStartDate, child.Group2StartDate, child.Notes)
			if err != nil {
				return err
			}
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", child.ID, "INSERT", nil, child, userID)
		} else {
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", childID, "UPDATE", oldChild, child, userID)
		}
	})
}

func (s *Store) DeleteFamily(ctx context.Context, userID uuid.UUID, familyID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var family models.Family
		family.ID = familyID
		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "DELETE", family, nil, userID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
		return err
	})
}

func (s *Store) DeleteChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldChild models.Child
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, birth_date, start_date, exit_date, start_group, hort_start_date, group2_start_date, notes FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.LastName, &oldChild.BirthDate, &oldChild.StartDate, &oldChild.ExitDate, &oldChild.StartGroup, &oldChild.HortStartDate, &oldChild.Group2StartDate, &oldChild.Notes,
		)
		if err != nil {
			return err
		}

		if err := s.recordAudit(ctx, tx, transactionID, &oldChild.FamilyID, "child", childID, "DELETE", oldChild, nil, userID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "DELETE FROM children WHERE id = $1", childID)
		if err != nil {
			return err
		}

		// Cleanup empty family
		var parentCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM parents WHERE family_id = $1", oldChild.FamilyID).Scan(&parentCount)
		if err != nil {
			return err
		}
		var childCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM children WHERE family_id = $1", oldChild.FamilyID).Scan(&childCount)
		if err != nil {
			return err
		}
		if parentCount == 0 && childCount == 0 {
			var f models.Family
			f.ID = oldChild.FamilyID
			if err := s.recordAudit(ctx, tx, transactionID, &oldChild.FamilyID, "family", oldChild.FamilyID, "DELETE", f, nil, userID); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", oldChild.FamilyID)
			return err
		}
		return nil
	})
}

func (s *Store) DeleteParent(ctx context.Context, userID uuid.UUID, parentID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldParent models.Parent
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, emails, phones, notes FROM parents WHERE id = $1", parentID).Scan(
			&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Notes,
		)
		if err != nil {
			return err
		}

		if err := s.recordAudit(ctx, tx, transactionID, &oldParent.FamilyID, "parent", parentID, "DELETE", oldParent, nil, userID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "DELETE FROM parents WHERE id = $1", parentID)
		if err != nil {
			return err
		}

		// Cleanup empty family
		var parentCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM parents WHERE family_id = $1", oldParent.FamilyID).Scan(&parentCount)
		if err != nil {
			return err
		}
		var childCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM children WHERE family_id = $1", oldParent.FamilyID).Scan(&childCount)
		if err != nil {
			return err
		}
		if parentCount == 0 && childCount == 0 {
			var f models.Family
			f.ID = oldParent.FamilyID
			if err := s.recordAudit(ctx, tx, transactionID, &oldParent.FamilyID, "family", oldParent.FamilyID, "DELETE", f, nil, userID); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", oldParent.FamilyID)
			return err
		}
		return nil
	})
}

func (s *Store) CreateHygieneEvent(ctx context.Context, userID uuid.UUID, event models.HygieneBelehrungEvent) (models.HygieneBelehrungEvent, error) {
	transactionID := uuid.New()
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		// Get family ID of the parent for audit logging
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", event.ParentID).Scan(&familyID)
		if err != nil {
			return fmt.Errorf("parent not found: %w", err)
		}

		_, err = tx.Exec(ctx,
			"INSERT INTO hygiene_belehrung_events (id, parent_id, event_date, event_type, documentation) VALUES ($1, $2, $3, $4, $5)",
			event.ID, event.ParentID, event.EventDate, event.EventType, event.Documentation)
		if err != nil {
			return err
		}

		return s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", event.ID, "INSERT", nil, event, userID)
	})

	if err != nil {
		return models.HygieneBelehrungEvent{}, err
	}
	return event, nil
}

func (s *Store) DeleteHygieneEvent(ctx context.Context, userID uuid.UUID, eventID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var parentID uuid.UUID
		var eventDate time.Time
		var eventType string
		var documentation string
		err := tx.QueryRow(ctx, "SELECT parent_id, event_date, event_type, documentation FROM hygiene_belehrung_events WHERE id = $1", eventID).Scan(&parentID, &eventDate, &eventType, &documentation)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&familyID)
		if err != nil {
			return err
		}

		oldEvent := models.HygieneBelehrungEvent{
			ID:            eventID,
			ParentID:      parentID,
			EventDate:     eventDate,
			EventType:     eventType,
			Documentation: documentation,
		}

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", eventID, "DELETE", oldEvent, nil, userID); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM hygiene_belehrung_events WHERE id = $1", eventID)
		return err
	})
}

func (s *Store) CreateTHMembership(ctx context.Context, userID uuid.UUID, m models.THMembership) (models.THMembership, error) {
	transactionID := uuid.New()
	var created models.THMembership
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", m.ParentID).Scan(&familyID)
		if err != nil {
			return err
		}

		err = tx.QueryRow(ctx, `
			INSERT INTO th_memberships (parent_id, start_date, end_date, membership_type)
			VALUES ($1, $2, $3, $4)
			RETURNING id, parent_id, start_date, end_date, membership_type, created_at, updated_at
		`, m.ParentID, m.StartDate, m.EndDate, m.MembershipType).Scan(
			&created.ID, &created.ParentID, &created.StartDate, &created.EndDate, &created.MembershipType, &created.CreatedAt, &created.UpdatedAt,
		)
		if err != nil {
			return err
		}

		return s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", created.ID, "INSERT", nil, created, userID)
	})
	return created, err
}

func (s *Store) DeleteTHMembership(ctx context.Context, userID uuid.UUID, membershipID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var parentID uuid.UUID
		var startDate time.Time
		var endDate *time.Time
		var membershipType string
		err := tx.QueryRow(ctx, "SELECT parent_id, start_date, end_date, membership_type FROM th_memberships WHERE id = $1", membershipID).Scan(&parentID, &startDate, &endDate, &membershipType)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&familyID)
		if err != nil {
			return err
		}

		oldMembership := models.THMembership{
			ID:             membershipID,
			ParentID:       parentID,
			StartDate:      startDate,
			EndDate:        endDate,
			MembershipType: membershipType,
		}

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", membershipID, "DELETE", oldMembership, nil, userID); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM th_memberships WHERE id = $1", membershipID)
		return err
	})
}

func (s *Store) ListAuditLogs(ctx context.Context) ([]models.AuditLog, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(u.email, ''), a.created_at
		FROM audit_log a
		LEFT JOIN users u ON a.changed_by = u.id
		ORDER BY a.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		err := rows.Scan(&l.ID, &l.TransactionID, &l.FamilyID, &l.EntityType, &l.EntityID, &l.Operation, &l.BeforeSnapshot, &l.AfterSnapshot, &l.ChangedBy, &l.ChangedByEmail, &l.CreatedAt)
		if err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *Store) ListRoles(ctx context.Context) ([]models.Role, error) {
	rows, err := s.db.Query(ctx, "SELECT id, name, description, permissions, created_at, updated_at FROM roles ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []models.Role
	for rows.Next() {
		var r models.Role
		var permsJSON []byte
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &permsJSON, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if len(permsJSON) > 0 {
			_ = json.Unmarshal(permsJSON, &r.Permissions)
		}
		if r.Permissions == nil {
			r.Permissions = []string{}
		}
		roles = append(roles, r)
	}
	return roles, nil
}

func (s *Store) CreateRole(ctx context.Context, role models.Role) (*models.Role, error) {
	permsJSON, err := json.Marshal(role.Permissions)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRow(ctx, `
		INSERT INTO roles (id, name, description, permissions)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, description, permissions, created_at, updated_at
	`, role.ID, role.Name, role.Description, permsJSON).Scan(
		&role.ID, &role.Name, &role.Description, &permsJSON, &role.CreatedAt, &role.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func (s *Store) UpdateRole(ctx context.Context, role models.Role) error {
	permsJSON, err := json.Marshal(role.Permissions)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `
		UPDATE roles SET name = $1, description = $2, permissions = $3, updated_at = NOW()
		WHERE id = $4
	`, role.Name, role.Description, permsJSON, role.ID)
	return err
}

func (s *Store) DeleteRole(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM roles WHERE id = $1", id)
	return err
}

func (s *Store) GetUserWithPermissionsByEmail(ctx context.Context, email string) (*models.UserWithPermissions, error) {
	query := `
		SELECT 
			u.id, 
			u.email, 
			u.permissions,
			u.last_login,
			u.created_at,
			u.updated_at,
			COALESCE(array_agg(r.id) FILTER (WHERE r.id IS NOT NULL), '{}') as roles,
			COALESCE(jsonb_agg(r.permissions) FILTER (WHERE r.permissions IS NOT NULL), '[]'::jsonb) as role_permissions
		FROM users u
		LEFT JOIN user_roles ur ON u.id = ur.user_id
		LEFT JOIN roles r ON ur.role_id = r.id
		WHERE u.email = $1
		GROUP BY u.id, u.email, u.permissions, u.last_login, u.created_at, u.updated_at
	`

	var u models.UserWithPermissions
	var userPermissionsJSON, rolePermissionsJSON []byte

	err := s.db.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.Email, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON,
	)
	if err != nil {
		return nil, err
	}

	if len(userPermissionsJSON) > 0 {
		_ = json.Unmarshal(userPermissionsJSON, &u.Permissions)
	}
	if u.Permissions == nil {
		u.Permissions = []string{}
	}

	var rolePermsList [][]string
	if len(rolePermissionsJSON) > 0 {
		_ = json.Unmarshal(rolePermissionsJSON, &rolePermsList)
	}

	permMap := make(map[string]bool)
	for _, p := range u.Permissions {
		permMap[p] = true
	}
	for _, rPerms := range rolePermsList {
		for _, p := range rPerms {
			permMap[p] = true
		}
	}

	u.EffectivePermissions = make([]string, 0, len(permMap))
	for p := range permMap {
		u.EffectivePermissions = append(u.EffectivePermissions, p)
	}

	return &u, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]models.UserWithPermissions, error) {
	query := `
		SELECT 
			u.id, 
			u.email, 
			u.permissions,
			u.last_login,
			u.created_at,
			u.updated_at,
			COALESCE(array_agg(r.id) FILTER (WHERE r.id IS NOT NULL), '{}') as roles,
			COALESCE(jsonb_agg(r.permissions) FILTER (WHERE r.permissions IS NOT NULL), '[]'::jsonb) as role_permissions
		FROM users u
		LEFT JOIN user_roles ur ON u.id = ur.user_id
		LEFT JOIN roles r ON ur.role_id = r.id
		GROUP BY u.id, u.email, u.permissions, u.last_login, u.created_at, u.updated_at
		ORDER BY u.created_at ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.UserWithPermissions
	for rows.Next() {
		var u models.UserWithPermissions
		var userPermissionsJSON, rolePermissionsJSON []byte

		err := rows.Scan(&u.ID, &u.Email, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON)
		if err != nil {
			return nil, err
		}

		if len(userPermissionsJSON) > 0 {
			_ = json.Unmarshal(userPermissionsJSON, &u.Permissions)
		}
		if u.Permissions == nil {
			u.Permissions = []string{}
		}

		var rolePermsList [][]string
		if len(rolePermissionsJSON) > 0 {
			_ = json.Unmarshal(rolePermissionsJSON, &rolePermsList)
		}

		permMap := make(map[string]bool)
		for _, p := range u.Permissions {
			permMap[p] = true
		}
		for _, rPerms := range rolePermsList {
			for _, p := range rPerms {
				permMap[p] = true
			}
		}

		u.EffectivePermissions = make([]string, 0, len(permMap))
		for p := range permMap {
			u.EffectivePermissions = append(u.EffectivePermissions, p)
		}

		users = append(users, u)
	}
	return users, nil
}

func (s *Store) CreateUser(ctx context.Context, email string, roles []string, permissions []string) (*models.UserWithPermissions, error) {
	if permissions == nil {
		permissions = []string{}
	}
	permsJSON, err := json.Marshal(permissions)
	if err != nil {
		return nil, err
	}

	userID := uuid.New()
	err = s.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "INSERT INTO users (id, email, permissions) VALUES ($1, $2, $3)", userID, email, permsJSON)
		if err != nil {
			return err
		}

		for _, roleID := range roles {
			_, err = tx.Exec(ctx, "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", userID, roleID)
			if err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &models.UserWithPermissions{
		ID:          userID,
		Email:       email,
		Roles:       roles,
		Permissions: permissions,
	}, nil
}

func (s *Store) UpdateUser(ctx context.Context, id uuid.UUID, roles []string, permissions []string) error {
	if permissions == nil {
		permissions = []string{}
	}
	permsJSON, err := json.Marshal(permissions)
	if err != nil {
		return err
	}

	return s.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "UPDATE users SET permissions = $1, updated_at = NOW() WHERE id = $2", permsJSON, id)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM user_roles WHERE user_id = $1", id)
		if err != nil {
			return err
		}

		for _, roleID := range roles {
			_, err = tx.Exec(ctx, "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", id, roleID)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) DeleteUser(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
	return err
}
