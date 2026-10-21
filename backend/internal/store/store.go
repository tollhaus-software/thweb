package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/audit"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func sanitizeSlice(s models.MultiValueList) models.MultiValueList {
	if s == nil {
		return models.MultiValueList{}
	}
	return s
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

func (s *Store) CreateFamilyWithParents(ctx context.Context, userID uuid.UUID, parents []models.Parent) (*models.Family, error) {
	family := &models.Family{ID: uuid.New()}
	transactionID := uuid.New()
	createdParents := make([]models.Parent, 0, len(parents))

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		// 1. Create family
		_, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", family.ID)
		if err != nil {
			return err
		}

		// 2. Create parents
		for _, p := range parents {
			if p.FirstName == "" && p.LastName == "" {
				continue
			}
			p.ID = uuid.New()
			p.FamilyID = family.ID
			p.Emails = sanitizeSlice(p.Emails)
			p.Phones = sanitizeSlice(p.Phones)

			_, err = tx.Exec(ctx,
				"INSERT INTO parents (id, family_id, first_name, last_name, emails, phones, address, notes, vaccination_status_protected) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
				p.ID, p.FamilyID, p.FirstName, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected)
			if err != nil {
				return err
			}

			if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "parent", p.ID, "INSERT", nil, p, userID); err != nil {
				return err
			}
			createdParents = append(createdParents, p)
		}

		family.Parents = createdParents
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "family", family.ID, "INSERT", nil, family, userID); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	family.Parents = createdParents
	return family, nil
}

func multiValueListEqual(a, b models.MultiValueList) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Value != b[i].Value {
			return false
		}
		if a[i].AddressList != b[i].AddressList {
			return false
		}
		if a[i].IdentifierEmail != b[i].IdentifierEmail {
			return false
		}
	}
	return true
}

func parentNonVaccinationChanged(old, new models.Parent) bool {
	return old.FirstName != new.FirstName ||
		old.LastName != new.LastName ||
		old.Address != new.Address ||
		old.Notes != new.Notes ||
		!multiValueListEqual(old.Emails, new.Emails) ||
		!multiValueListEqual(old.Phones, new.Phones)
}

func childNonVaccinationChanged(old, new models.Child) bool {
	return old.FirstName != new.FirstName ||
		old.LastName != new.LastName ||
		old.BirthDate.Format("2006-01-02") != new.BirthDate.Format("2006-01-02") ||
		old.Notes != new.Notes
}

func cleanForAudit(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch e := v.(type) {
	case models.Parent:
		e.VaccinationChecks = nil
		e.VaccinationStatusProtected = nil
		return e
	case *models.Parent:
		if e == nil {
			return nil
		}
		cp := *e
		cp.VaccinationChecks = nil
		cp.VaccinationStatusProtected = nil
		return cp
	case models.Child:
		e.VaccinationChecks = nil
		e.VaccinationStatusProtected = nil
		return e
	case *models.Child:
		if e == nil {
			return nil
		}
		cp := *e
		cp.VaccinationChecks = nil
		cp.VaccinationStatusProtected = nil
		return cp
	case models.Family:
		cp := e
		if cp.Parents != nil {
			cp.Parents = make([]models.Parent, len(e.Parents))
			for i := range e.Parents {
				cp.Parents[i] = e.Parents[i]
				cp.Parents[i].VaccinationChecks = nil
				cp.Parents[i].VaccinationStatusProtected = nil
			}
		}
		if cp.Children != nil {
			cp.Children = make([]models.Child, len(e.Children))
			for i := range e.Children {
				cp.Children[i] = e.Children[i]
				cp.Children[i].VaccinationChecks = nil
				cp.Children[i].VaccinationStatusProtected = nil
			}
		}
		return cp
	case *models.Family:
		if e == nil {
			return nil
		}
		cp := *e
		if cp.Parents != nil {
			cp.Parents = make([]models.Parent, len(e.Parents))
			for i := range e.Parents {
				cp.Parents[i] = e.Parents[i]
				cp.Parents[i].VaccinationChecks = nil
				cp.Parents[i].VaccinationStatusProtected = nil
			}
		}
		if cp.Children != nil {
			cp.Children = make([]models.Child, len(e.Children))
			for i := range e.Children {
				cp.Children[i] = e.Children[i]
				cp.Children[i].VaccinationChecks = nil
				cp.Children[i].VaccinationStatusProtected = nil
			}
		}
		return cp
	default:
		return v
	}
}

func (s *Store) recordAudit(ctx context.Context, tx pgx.Tx, tid uuid.UUID, fid *uuid.UUID, etype string, eid uuid.UUID, op string, before interface{}, after interface{}, userID uuid.UUID) error {
	var beforePayload, afterPayload []byte
	var err error

	beforeCleaned := cleanForAudit(before)
	afterCleaned := cleanForAudit(after)

	if beforeCleaned != nil {
		beforePayload, err = json.Marshal(beforeCleaned)
		if err != nil {
			return err
		}
	}

	if afterCleaned != nil {
		afterPayload, err = json.Marshal(afterCleaned)
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
					   'address', p.address,
					   'notes', p.notes,
					   'vaccination_status_protected', encode(p.vaccination_status_protected, 'base64'),
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
					   'group_changes', COALESCE((
						   SELECT json_agg(json_build_object(
							   'id', gc.id,
							   'child', gc.child,
							   'change_date', gc.change_date::timestamptz,
							   'target_group', gc.target_group,
							   'created_at', gc.created_at,
							   'updated_at', gc.updated_at
						   ) ORDER BY gc.change_date ASC)
						   FROM children_group_changes gc WHERE gc.child = c.id
					   ), '[]'),
					   'notes', c.notes,
					   'vaccination_status_protected', encode(c.vaccination_status_protected, 'base64'),
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
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(u.email, ''), a.created_at
		FROM audit_log a
		LEFT JOIN users u ON a.changed_by = u.id
		WHERE a.entity_id = $1
		ORDER BY a.created_at DESC
	`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		if err := rows.Scan(&l.ID, &l.TransactionID, &l.FamilyID, &l.EntityType, &l.EntityID, &l.Operation, &l.BeforeSnapshot, &l.AfterSnapshot, &l.ChangedBy, &l.ChangedByEmail, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *Store) GetHistoryForUser(ctx context.Context, entityID uuid.UUID, user *models.UserWithPermissions) ([]models.AuditLog, error) {
	logs, err := s.GetHistory(ctx, entityID)
	if err != nil {
		return nil, err
	}
	return audit.FilterAuditLogsForUser(user, logs), nil
}

func (s *Store) GetParentsByFamilyID(ctx context.Context, familyID uuid.UUID) ([]models.Parent, error) {
	rows, err := s.db.Query(ctx,
		"SELECT id, family_id, first_name, last_name, emails, phones, address, notes, vaccination_status_protected, created_at, updated_at FROM parents WHERE family_id = $1",
		familyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var parents []models.Parent
	for rows.Next() {
		var p models.Parent
		if err := rows.Scan(&p.ID, &p.FamilyID, &p.FirstName, &p.LastName, &p.Emails, &p.Phones, &p.Address, &p.Notes, &p.VaccinationStatusProtected, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		parents = append(parents, p)
	}
	return parents, rows.Err()
}

func (s *Store) GetFamilyIDByIdentifierEmail(ctx context.Context, email string) (*uuid.UUID, error) {
	norm := models.NormalizeEmail(email)
	if norm == "" {
		return nil, nil
	}
	query := `
		SELECT p.family_id
		FROM parents p, jsonb_array_elements(p.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND lower(trim(elem->>'value')) = $1
		LIMIT 1
	`
	var familyID uuid.UUID
	err := s.db.QueryRow(ctx, query, norm).Scan(&familyID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &familyID, nil
}

func (s *Store) ListIdentifyingEmails(ctx context.Context) (map[string]uuid.UUID, error) {
	query := `
		SELECT lower(trim(elem->>'value')) AS email, p.family_id
		FROM parents p, jsonb_array_elements(p.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND lower(trim(elem->>'value')) <> ''
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	identEmails := make(map[string]uuid.UUID)
	for rows.Next() {
		var email string
		var familyID uuid.UUID
		if err := rows.Scan(&email, &familyID); err != nil {
			return nil, err
		}
		if email != "" {
			identEmails[email] = familyID
		}
	}
	return identEmails, rows.Err()
}

func (s *Store) UpdateFamilyParents(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, parents []models.Parent) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		res, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", familyID)
		if err != nil {
			return err
		}
		if res.RowsAffected() > 0 {
			fam := models.Family{ID: familyID}
			if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "INSERT", nil, fam, userID); err != nil {
				return err
			}
		}
		for _, p := range parents {
			p.Emails = sanitizeSlice(p.Emails)
			p.Phones = sanitizeSlice(p.Phones)
			var oldParent models.Parent
			err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, emails, phones, address, notes, vaccination_status_protected FROM parents WHERE id = $1 AND family_id = $2", p.ID, familyID).Scan(
				&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Address, &oldParent.Notes, &oldParent.VaccinationStatusProtected,
			)
			isNew := (err == pgx.ErrNoRows)

			if p.VaccinationStatusProtected == nil && p.VaccinationChecks == nil && len(oldParent.VaccinationStatusProtected) > 0 {
				p.VaccinationStatusProtected = oldParent.VaccinationStatusProtected
			}

			res, err := tx.Exec(ctx,
				"UPDATE parents SET first_name = $1, last_name = $2, emails = $3, phones = $4, address = $5, notes = $6, vaccination_status_protected = $7, updated_at = NOW() WHERE id = $8 AND family_id = $9",
				p.FirstName, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected, p.ID, familyID)
			if err != nil {
				return err
			}

			if res.RowsAffected() == 0 || isNew {
				if p.ID == uuid.Nil {
					p.ID = uuid.New()
				}
				p.FamilyID = familyID
				_, err = tx.Exec(ctx,
					"INSERT INTO parents (id, family_id, first_name, last_name, emails, phones, address, notes, vaccination_status_protected) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
					p.ID, p.FamilyID, p.FirstName, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected)
				if err != nil {
					return err
				}
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "INSERT", nil, p, userID); err != nil {
					return err
				}
			} else {
				if parentNonVaccinationChanged(oldParent, p) {
					if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "UPDATE", oldParent, p, userID); err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
}

func (s *Store) UpdateChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID, child models.Child) error {
	transactionID := uuid.New()

	return s.WithTx(ctx, func(tx pgx.Tx) error {
		res, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", child.FamilyID)
		if err != nil {
			return err
		}
		if res.RowsAffected() > 0 {
			fam := models.Family{ID: child.FamilyID}
			if err := s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "family", child.FamilyID, "INSERT", nil, fam, userID); err != nil {
				return err
			}
		}

		var oldChild models.Child
		err = tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, birth_date, notes, vaccination_status_protected FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.LastName, &oldChild.BirthDate, &oldChild.Notes, &oldChild.VaccinationStatusProtected,
		)
		isNew := (err == pgx.ErrNoRows)

		if child.VaccinationStatusProtected == nil && child.VaccinationChecks == nil && len(oldChild.VaccinationStatusProtected) > 0 {
			child.VaccinationStatusProtected = oldChild.VaccinationStatusProtected
		}

		res, err = tx.Exec(ctx,
			"UPDATE children SET first_name = $1, last_name = $2, birth_date = $3, notes = $4, vaccination_status_protected = $5, updated_at = NOW() WHERE id = $6",
			child.FirstName, child.LastName, child.BirthDate, child.Notes, child.VaccinationStatusProtected, childID)
		if err != nil {
			return err
		}

		if res.RowsAffected() == 0 || isNew {
			if child.ID == uuid.Nil {
				child.ID = childID
			}
			_, err = tx.Exec(ctx,
				"INSERT INTO children (id, family_id, first_name, last_name, birth_date, notes, vaccination_status_protected) VALUES ($1, $2, $3, $4, $5, $6, $7)",
				child.ID, child.FamilyID, child.FirstName, child.LastName, child.BirthDate, child.Notes, child.VaccinationStatusProtected)
			if err != nil {
				return err
			}
			for _, gc := range child.GroupChanges {
				if gc.ID == uuid.Nil {
					gc.ID = uuid.New()
				}
				gc.Child = child.ID
				_, err = tx.Exec(ctx,
					"INSERT INTO children_group_changes (id, child, change_date, target_group) VALUES ($1, $2, $3, $4) ON CONFLICT (child, change_date) DO UPDATE SET target_group = EXCLUDED.target_group",
					gc.ID, gc.Child, gc.ChangeDate, gc.TargetGroup)
				if err != nil {
					return err
				}
				if err := s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child_group_change", gc.ID, "INSERT", nil, gc, userID); err != nil {
					return err
				}
			}
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", child.ID, "INSERT", nil, child, userID)
		} else {
			if childNonVaccinationChanged(oldChild, child) {
				return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", childID, "UPDATE", oldChild, child, userID)
			}
			return nil
		}
	})
}

func (s *Store) DeleteFamily(ctx context.Context, userID uuid.UUID, familyID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var family models.Family
		family.ID = familyID
		parents, _ := s.GetParentsByFamilyID(ctx, familyID)
		family.Parents = parents

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
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, birth_date, notes, vaccination_status_protected FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.LastName, &oldChild.BirthDate, &oldChild.Notes, &oldChild.VaccinationStatusProtected,
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
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, last_name, emails, phones, address, notes, vaccination_status_protected FROM parents WHERE id = $1", parentID).Scan(
			&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Address, &oldParent.Notes, &oldParent.VaccinationStatusProtected,
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

func (s *Store) UpdateHygieneEvent(ctx context.Context, userID uuid.UUID, eventID uuid.UUID, eventDate time.Time, eventType string, documentation string) (models.HygieneBelehrungEvent, error) {
	transactionID := uuid.New()
	var updated models.HygieneBelehrungEvent
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldEvent models.HygieneBelehrungEvent
		err := tx.QueryRow(ctx, "SELECT id, parent_id, event_date, event_type, documentation FROM hygiene_belehrung_events WHERE id = $1", eventID).
			Scan(&oldEvent.ID, &oldEvent.ParentID, &oldEvent.EventDate, &oldEvent.EventType, &oldEvent.Documentation)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", oldEvent.ParentID).Scan(&familyID)
		if err != nil {
			return err
		}

		updated = models.HygieneBelehrungEvent{
			ID:            oldEvent.ID,
			ParentID:      oldEvent.ParentID,
			EventDate:     eventDate,
			EventType:     eventType,
			Documentation: documentation,
		}

		_, err = tx.Exec(ctx,
			"UPDATE hygiene_belehrung_events SET event_date = $1, event_type = $2, documentation = $3 WHERE id = $4",
			eventDate, eventType, documentation, eventID)
		if err != nil {
			return err
		}

		if oldEvent.EventType != updated.EventType ||
			oldEvent.Documentation != updated.Documentation ||
			oldEvent.EventDate.Format("2006-01-02") != updated.EventDate.Format("2006-01-02") {
			return s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", eventID, "UPDATE", oldEvent, updated, userID)
		}
		return nil
	})

	if err != nil {
		return models.HygieneBelehrungEvent{}, err
	}
	return updated, nil
}

func (s *Store) CreateTHMembership(ctx context.Context, userID uuid.UUID, m models.THMembership) (models.THMembership, error) {
	if m.EndDate != nil && m.EndDate.Format("2006-01-02") <= m.StartDate.Format("2006-01-02") {
		return models.THMembership{}, fmt.Errorf("end date must be greater than start date")
	}

	transactionID := uuid.New()
	var created models.THMembership
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", m.ParentID).Scan(&familyID)
		if err != nil {
			return err
		}

		var hasOverlap bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM th_memberships
				WHERE parent_id = $1
				  AND ($2::date IS NULL OR end_date IS NULL OR end_date >= $2::date)
				  AND ($3::date IS NULL OR start_date <= $3::date)
			)
		`, m.ParentID, m.StartDate, m.EndDate).Scan(&hasOverlap)
		if err != nil {
			return err
		}
		if hasOverlap {
			return fmt.Errorf("membership time spans may not overlap")
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

func (s *Store) UpdateTHMembership(ctx context.Context, userID uuid.UUID, membershipID uuid.UUID, startDate time.Time, endDate *time.Time, membershipType string) (models.THMembership, error) {
	if endDate != nil && endDate.Format("2006-01-02") <= startDate.Format("2006-01-02") {
		return models.THMembership{}, fmt.Errorf("end date must be greater than start date")
	}

	transactionID := uuid.New()
	var updated models.THMembership
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var parentID uuid.UUID
		var oldStartDate time.Time
		var oldEndDate *time.Time
		var oldMembershipType string
		err := tx.QueryRow(ctx, "SELECT parent_id, start_date, end_date, membership_type FROM th_memberships WHERE id = $1", membershipID).Scan(&parentID, &oldStartDate, &oldEndDate, &oldMembershipType)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&familyID)
		if err != nil {
			return err
		}

		var hasOverlap bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM th_memberships
				WHERE parent_id = $1
				  AND id != $2
				  AND ($3::date IS NULL OR end_date IS NULL OR end_date >= $3::date)
				  AND ($4::date IS NULL OR start_date <= $4::date)
			)
		`, parentID, membershipID, startDate, endDate).Scan(&hasOverlap)
		if err != nil {
			return err
		}
		if hasOverlap {
			return fmt.Errorf("membership time spans may not overlap")
		}

		oldMembership := models.THMembership{
			ID:             membershipID,
			ParentID:       parentID,
			StartDate:      oldStartDate,
			EndDate:        oldEndDate,
			MembershipType: oldMembershipType,
		}

		err = tx.QueryRow(ctx, `
			UPDATE th_memberships
			SET start_date = $2, end_date = $3, membership_type = $4, updated_at = NOW()
			WHERE id = $1
			RETURNING id, parent_id, start_date, end_date, membership_type, created_at, updated_at
		`, membershipID, startDate, endDate, membershipType).Scan(
			&updated.ID, &updated.ParentID, &updated.StartDate, &updated.EndDate, &updated.MembershipType, &updated.CreatedAt, &updated.UpdatedAt,
		)
		if err != nil {
			return err
		}

		oldEndStr := ""
		if oldMembership.EndDate != nil {
			oldEndStr = oldMembership.EndDate.Format("2006-01-02")
		}
		newEndStr := ""
		if updated.EndDate != nil {
			newEndStr = updated.EndDate.Format("2006-01-02")
		}
		if oldMembership.MembershipType != updated.MembershipType ||
			oldMembership.StartDate.Format("2006-01-02") != updated.StartDate.Format("2006-01-02") ||
			oldEndStr != newEndStr {
			return s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", membershipID, "UPDATE", oldMembership, updated, userID)
		}
		return nil
	})
	return updated, err
}

func (s *Store) ListMembers(ctx context.Context) ([]models.MemberRow, error) {
	query := `
		SELECT 
			p.id, 
			p.family_id,
			COALESCE(p.first_name, ''), 
			COALESCE(p.last_name, ''),
			COALESCE((
				SELECT 'Familie ' || string_agg(p2.first_name || ' ' || p2.last_name, ' & ' ORDER BY p2.id)
				FROM parents p2 
				WHERE p2.family_id = p.family_id
			), 'Familie (ohne Eltern)'),
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', m.id,
					'parent_id', m.parent_id,
					'start_date', m.start_date::timestamptz,
					'end_date', m.end_date::timestamptz,
					'membership_type', m.membership_type,
					'created_at', m.created_at,
					'updated_at', m.updated_at
				) ORDER BY m.start_date ASC)
				FROM th_memberships m WHERE m.parent_id = p.id
			), '[]') as memberships
		FROM parents p
		WHERE EXISTS (
			SELECT 1 FROM th_memberships m2 
			WHERE m2.parent_id = p.id 
			  AND m2.start_date <= CURRENT_DATE 
			  AND (m2.end_date IS NULL OR m2.end_date >= CURRENT_DATE)
		)
		ORDER BY p.last_name ASC, p.first_name ASC
	`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	var members []models.MemberRow
	for rows.Next() {
		var r models.MemberRow
		var membershipsJSON []byte
		if err := rows.Scan(&r.ID, &r.FamilyID, &r.FirstName, &r.LastName, &r.FamilyName, &membershipsJSON); err != nil {
			return nil, err
		}

		if len(membershipsJSON) > 0 {
			_ = json.Unmarshal(membershipsJSON, &r.Memberships)
		}
		if r.Memberships == nil {
			r.Memberships = []models.THMembership{}
		}

		// Calculate current membership type, first became member date, and last type change date
		if len(r.Memberships) > 0 {
			var activeMembership *models.THMembership
			for i := range r.Memberships {
				m := &r.Memberships[i]
				mStart := time.Date(m.StartDate.Year(), m.StartDate.Month(), m.StartDate.Day(), 0, 0, 0, 0, time.UTC)
				var mEnd *time.Time
				if m.EndDate != nil {
					e := time.Date(m.EndDate.Year(), m.EndDate.Month(), m.EndDate.Day(), 23, 59, 59, 0, time.UTC)
					mEnd = &e
				}

				if !mStart.After(today) && (mEnd == nil || !mEnd.Before(today)) {
					activeMembership = m
				}
			}

			if activeMembership != nil {
				r.MembershipType = activeMembership.MembershipType
			} else {
				r.MembershipType = r.Memberships[len(r.Memberships)-1].MembershipType
			}

			r.FirstBecameMemberDate = r.Memberships[0].StartDate

			for i := 1; i < len(r.Memberships); i++ {
				if r.Memberships[i].MembershipType != r.Memberships[i-1].MembershipType {
					changeDate := r.Memberships[i].StartDate
					r.LastTypeChangeDate = &changeDate
				}
			}
		}

		members = append(members, r)
	}

	return members, rows.Err()
}

func (s *Store) CreateChildGroupChange(ctx context.Context, userID uuid.UUID, gc models.ChildGroupChange) (models.ChildGroupChange, error) {
	transactionID := uuid.New()
	var created models.ChildGroupChange
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM children WHERE id = $1", gc.Child).Scan(&familyID)
		if err != nil {
			return err
		}

		if gc.ID == uuid.Nil {
			gc.ID = uuid.New()
		}

		err = tx.QueryRow(ctx, `
			INSERT INTO children_group_changes (id, child, change_date, target_group)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (child, change_date) DO UPDATE SET target_group = EXCLUDED.target_group, updated_at = NOW()
			RETURNING id, child, change_date, target_group, created_at, updated_at
		`, gc.ID, gc.Child, gc.ChangeDate, gc.TargetGroup).Scan(
			&created.ID, &created.Child, &created.ChangeDate, &created.TargetGroup, &created.CreatedAt, &created.UpdatedAt,
		)
		if err != nil {
			return err
		}

		return s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", created.ID, "INSERT", nil, created, userID)
	})
	return created, err
}

func (s *Store) DeleteChildGroupChange(ctx context.Context, userID uuid.UUID, changeID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var childID uuid.UUID
		var changeDate time.Time
		var targetGroup int
		err := tx.QueryRow(ctx, "SELECT child, change_date, target_group FROM children_group_changes WHERE id = $1", changeID).Scan(&childID, &changeDate, &targetGroup)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM children WHERE id = $1", childID).Scan(&familyID)
		if err != nil {
			return err
		}

		oldChange := models.ChildGroupChange{
			ID:          changeID,
			Child:       childID,
			ChangeDate:  changeDate,
			TargetGroup: targetGroup,
		}

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", changeID, "DELETE", oldChange, nil, userID); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM children_group_changes WHERE id = $1", changeID)
		return err
	})
}

func (s *Store) UpdateChildGroupChange(ctx context.Context, userID uuid.UUID, changeID uuid.UUID, changeDate time.Time, targetGroup int) (models.ChildGroupChange, error) {
	transactionID := uuid.New()
	var updated models.ChildGroupChange
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var childID uuid.UUID
		var oldDate time.Time
		var oldTargetGroup int
		err := tx.QueryRow(ctx, "SELECT child, change_date, target_group FROM children_group_changes WHERE id = $1", changeID).Scan(&childID, &oldDate, &oldTargetGroup)
		if err != nil {
			return err
		}

		var familyID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT family_id FROM children WHERE id = $1", childID).Scan(&familyID)
		if err != nil {
			return err
		}

		oldChange := models.ChildGroupChange{
			ID:          changeID,
			Child:       childID,
			ChangeDate:  oldDate,
			TargetGroup: oldTargetGroup,
		}

		err = tx.QueryRow(ctx, `
			UPDATE children_group_changes
			SET change_date = $2, target_group = $3, updated_at = NOW()
			WHERE id = $1
			RETURNING id, child, change_date, target_group, created_at, updated_at
		`, changeID, changeDate, targetGroup).Scan(
			&updated.ID, &updated.Child, &updated.ChangeDate, &updated.TargetGroup, &updated.CreatedAt, &updated.UpdatedAt,
		)
		if err != nil {
			return err
		}

		if oldChange.TargetGroup != updated.TargetGroup || oldChange.ChangeDate.Format("2006-01-02") != updated.ChangeDate.Format("2006-01-02") {
			return s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", changeID, "UPDATE", oldChange, updated, userID)
		}
		return nil
	})
	return updated, err
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

func (s *Store) ListAuditLogsForUser(ctx context.Context, user *models.UserWithPermissions) ([]models.AuditLog, error) {
	if user == nil {
		return []models.AuditLog{}, nil
	}

	var rows pgx.Rows
	var err error

	// If the user does not have global access and is scoped to a specific family
	if !user.HasPermission("*") && !user.HasPermission("families.all.read") && user.FamilyID != nil {
		rows, err = s.db.Query(ctx, `
			SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(u.email, ''), a.created_at
			FROM audit_log a
			LEFT JOIN users u ON a.changed_by = u.id
			WHERE a.family_id = $1
			ORDER BY a.created_at DESC
		`, *user.FamilyID)
	} else {
		rows, err = s.db.Query(ctx, `
			SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(u.email, ''), a.created_at
			FROM audit_log a
			LEFT JOIN users u ON a.changed_by = u.id
			ORDER BY a.created_at DESC
		`)
	}
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

	return audit.FilterAuditLogsForUser(user, logs), nil
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

func (s *Store) GetRole(ctx context.Context, id string) (*models.Role, error) {
	var r models.Role
	var permsJSON []byte
	err := s.db.QueryRow(ctx, "SELECT id, name, description, permissions, created_at, updated_at FROM roles WHERE id = $1", id).
		Scan(&r.ID, &r.Name, &r.Description, &permsJSON, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if len(permsJSON) > 0 {
		_ = json.Unmarshal(permsJSON, &r.Permissions)
	}
	if r.Permissions == nil {
		r.Permissions = []string{}
	}
	return &r, nil
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
	email = models.NormalizeEmail(email)
	query := `
		SELECT 
			u.id, 
			u.email, 
			u.permissions,
			u.last_login,
			u.created_at,
			u.updated_at,
			COALESCE(array_agg(r.id) FILTER (WHERE r.id IS NOT NULL), '{}') as roles,
			COALESCE(jsonb_agg(r.permissions) FILTER (WHERE r.permissions IS NOT NULL), '[]'::jsonb) as role_permissions,
			COALESCE(jsonb_agg(r.deny_permissions) FILTER (WHERE r.deny_permissions IS NOT NULL), '[]'::jsonb) as role_deny_permissions
		FROM users u
		LEFT JOIN user_roles ur ON u.id = ur.user_id
		LEFT JOIN roles r ON ur.role_id = r.id
		WHERE u.email = $1
		GROUP BY u.id, u.email, u.permissions, u.last_login, u.created_at, u.updated_at
	`

	var u models.UserWithPermissions
	var userPermissionsJSON, rolePermissionsJSON, roleDenyPermissionsJSON []byte

	err := s.db.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.Email, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON, &roleDenyPermissionsJSON,
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

	var roleDenyPermsList [][]string
	if len(roleDenyPermissionsJSON) > 0 {
		_ = json.Unmarshal(roleDenyPermissionsJSON, &roleDenyPermsList)
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
	for _, rDeny := range roleDenyPermsList {
		for _, p := range rDeny {
			delete(permMap, p)
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
			COALESCE(jsonb_agg(r.permissions) FILTER (WHERE r.permissions IS NOT NULL), '[]'::jsonb) as role_permissions,
			COALESCE(jsonb_agg(r.deny_permissions) FILTER (WHERE r.deny_permissions IS NOT NULL), '[]'::jsonb) as role_deny_permissions
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
		var userPermissionsJSON, rolePermissionsJSON, roleDenyPermissionsJSON []byte

		err := rows.Scan(&u.ID, &u.Email, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON, &roleDenyPermissionsJSON)
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

		var roleDenyPermsList [][]string
		if len(roleDenyPermissionsJSON) > 0 {
			_ = json.Unmarshal(roleDenyPermissionsJSON, &roleDenyPermsList)
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
		for _, rDeny := range roleDenyPermsList {
			for _, p := range rDeny {
				delete(permMap, p)
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
	email = models.NormalizeEmail(email)
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

func (s *Store) GetDailyBrief(ctx context.Context, targetDate time.Time) (*models.DailyBriefResponse, error) {
	dateStr := targetDate.Format("2006-01-02")
	nextDateStr := targetDate.AddDate(0, 0, 1).Format("2006-01-02")

	resp := &models.DailyBriefResponse{
		Date:           dateStr,
		WhoIsCooking:   "",
		MealComponents: []string{},
		TasksAndInfo:   []string{},
	}

	// 1. Fetch meal plan from meal_plan_from_sheets
	var cookName, comp1, comp2, comp3 string
	err := s.db.QueryRow(ctx, `
		SELECT cook_name, food_component_1, food_component_2, food_component_3
		FROM meal_plan_from_sheets
		WHERE date = $1
	`, dateStr).Scan(&cookName, &comp1, &comp2, &comp3)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("failed to query meal_plan_from_sheets: %w", err)
	}

	if err == nil {
		resp.WhoIsCooking = strings.TrimSpace(cookName)
		for _, comp := range []string{comp1, comp2, comp3} {
			trimmed := strings.TrimSpace(comp)
			if trimmed != "" {
				resp.MealComponents = append(resp.MealComponents, trimmed)
			}
		}
	}

	// 2. If the date that is being checked is present in the "yellow_bag_days" table:
	// add "yellow_bin_retrieve" to tasks_and_info ("Gelbe Tonne reinholen")
	var yellowBagToday bool
	err = s.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM yellow_bag_days WHERE date = $1)
	`, dateStr).Scan(&yellowBagToday)
	if err != nil {
		return nil, fmt.Errorf("failed to check yellow_bag_days for date %s: %w", dateStr, err)
	}
	if yellowBagToday {
		resp.TasksAndInfo = append(resp.TasksAndInfo, "yellow_bin_retrieve")
	}

	// 3. If the date + 1 day is present in the "yellow_bag_days" table:
	// add "yellow_bin_put_out" to tasks_and_info ("Gelbe Tonne rausstellen")
	var yellowBagTomorrow bool
	err = s.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM yellow_bag_days WHERE date = $1)
	`, nextDateStr).Scan(&yellowBagTomorrow)
	if err != nil {
		return nil, fmt.Errorf("failed to check yellow_bag_days for date %s: %w", nextDateStr, err)
	}
	if yellowBagTomorrow {
		resp.TasksAndInfo = append(resp.TasksAndInfo, "yellow_bin_put_out")
	}

	// 4. If the date is a friday:
	// add "clean_coffe_machine" ("Kaffeemaschine reinigen") and "clean_refrigerator" ("Kühlschrank reinigen")
	if targetDate.Weekday() == time.Friday {
		resp.TasksAndInfo = append(resp.TasksAndInfo, "clean_coffe_machine", "clean_refrigerator")
	}

	return resp, nil
}

func (s *Store) ResetTestData(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		TRUNCATE TABLE 
			th_memberships, 
			hygiene_belehrung_events, 
			children_group_changes, 
			children, 
			parents, 
			families, 
			audit_log 
		CASCADE;
		DELETE FROM users WHERE email NOT IN ('developer@example.com', 'caregiver@example.com');
	`)
	return err
}

