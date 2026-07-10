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
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "family", family.ID, "INSERT", family, userID); err != nil {
			return err
		}
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "parent", parent.ID, "INSERT", parent, userID); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return family, nil
}

func (s *Store) recordAudit(ctx context.Context, tx pgx.Tx, tid uuid.UUID, fid *uuid.UUID, etype string, eid uuid.UUID, op string, snapshot interface{}, userID uuid.UUID) error {
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO audit_log (transaction_id, family_id, entity_type, entity_id, operation, snapshot, changed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)",
		tid, fid, etype, eid, op, payload, userID)
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
	rows, err := s.db.Query(ctx, "SELECT id, transaction_id, family_id, entity_type, entity_id, operation, snapshot, changed_by, created_at FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC", entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		if err := rows.Scan(&l.ID, &l.TransactionID, &l.FamilyID, &l.EntityType, &l.EntityID, &l.Operation, &l.Snapshot, &l.ChangedBy, &l.CreatedAt); err != nil {
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
			res, err := tx.Exec(ctx,
				"UPDATE parents SET first_name = $1, last_name = $2, emails = $3, phones = $4, notes = $5, updated_at = NOW() WHERE id = $6 AND family_id = $7",
				p.FirstName, p.LastName, p.Emails, p.Phones, p.Notes, p.ID, familyID)
			if err != nil {
				return err
			}

			if res.RowsAffected() == 0 {
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
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "INSERT", p, userID); err != nil {
					return err
				}
			} else {
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "UPDATE", p, userID); err != nil {
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
		res, err := tx.Exec(ctx,
			"UPDATE children SET first_name = $1, last_name = $2, birth_date = $3, start_date = $4, exit_date = $5, start_group = $6, hort_start_date = $7, group2_start_date = $8, notes = $9, updated_at = NOW() WHERE id = $10",
			child.FirstName, child.LastName, child.BirthDate, child.StartDate, child.ExitDate, child.StartGroup, child.HortStartDate, child.Group2StartDate, child.Notes, childID)
		if err != nil {
			return err
		}

		if res.RowsAffected() == 0 {
			if child.ID == uuid.Nil {
				child.ID = childID
			}
			_, err = tx.Exec(ctx,
				"INSERT INTO children (id, family_id, first_name, last_name, birth_date, start_date, exit_date, start_group, hort_start_date, group2_start_date, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
				child.ID, child.FamilyID, child.FirstName, child.LastName, child.BirthDate, child.StartDate, child.ExitDate, child.StartGroup, child.HortStartDate, child.Group2StartDate, child.Notes)
			if err != nil {
				return err
			}
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", child.ID, "INSERT", child, userID)
		} else {
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", childID, "UPDATE", child, userID)
		}
	})
}

func (s *Store) DeleteFamily(ctx context.Context, userID uuid.UUID, familyID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "DELETE", nil, userID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
		return err
	})
}

func (s *Store) DeleteChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM children WHERE id = $1", childID).Scan(&familyID)
		if err != nil {
			return err
		}
		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "child", childID, "DELETE", nil, userID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "DELETE FROM children WHERE id = $1", childID)
		if err != nil {
			return err
		}

		// Cleanup empty family
		var parentCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM parents WHERE family_id = $1", familyID).Scan(&parentCount)
		if err != nil {
			return err
		}
		var childCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM children WHERE family_id = $1", familyID).Scan(&childCount)
		if err != nil {
			return err
		}
		if parentCount == 0 && childCount == 0 {
			if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "DELETE", nil, userID); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
			return err
		}
		return nil
	})
}

func (s *Store) DeleteParent(ctx context.Context, userID uuid.UUID, parentID uuid.UUID) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&familyID)
		if err != nil {
			return err
		}
		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", parentID, "DELETE", nil, userID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "DELETE FROM parents WHERE id = $1", parentID)
		if err != nil {
			return err
		}

		// Cleanup empty family
		var parentCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM parents WHERE family_id = $1", familyID).Scan(&parentCount)
		if err != nil {
			return err
		}
		var childCount int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM children WHERE family_id = $1", familyID).Scan(&childCount)
		if err != nil {
			return err
		}
		if parentCount == 0 && childCount == 0 {
			if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "DELETE", nil, userID); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
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

		return s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", event.ID, "INSERT", event, userID)
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

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", eventID, "DELETE", oldEvent, userID); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM hygiene_belehrung_events WHERE id = $1", eventID)
		return err
	})
}
