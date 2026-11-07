package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/audit"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
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
	for i := range s {
		s[i].Value = strings.TrimSpace(s[i].Value)
		if s[i].Value != "" {
			s[i].CanonicalValue = models.CanonicalEmail(s[i].Value)
		}
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

func (s *Store) CreateFamilyWithParents(ctx context.Context, userID uuid.UUID, parents []models.Parent, userEmail ...string) (*models.Family, error) {
	family := &models.Family{
		ID:         uuid.New(),
		Parents:    parents,
		FamilyName: models.FormatFamilyName(parents),
	}
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
			p.Phones = sanitizePhones(p.Phones)

			_, err = tx.Exec(ctx,
				"INSERT INTO parents (id, family_id, first_name, first_name_for_address_list, last_name, emails, phones, address, notes, vaccination_status_protected) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
				p.ID, p.FamilyID, p.FirstName, p.FirstNameForAddressList, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected)
			if err != nil {
				return err
			}

			if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "parent", p.ID, "INSERT", nil, p, userID, userEmail...); err != nil {
				return err
			}
			createdParents = append(createdParents, p)
		}

		family.Parents = createdParents
		if err := s.recordAudit(ctx, tx, transactionID, &family.ID, "family", family.ID, "INSERT", nil, family, userID, userEmail...); err != nil {
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

func sanitizePhones(slice models.MultiValueList) models.MultiValueList {
	if slice == nil {
		return models.MultiValueList{}
	}
	for i := range slice {
		if slice[i].Type == "" {
			slice[i].Type = "mobile"
		}
	}
	return slice
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
		if a[i].Type != b[i].Type {
			return false
		}
	}
	return true
}

func parentNonVaccinationChanged(old, new models.Parent) bool {
	return old.FirstName != new.FirstName ||
		old.FirstNameForAddressList != new.FirstNameForAddressList ||
		old.LastName != new.LastName ||
		old.Address != new.Address ||
		old.Notes != new.Notes ||
		!multiValueListEqual(old.Emails, new.Emails) ||
		!multiValueListEqual(old.Phones, new.Phones)
}

func childNonVaccinationChanged(old, new models.Child) bool {
	return old.FirstName != new.FirstName ||
		old.FirstNameForAddressList != new.FirstNameForAddressList ||
		old.LastName != new.LastName ||
		old.BirthDate.Format("2006-01-02") != new.BirthDate.Format("2006-01-02") ||
		old.Notes != new.Notes ||
		!familiencardListEqual(old.Familiencards, new.Familiencards)
}

func familiencardListEqual(a, b models.FamiliencardList) bool {
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
		e.Allergies = nil
		e.AllergiesProtected = nil
		return e
	case *models.Child:
		if e == nil {
			return nil
		}
		cp := *e
		cp.VaccinationChecks = nil
		cp.VaccinationStatusProtected = nil
		cp.Allergies = nil
		cp.AllergiesProtected = nil
		return cp
	case models.Employee:
		e.Allergies = nil
		e.AllergiesProtected = nil
		return e
	case *models.Employee:
		if e == nil {
			return nil
		}
		cp := *e
		cp.Allergies = nil
		cp.AllergiesProtected = nil
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
				cp.Children[i].Allergies = nil
				cp.Children[i].AllergiesProtected = nil
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
				cp.Children[i].Allergies = nil
				cp.Children[i].AllergiesProtected = nil
			}
		}
		return cp
	default:
		return v
	}
}

func (s *Store) recordAudit(ctx context.Context, tx pgx.Tx, tid uuid.UUID, fid *uuid.UUID, etype string, eid uuid.UUID, op string, before interface{}, after interface{}, userID uuid.UUID, userEmail ...string) error {
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

	var changedBy *uuid.UUID
	if userID != uuid.Nil {
		changedBy = &userID
	}

	var changedByEmail string
	if len(userEmail) > 0 {
		changedByEmail = strings.TrimSpace(userEmail[0])
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO audit_log (transaction_id, family_id, entity_type, entity_id, operation, before_snapshot, after_snapshot, changed_by, changed_by_email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
		tid, fid, etype, eid, op, beforePayload, afterPayload, changedBy, changedByEmail)
	return err
}

func (s *Store) ListFamilies(ctx context.Context) ([]models.Family, error) {
	rows, err := s.db.Query(ctx, `
		SELECT f.id, f.created_at, f.mentor_family_id, f.mentor_parent_ids, f.notes,
			   COALESCE((
				   SELECT json_agg(json_build_object(
					   'id', p.id,
					   'family_id', p.family_id,
					   'first_name', p.first_name,
					   'first_name_for_address_list', p.first_name_for_address_list,
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
					   'jobs', COALESCE((
						   SELECT json_agg(json_build_object(
							   'id', j.id,
							   'name', j.name,
							   'description', j.description,
							   'contact_email', j.contact_email,
							   'soll_persons', j.soll_persons,
							   'created_at', j.created_at,
							   'updated_at', j.updated_at
						   ) ORDER BY j.name ASC)
						   FROM parent_jobs pj
						   JOIN jobs j ON j.id = pj.job_id
						   WHERE pj.parent_id = p.id
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
					   'first_name_for_address_list', c.first_name_for_address_list,
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
					   'allergies_protected', encode(c.allergies_protected, 'base64'),
					   'familiencards', c.familiencards,
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
		var parentsJSON, childrenJSON, mentorParentIDsJSON []byte
		if err := rows.Scan(&f.ID, &f.CreatedAt, &f.MentorFamilyID, &mentorParentIDsJSON, &f.Notes, &parentsJSON, &childrenJSON); err != nil {
			return nil, err
		}
		if len(mentorParentIDsJSON) > 0 {
			_ = json.Unmarshal(mentorParentIDsJSON, &f.MentorParentIDs)
		}
		if f.MentorParentIDs == nil {
			f.MentorParentIDs = []uuid.UUID{}
		}
		if err := json.Unmarshal(parentsJSON, &f.Parents); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(childrenJSON, &f.Children); err != nil {
			return nil, err
		}
		for cIdx := range f.Children {
			f.Children[cIdx].PopulateComputedFields()
		}
		f.FamilyName = f.GetFamilyName()
		families = append(families, f)
	}

	return families, nil
}

func (s *Store) GetHistory(ctx context.Context, entityID uuid.UUID) ([]models.AuditLog, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(NULLIF(a.changed_by_email, ''), u.email, ''), a.created_at
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
		"SELECT id, family_id, first_name, first_name_for_address_list, last_name, emails, phones, address, notes, vaccination_status_protected, created_at, updated_at FROM parents WHERE family_id = $1",
		familyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var parents []models.Parent
	for rows.Next() {
		var p models.Parent
		if err := rows.Scan(&p.ID, &p.FamilyID, &p.FirstName, &p.FirstNameForAddressList, &p.LastName, &p.Emails, &p.Phones, &p.Address, &p.Notes, &p.VaccinationStatusProtected, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Phones = sanitizePhones(p.Phones)
		parents = append(parents, p)
	}
	return parents, rows.Err()
}

func (s *Store) GetFamilyIDByIdentifierEmail(ctx context.Context, email string) (*uuid.UUID, error) {
	norm := models.CanonicalEmail(email)
	if norm == "" {
		return nil, nil
	}
	query := `
		SELECT p.family_id
		FROM parents p, jsonb_array_elements(p.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
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
		SELECT lower(trim(COALESCE(
		    NULLIF(elem->>'canonical_value', ''),
		    CASE
		        WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		            replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		        ELSE
		            lower(trim(elem->>'value'))
		    END
		))) AS email, p.family_id
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

func (s *Store) GetEmployeeTypesByIdentifierEmail(ctx context.Context, email string) ([]string, error) {
	norm := models.CanonicalEmail(email)
	if norm == "" {
		return nil, nil
	}
	query := `
		SELECT DISTINCT e.employee_type
		FROM employees e, jsonb_array_elements(e.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
	`
	rows, err := s.db.Query(ctx, query, norm)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		if t != "" {
			types = append(types, t)
		}
	}
	return types, rows.Err()
}

func (s *Store) GetParentInfoByIdentifierEmail(ctx context.Context, email string) (*uuid.UUID, *uuid.UUID, error) {
	norm := models.CanonicalEmail(email)
	if norm == "" {
		return nil, nil, nil
	}
	query := `
		SELECT p.id, p.family_id
		FROM parents p, jsonb_array_elements(p.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
		LIMIT 1
	`
	var parentID, familyID uuid.UUID
	err := s.db.QueryRow(ctx, query, norm).Scan(&parentID, &familyID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return &parentID, &familyID, nil
}

func (s *Store) GetEmployeeInfoByIdentifierEmail(ctx context.Context, email string) (*uuid.UUID, []string, error) {
	norm := models.CanonicalEmail(email)
	if norm == "" {
		return nil, nil, nil
	}
	query := `
		SELECT e.id, e.employee_type
		FROM employees e, jsonb_array_elements(e.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
	`
	rows, err := s.db.Query(ctx, query, norm)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var employeeID *uuid.UUID
	typeMap := make(map[string]bool)
	for rows.Next() {
		var id uuid.UUID
		var t string
		if err := rows.Scan(&id, &t); err != nil {
			return nil, nil, err
		}
		if employeeID == nil {
			employeeID = &id
		}
		if t != "" {
			typeMap[t] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	types := make([]string, 0, len(typeMap))
	for t := range typeMap {
		types = append(types, t)
	}
	return employeeID, types, nil
}

func (s *Store) GetFirstNameByIdentifierEmail(ctx context.Context, email string) (string, error) {
	norm := models.CanonicalEmail(email)
	if norm == "" {
		return "", nil
	}
	parentQuery := `
		SELECT p.first_name
		FROM parents p, jsonb_array_elements(p.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
		LIMIT 1
	`
	var firstName string
	err := s.db.QueryRow(ctx, parentQuery, norm).Scan(&firstName)
	if err == nil && firstName != "" {
		return firstName, nil
	}
	if err != nil && err != pgx.ErrNoRows {
		return "", err
	}

	empQuery := `
		SELECT e.first_name
		FROM employees e, jsonb_array_elements(e.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND COALESCE(
		      NULLIF(elem->>'canonical_value', ''),
		      CASE
		          WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		              replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		          ELSE
		              lower(trim(elem->>'value'))
		      END
		  ) = $1
		LIMIT 1
	`
	err = s.db.QueryRow(ctx, empQuery, norm).Scan(&firstName)
	if err == nil && firstName != "" {
		return firstName, nil
	}
	if err != nil && err != pgx.ErrNoRows {
		return "", err
	}

	return "", nil
}

func (s *Store) GetJobRolesForParent(ctx context.Context, parentID uuid.UUID) ([]string, error) {
	query := `
		SELECT DISTINCT jsonb_array_elements_text(j.roles)
		FROM jobs j
		JOIN parent_jobs pj ON pj.job_id = j.id
		WHERE pj.parent_id = $1
		  AND j.roles IS NOT NULL
		  AND jsonb_typeof(j.roles) = 'array'
	`
	rows, err := s.db.Query(ctx, query, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var r string
		if err := rows.Scan(&r); err != nil {
			return nil, err
		}
		if r != "" {
			roles = append(roles, r)
		}
	}
	return roles, rows.Err()
}

func (s *Store) GetJobRolesForEmployee(ctx context.Context, employeeID uuid.UUID) ([]string, error) {
	query := `
		SELECT DISTINCT jsonb_array_elements_text(j.roles)
		FROM jobs j
		JOIN employee_jobs ej ON ej.job_id = j.id
		WHERE ej.employee_id = $1
		  AND j.roles IS NOT NULL
		  AND jsonb_typeof(j.roles) = 'array'
	`
	rows, err := s.db.Query(ctx, query, employeeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var r string
		if err := rows.Scan(&r); err != nil {
			return nil, err
		}
		if r != "" {
			roles = append(roles, r)
		}
	}
	return roles, rows.Err()
}

func (s *Store) ListEmployeeIdentifyingEmails(ctx context.Context) (map[string][]string, error) {
	query := `
		SELECT lower(trim(COALESCE(
		    NULLIF(elem->>'canonical_value', ''),
		    CASE
		        WHEN lower(elem->>'value') ~ '@(gmail|googlemail)\.com$' THEN
		            replace(split_part(lower(trim(elem->>'value')), '@', 1), '.', '') || '@gmail.com'
		        ELSE
		            lower(trim(elem->>'value'))
		    END
		))) AS email, e.employee_type
		FROM employees e, jsonb_array_elements(e.emails) AS elem
		WHERE elem->>'identifier_email' = 'true'
		  AND lower(trim(elem->>'value')) <> ''
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	identEmails := make(map[string][]string)
	for rows.Next() {
		var email, empType string
		if err := rows.Scan(&email, &empType); err != nil {
			return nil, err
		}
		if email != "" && empType != "" {
			already := false
			for _, t := range identEmails[email] {
				if t == empType {
					already = true
					break
				}
			}
			if !already {
				identEmails[email] = append(identEmails[email], empType)
			}
		}
	}
	return identEmails, rows.Err()
}

func (s *Store) UpdateFamilyParents(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, parents []models.Parent, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		res, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", familyID)
		if err != nil {
			return err
		}
		if res.RowsAffected() > 0 {
			fam := models.Family{ID: familyID}
			if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "INSERT", nil, fam, userID, userEmail...); err != nil {
				return err
			}
		}
		for _, p := range parents {
			p.Emails = sanitizeSlice(p.Emails)
			p.Phones = sanitizePhones(p.Phones)
			var oldParent models.Parent
			err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, first_name_for_address_list, last_name, emails, phones, address, notes, vaccination_status_protected FROM parents WHERE id = $1 AND family_id = $2", p.ID, familyID).Scan(
				&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.FirstNameForAddressList, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Address, &oldParent.Notes, &oldParent.VaccinationStatusProtected,
			)
			isNew := (err == pgx.ErrNoRows)

			if p.VaccinationStatusProtected == nil && p.VaccinationChecks == nil && len(oldParent.VaccinationStatusProtected) > 0 {
				p.VaccinationStatusProtected = oldParent.VaccinationStatusProtected
			}

			res, err := tx.Exec(ctx,
				"UPDATE parents SET first_name = $1, first_name_for_address_list = $2, last_name = $3, emails = $4, phones = $5, address = $6, notes = $7, vaccination_status_protected = $8, updated_at = NOW() WHERE id = $9 AND family_id = $10",
				p.FirstName, p.FirstNameForAddressList, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected, p.ID, familyID)
			if err != nil {
				return err
			}

			if res.RowsAffected() == 0 || isNew {
				if p.ID == uuid.Nil {
					p.ID = uuid.New()
				}
				p.FamilyID = familyID
				_, err = tx.Exec(ctx,
					"INSERT INTO parents (id, family_id, first_name, first_name_for_address_list, last_name, emails, phones, address, notes, vaccination_status_protected) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
					p.ID, p.FamilyID, p.FirstName, p.FirstNameForAddressList, p.LastName, p.Emails, p.Phones, p.Address, p.Notes, p.VaccinationStatusProtected)
				if err != nil {
					return err
				}
				if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "INSERT", nil, p, userID, userEmail...); err != nil {
					return err
				}
			} else {
				if parentNonVaccinationChanged(oldParent, p) {
					if err := s.recordAudit(ctx, tx, transactionID, &familyID, "parent", p.ID, "UPDATE", oldParent, p, userID, userEmail...); err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
}

func (s *Store) GetChildByID(ctx context.Context, childID uuid.UUID) (*models.Child, error) {
	var c models.Child
	err := s.db.QueryRow(ctx, `
		SELECT id, family_id, first_name, first_name_for_address_list, last_name, birth_date, notes, vaccination_status_protected, allergies_protected, familiencards, created_at, updated_at
		FROM children
		WHERE id = $1
	`, childID).Scan(
		&c.ID, &c.FamilyID, &c.FirstName, &c.FirstNameForAddressList, &c.LastName, &c.BirthDate, &c.Notes, &c.VaccinationStatusProtected, &c.AllergiesProtected, &c.Familiencards, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.PopulateComputedFields()
	return &c, nil
}

func (s *Store) UpdateChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID, child models.Child, userEmail ...string) error {
	transactionID := uuid.New()

	return s.WithTx(ctx, func(tx pgx.Tx) error {
		res, err := tx.Exec(ctx, "INSERT INTO families (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", child.FamilyID)
		if err != nil {
			return err
		}
		if res.RowsAffected() > 0 {
			fam := models.Family{ID: child.FamilyID}
			if err := s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "family", child.FamilyID, "INSERT", nil, fam, userID, userEmail...); err != nil {
				return err
			}
		}

		var oldChild models.Child
		err = tx.QueryRow(ctx, "SELECT id, family_id, first_name, first_name_for_address_list, last_name, birth_date, notes, vaccination_status_protected, allergies_protected, familiencards FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.FirstNameForAddressList, &oldChild.LastName, &oldChild.BirthDate, &oldChild.Notes, &oldChild.VaccinationStatusProtected, &oldChild.AllergiesProtected, &oldChild.Familiencards,
		)
		isNew := (err == pgx.ErrNoRows)

		if child.VaccinationStatusProtected == nil && child.VaccinationChecks == nil && len(oldChild.VaccinationStatusProtected) > 0 {
			child.VaccinationStatusProtected = oldChild.VaccinationStatusProtected
		}
		if child.ClearAllergies {
			child.AllergiesProtected = nil
		} else if child.AllergiesProtected == nil && len(oldChild.AllergiesProtected) > 0 {
			child.AllergiesProtected = oldChild.AllergiesProtected
		}
		if child.Familiencards == nil && oldChild.Familiencards != nil {
			child.Familiencards = oldChild.Familiencards
		}

		res, err = tx.Exec(ctx,
			"UPDATE children SET first_name = $1, first_name_for_address_list = $2, last_name = $3, birth_date = $4, notes = $5, vaccination_status_protected = $6, allergies_protected = $7, familiencards = $8, updated_at = NOW() WHERE id = $9",
			child.FirstName, child.FirstNameForAddressList, child.LastName, child.BirthDate, child.Notes, child.VaccinationStatusProtected, child.AllergiesProtected, child.Familiencards, childID)
		if err != nil {
			return err
		}

		if res.RowsAffected() == 0 || isNew {
			if child.ID == uuid.Nil {
				child.ID = childID
			}
			_, err = tx.Exec(ctx,
				"INSERT INTO children (id, family_id, first_name, first_name_for_address_list, last_name, birth_date, notes, vaccination_status_protected, allergies_protected, familiencards) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
				child.ID, child.FamilyID, child.FirstName, child.FirstNameForAddressList, child.LastName, child.BirthDate, child.Notes, child.VaccinationStatusProtected, child.AllergiesProtected, child.Familiencards)
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
				if err := s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child_group_change", gc.ID, "INSERT", nil, gc, userID, userEmail...); err != nil {
					return err
				}
			}
			return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", child.ID, "INSERT", nil, child, userID, userEmail...)
		} else {
			if childNonVaccinationChanged(oldChild, child) || child.AllergiesUpdated {
				return s.recordAudit(ctx, tx, transactionID, &child.FamilyID, "child", childID, "UPDATE", oldChild, child, userID, userEmail...)
			}
			return nil
		}
	})
}

func (s *Store) DeleteFamily(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var family models.Family
		family.ID = familyID
		parents, _ := s.GetParentsByFamilyID(ctx, familyID)
		family.Parents = parents

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "DELETE", family, nil, userID, userEmail...); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
		return err
	})
}

func (s *Store) UpdateFamilyMentor(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, mentorFamilyID *uuid.UUID, mentorParentIDs []uuid.UUID, userEmail ...string) error {
	if mentorFamilyID != nil && *mentorFamilyID == familyID {
		return fmt.Errorf("family cannot be its own mentor")
	}

	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldFamily models.Family
		var oldMentorFamilyID *uuid.UUID
		var oldMentorParentIDsJSON []byte
		err := tx.QueryRow(ctx, "SELECT id, created_at, mentor_family_id, mentor_parent_ids, notes FROM families WHERE id = $1", familyID).
			Scan(&oldFamily.ID, &oldFamily.CreatedAt, &oldMentorFamilyID, &oldMentorParentIDsJSON, &oldFamily.Notes)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("family not found")
			}
			return err
		}
		oldFamily.MentorFamilyID = oldMentorFamilyID
		if len(oldMentorParentIDsJSON) > 0 {
			_ = json.Unmarshal(oldMentorParentIDsJSON, &oldFamily.MentorParentIDs)
		}
		if oldFamily.MentorParentIDs == nil {
			oldFamily.MentorParentIDs = []uuid.UUID{}
		}

		if mentorFamilyID != nil {
			var mentorExists bool
			err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM families WHERE id = $1)", *mentorFamilyID).Scan(&mentorExists)
			if err != nil {
				return err
			}
			if !mentorExists {
				return fmt.Errorf("mentor family not found")
			}

			if len(mentorParentIDs) > 0 {
				rows, err := tx.Query(ctx, "SELECT id FROM parents WHERE family_id = $1", *mentorFamilyID)
				if err != nil {
					return err
				}
				defer rows.Close()
				validParents := make(map[uuid.UUID]bool)
				for rows.Next() {
					var pid uuid.UUID
					if err := rows.Scan(&pid); err != nil {
						return err
					}
					validParents[pid] = true
				}
				for _, pid := range mentorParentIDs {
					if !validParents[pid] {
						return fmt.Errorf("parent %s does not belong to mentor family %s", pid, *mentorFamilyID)
					}
				}
			}
		} else {
			mentorParentIDs = []uuid.UUID{}
		}

		if mentorParentIDs == nil {
			mentorParentIDs = []uuid.UUID{}
		}
		mentorParentIDsBytes, err := json.Marshal(mentorParentIDs)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx,
			"UPDATE families SET mentor_family_id = $1, mentor_parent_ids = $2 WHERE id = $3",
			mentorFamilyID, mentorParentIDsBytes, familyID)
		if err != nil {
			return err
		}

		newFamily := oldFamily
		newFamily.MentorFamilyID = mentorFamilyID
		newFamily.MentorParentIDs = mentorParentIDs

		transactionID := uuid.New()
		return s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "UPDATE", oldFamily, newFamily, userID, userEmail...)
	})
}

func (s *Store) UpdateFamilyNotes(ctx context.Context, userID uuid.UUID, familyID uuid.UUID, notes string, userEmail ...string) error {
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldFamily models.Family
		var oldMentorFamilyID *uuid.UUID
		var oldMentorParentIDsJSON []byte
		err := tx.QueryRow(ctx, "SELECT id, created_at, mentor_family_id, mentor_parent_ids, notes FROM families WHERE id = $1", familyID).
			Scan(&oldFamily.ID, &oldFamily.CreatedAt, &oldMentorFamilyID, &oldMentorParentIDsJSON, &oldFamily.Notes)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("family not found")
			}
			return err
		}
		oldFamily.MentorFamilyID = oldMentorFamilyID
		if len(oldMentorParentIDsJSON) > 0 {
			_ = json.Unmarshal(oldMentorParentIDsJSON, &oldFamily.MentorParentIDs)
		}
		if oldFamily.MentorParentIDs == nil {
			oldFamily.MentorParentIDs = []uuid.UUID{}
		}

		_, err = tx.Exec(ctx, "UPDATE families SET notes = $1 WHERE id = $2", notes, familyID)
		if err != nil {
			return err
		}

		newFamily := oldFamily
		newFamily.Notes = notes

		transactionID := uuid.New()
		return s.recordAudit(ctx, tx, transactionID, &familyID, "family", familyID, "UPDATE", oldFamily, newFamily, userID, userEmail...)
	})
}

func (s *Store) DeleteChild(ctx context.Context, userID uuid.UUID, childID uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldChild models.Child
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, first_name_for_address_list, last_name, birth_date, notes, vaccination_status_protected, familiencards FROM children WHERE id = $1", childID).Scan(
			&oldChild.ID, &oldChild.FamilyID, &oldChild.FirstName, &oldChild.FirstNameForAddressList, &oldChild.LastName, &oldChild.BirthDate, &oldChild.Notes, &oldChild.VaccinationStatusProtected, &oldChild.Familiencards,
		)
		if err != nil {
			return err
		}

		if err := s.recordAudit(ctx, tx, transactionID, &oldChild.FamilyID, "child", childID, "DELETE", oldChild, nil, userID, userEmail...); err != nil {
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
			if err := s.recordAudit(ctx, tx, transactionID, &oldChild.FamilyID, "family", oldChild.FamilyID, "DELETE", f, nil, userID, userEmail...); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", oldChild.FamilyID)
			return err
		}
		return nil
	})
}

func (s *Store) DeleteParent(ctx context.Context, userID uuid.UUID, parentID uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var oldParent models.Parent
		err := tx.QueryRow(ctx, "SELECT id, family_id, first_name, first_name_for_address_list, last_name, emails, phones, address, notes, vaccination_status_protected FROM parents WHERE id = $1", parentID).Scan(
			&oldParent.ID, &oldParent.FamilyID, &oldParent.FirstName, &oldParent.FirstNameForAddressList, &oldParent.LastName, &oldParent.Emails, &oldParent.Phones, &oldParent.Address, &oldParent.Notes, &oldParent.VaccinationStatusProtected,
		)
		if err != nil {
			return err
		}
		oldParent.Phones = sanitizePhones(oldParent.Phones)

		if err := s.recordAudit(ctx, tx, transactionID, &oldParent.FamilyID, "parent", parentID, "DELETE", oldParent, nil, userID, userEmail...); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "DELETE FROM parents WHERE id = $1", parentID)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, "UPDATE families SET mentor_parent_ids = mentor_parent_ids - $1::text WHERE mentor_parent_ids ? $1::text", parentID.String())

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
			if err := s.recordAudit(ctx, tx, transactionID, &oldParent.FamilyID, "family", oldParent.FamilyID, "DELETE", f, nil, userID, userEmail...); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "DELETE FROM families WHERE id = $1", oldParent.FamilyID)
			return err
		}
		return nil
	})
}

func (s *Store) CreateHygieneEvent(ctx context.Context, userID uuid.UUID, event models.HygieneBelehrungEvent, userEmail ...string) (models.HygieneBelehrungEvent, error) {
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

		return s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", event.ID, "INSERT", nil, event, userID, userEmail...)
	})

	if err != nil {
		return models.HygieneBelehrungEvent{}, err
	}
	return event, nil
}

func (s *Store) DeleteHygieneEvent(ctx context.Context, userID uuid.UUID, eventID uuid.UUID, userEmail ...string) error {
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

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", eventID, "DELETE", oldEvent, nil, userID, userEmail...); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM hygiene_belehrung_events WHERE id = $1", eventID)
		return err
	})
}

func (s *Store) UpdateHygieneEvent(ctx context.Context, userID uuid.UUID, eventID uuid.UUID, eventDate time.Time, eventType string, documentation string, userEmail ...string) (models.HygieneBelehrungEvent, error) {
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
			return s.recordAudit(ctx, tx, transactionID, &familyID, "hygiene_event", eventID, "UPDATE", oldEvent, updated, userID, userEmail...)
		}
		return nil
	})

	if err != nil {
		return models.HygieneBelehrungEvent{}, err
	}
	return updated, nil
}

func (s *Store) CreateTHMembership(ctx context.Context, userID uuid.UUID, m models.THMembership, userEmail ...string) (models.THMembership, error) {
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

		return s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", created.ID, "INSERT", nil, created, userID, userEmail...)
	})
	return created, err
}

func (s *Store) DeleteTHMembership(ctx context.Context, userID uuid.UUID, membershipID uuid.UUID, userEmail ...string) error {
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

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", membershipID, "DELETE", oldMembership, nil, userID, userEmail...); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM th_memberships WHERE id = $1", membershipID)
		return err
	})
}

func (s *Store) UpdateTHMembership(ctx context.Context, userID uuid.UUID, membershipID uuid.UUID, startDate time.Time, endDate *time.Time, membershipType string, userEmail ...string) (models.THMembership, error) {
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
			return s.recordAudit(ctx, tx, transactionID, &familyID, "th_membership", membershipID, "UPDATE", oldMembership, updated, userID, userEmail...)
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
			  AND m2.start_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') 
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
			// 1. Check for membership active today
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

			// 2. If none active today, check for membership starting this month
			if activeMembership == nil {
				firstOfNextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
				for i := range r.Memberships {
					m := &r.Memberships[i]
					mStart := time.Date(m.StartDate.Year(), m.StartDate.Month(), m.StartDate.Day(), 0, 0, 0, 0, time.UTC)
					var mEnd *time.Time
					if m.EndDate != nil {
						e := time.Date(m.EndDate.Year(), m.EndDate.Month(), m.EndDate.Day(), 23, 59, 59, 0, time.UTC)
						mEnd = &e
					}

					if mStart.Before(firstOfNextMonth) && (mEnd == nil || !mEnd.Before(today)) {
						activeMembership = m
					}
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

func (s *Store) CreateChildGroupChange(ctx context.Context, userID uuid.UUID, gc models.ChildGroupChange, userEmail ...string) (models.ChildGroupChange, error) {
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

		return s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", created.ID, "INSERT", nil, created, userID, userEmail...)
	})
	return created, err
}

func (s *Store) DeleteChildGroupChange(ctx context.Context, userID uuid.UUID, changeID uuid.UUID, userEmail ...string) error {
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

		if err := s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", changeID, "DELETE", oldChange, nil, userID, userEmail...); err != nil {
			return err
		}

		_, err = tx.Exec(ctx, "DELETE FROM children_group_changes WHERE id = $1", changeID)
		return err
	})
}

func (s *Store) UpdateChildGroupChange(ctx context.Context, userID uuid.UUID, changeID uuid.UUID, changeDate time.Time, targetGroup int, userEmail ...string) (models.ChildGroupChange, error) {
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
			return s.recordAudit(ctx, tx, transactionID, &familyID, "child_group_change", changeID, "UPDATE", oldChange, updated, userID, userEmail...)
		}
		return nil
	})
	return updated, err
}

func (s *Store) ListAuditLogs(ctx context.Context) ([]models.AuditLog, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(NULLIF(a.changed_by_email, ''), u.email, ''), a.created_at
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

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func (s *Store) QueryAuditLogsForUser(ctx context.Context, user *models.UserWithPermissions, filter models.AuditLogFilter) ([]models.AuditLog, bool, error) {
	if user == nil {
		return []models.AuditLog{}, false, nil
	}

	var whereClauses []string
	var args []interface{}

	// If the user does not have global access and is scoped to a specific family
	if !user.HasPermission("*") && !user.HasPermission("families.all.read") && user.FamilyID != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("a.family_id = $%d", len(args)+1))
		args = append(args, *user.FamilyID)
	}

	// Filter allowed entity types if not superadmin
	if !user.HasPermission("*") {
		allowedEntities := audit.AllowedEntityTypesForUser(user)
		if len(allowedEntities) == 0 {
			return []models.AuditLog{}, false, nil
		}
		whereClauses = append(whereClauses, fmt.Sprintf("a.entity_type = ANY($%d)", len(args)+1))
		args = append(args, allowedEntities)
	}

	// Keyset pagination by timestamp and id
	if filter.Before != nil {
		if filter.BeforeID != nil {
			whereClauses = append(whereClauses, fmt.Sprintf("(a.created_at < $%d OR (a.created_at = $%d AND a.id < $%d))", len(args)+1, len(args)+1, len(args)+2))
			args = append(args, *filter.Before, *filter.BeforeID)
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("a.created_at < $%d", len(args)+1))
			args = append(args, *filter.Before)
		}
	}

	// Search query filter (user who performed action, or payload values)
	searchTrimmed := strings.TrimSpace(filter.Search)
	if searchTrimmed != "" {
		pattern := "%" + escapeLike(searchTrimmed) + "%"
		whereClauses = append(whereClauses, fmt.Sprintf(
			"(COALESCE(NULLIF(a.changed_by_email, ''), u.email, '') ILIKE $%d OR COALESCE(a.before_snapshot::text, '') ILIKE $%d OR COALESCE(a.after_snapshot::text, '') ILIKE $%d)",
			len(args)+1, len(args)+1, len(args)+1,
		))
		args = append(args, pattern)
	}

	query := `
		SELECT a.id, a.transaction_id, a.family_id, a.entity_type, a.entity_id, a.operation, a.before_snapshot, a.after_snapshot, a.changed_by, COALESCE(NULLIF(a.changed_by_email, ''), u.email, ''), a.created_at
		FROM audit_log a
		LEFT JOIN users u ON a.changed_by = u.id
	`
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " ORDER BY a.created_at DESC, a.id DESC"

	if filter.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", len(args)+1)
		args = append(args, filter.Limit+1)
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		err := rows.Scan(&l.ID, &l.TransactionID, &l.FamilyID, &l.EntityType, &l.EntityID, &l.Operation, &l.BeforeSnapshot, &l.AfterSnapshot, &l.ChangedBy, &l.ChangedByEmail, &l.CreatedAt)
		if err != nil {
			return nil, false, err
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	// Apply row-level security and field sanitization
	filtered := audit.FilterAuditLogsForUser(user, logs)

	// Defense-in-depth: If search query was provided, ensure redacted snapshots didn't falsely match
	if searchTrimmed != "" {
		searchLower := strings.ToLower(searchTrimmed)
		verified := make([]models.AuditLog, 0, len(filtered))
		for _, l := range filtered {
			userMatch := strings.Contains(strings.ToLower(l.ChangedByEmail), searchLower)
			beforeMatch := len(l.BeforeSnapshot) > 0 && strings.Contains(strings.ToLower(string(l.BeforeSnapshot)), searchLower)
			afterMatch := len(l.AfterSnapshot) > 0 && strings.Contains(strings.ToLower(string(l.AfterSnapshot)), searchLower)
			if userMatch || beforeMatch || afterMatch {
				verified = append(verified, l)
			}
		}
		filtered = verified
	}

	hasMore := false
	if filter.Limit > 0 && len(filtered) > filter.Limit {
		hasMore = true
		filtered = filtered[:filter.Limit]
	}

	return filtered, hasMore, nil
}

func (s *Store) ListAuditLogsForUser(ctx context.Context, user *models.UserWithPermissions) ([]models.AuditLog, error) {
	logs, _, err := s.QueryAuditLogsForUser(ctx, user, models.AuditLogFilter{})
	return logs, err
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
	norm := models.CanonicalEmail(email)
	query := `
		SELECT 
			u.id, 
			u.email, 
			COALESCE(u.canonical_email, lower(regexp_replace(trim(u.email), '@googlemail\.com$', '@gmail.com', 'i'))),
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
		WHERE COALESCE(u.canonical_email, lower(regexp_replace(trim(u.email), '@googlemail\.com$', '@gmail.com', 'i'))) = $1
		   OR lower(trim(u.email)) = $1
		GROUP BY u.id, u.email, u.canonical_email, u.permissions, u.last_login, u.created_at, u.updated_at
	`

	var u models.UserWithPermissions
	var userPermissionsJSON, rolePermissionsJSON, roleDenyPermissionsJSON []byte

	err := s.db.QueryRow(ctx, query, norm).Scan(
		&u.ID, &u.Email, &u.CanonicalEmail, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON, &roleDenyPermissionsJSON,
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
			COALESCE(u.canonical_email, lower(regexp_replace(trim(u.email), '@googlemail\.com$', '@gmail.com', 'i'))),
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
		GROUP BY u.id, u.email, u.canonical_email, u.permissions, u.last_login, u.created_at, u.updated_at
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

		err := rows.Scan(&u.ID, &u.Email, &u.CanonicalEmail, &userPermissionsJSON, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt, &u.Roles, &rolePermissionsJSON, &roleDenyPermissionsJSON)
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
	rawEmail := strings.TrimSpace(email)
	canonicalEmail := models.CanonicalEmail(rawEmail)
	if permissions == nil {
		permissions = []string{}
	}
	permsJSON, err := json.Marshal(permissions)
	if err != nil {
		return nil, err
	}

	userID := uuid.New()
	err = s.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $3, $4)", userID, rawEmail, canonicalEmail, permsJSON)
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
		ID:             userID,
		Email:          rawEmail,
		CanonicalEmail: canonicalEmail,
		Roles:          roles,
		Permissions:    permissions,
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

func (s *Store) GetMealPlanDay(ctx context.Context, targetDate time.Time) (*models.MealPlanDayResponse, error) {
	dateStr := targetDate.Format("2006-01-02")
	resp := &models.MealPlanDayResponse{
		Date:           dateStr,
		WhoIsCooking:   "",
		MealComponents: []string{},
	}

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

	mealDay, errAllergen := s.GetMealAllergenDay(ctx, targetDate)
	if errAllergen == nil && mealDay != nil {
		if resp.WhoIsCooking == "" && strings.TrimSpace(mealDay.CookCustomName) != "" {
			resp.WhoIsCooking = strings.TrimSpace(mealDay.CookCustomName)
		}
		if len(resp.MealComponents) == 0 && mealDay.HasAllergenRecord && len(mealDay.MealComponents) > 0 {
			for _, c := range mealDay.MealComponents {
				trimmed := strings.TrimSpace(c.Name)
				if trimmed != "" {
					resp.MealComponents = append(resp.MealComponents, trimmed)
				}
			}
		}
	}

	return resp, nil
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

	// 5. If meal allergens have been recorded for targetDate:
	mealDay, err := s.GetMealAllergenDay(ctx, targetDate)
	if err == nil && mealDay != nil {
		if resp.WhoIsCooking == "" && strings.TrimSpace(mealDay.CookCustomName) != "" {
			resp.WhoIsCooking = strings.TrimSpace(mealDay.CookCustomName)
		}
		if len(resp.MealComponents) == 0 && mealDay.HasAllergenRecord && len(mealDay.MealComponents) > 0 {
			for _, c := range mealDay.MealComponents {
				trimmed := strings.TrimSpace(c.Name)
				if trimmed != "" {
					resp.MealComponents = append(resp.MealComponents, trimmed)
				}
			}
		}
		if mealDay.HasAllergenRecord && len(mealDay.MealComponents) > 0 {
			resp.HasAllergenRecord = true
			resp.AllergenMealComponents = mealDay.MealComponents
		}
	}

	// 6. Allergene eintragen ("enter_allergens") task:
	// Applies on all weekdays (Monday-Friday) or whenever cooking is scheduled,
	// unless meal allergens for that day are explicitly marked "not_relevant".
	isNotRelevant := mealDay != nil && mealDay.Status == models.MealAllergenStatusNotRelevant
	isWeekday := targetDate.Weekday() >= time.Monday && targetDate.Weekday() <= time.Friday
	hasCooking := resp.WhoIsCooking != "" || len(resp.MealComponents) > 0 || (mealDay != nil && (mealDay.HasAllergenRecord || len(mealDay.MealComponents) > 0))
	if !isNotRelevant && (isWeekday || hasCooking) {
		resp.TasksAndInfo = append(resp.TasksAndInfo, "enter_allergens")
	}

	// 7. Completed tasks from completed_tasks table
	completedTasks, err := s.GetCompletedTasks(ctx, targetDate)
	if err == nil {
		resp.CompletedTasks = completedTasks
		for _, ct := range completedTasks {
			resp.CompletedTaskIDs = append(resp.CompletedTaskIDs, ct.TaskTypeID)
		}
	}
	if mealDay != nil && mealDay.Status == models.MealAllergenStatusFinalized {
		hasAllergensCompleted := false
		for _, id := range resp.CompletedTaskIDs {
			if id == "enter_allergens" || id == "allergene_eintragen" {
				hasAllergensCompleted = true
				break
			}
		}
		if !hasAllergensCompleted {
			resp.CompletedTaskIDs = append(resp.CompletedTaskIDs, "enter_allergens")
			resp.CompletedTasks = append(resp.CompletedTasks, models.CompletedTask{
				TaskDate:    dateStr,
				TaskTypeID:  "enter_allergens",
				CompletedAt: time.Now(),
			})
		}
	}

	// 8. Screensaver exit times for kiosk devices (defaults to 09:30 and 10:00)
	exitTimesEnv := strings.TrimSpace(os.Getenv("KIOSK_SCREENSAVER_EXIT_TIMES"))
	if exitTimesEnv != "" {
		for _, part := range strings.Split(exitTimesEnv, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				resp.ScreensaverExitTimes = append(resp.ScreensaverExitTimes, trimmed)
			}
		}
	}
	if len(resp.ScreensaverExitTimes) == 0 {
		resp.ScreensaverExitTimes = []string{"09:30", "10:00"}
	}

	return resp, nil
}

func (s *Store) CompleteTask(ctx context.Context, targetDate time.Time, taskTypeID string, actor models.MealAllergenActor) (*models.CompletedTask, error) {
	dateStr := targetDate.Format("2006-01-02")
	var ct models.CompletedTask
	var taskDate time.Time
	err := s.db.QueryRow(ctx, `
		INSERT INTO completed_tasks (task_date, task_type_id, completed_by, completed_by_email, is_kiosk, kiosk_name, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (task_date, task_type_id) DO UPDATE
		SET completed_by = EXCLUDED.completed_by,
		    completed_by_email = EXCLUDED.completed_by_email,
		    is_kiosk = EXCLUDED.is_kiosk,
		    kiosk_name = EXCLUDED.kiosk_name,
		    completed_at = NOW()
		RETURNING id, task_date, task_type_id, completed_by, completed_by_email, is_kiosk, kiosk_name, completed_at
	`, dateStr, taskTypeID, actor.UserID, actor.Email, actor.IsKiosk, actor.KioskName).Scan(
		&ct.ID,
		&taskDate,
		&ct.TaskTypeID,
		&ct.CompletedBy,
		&ct.CompletedByEmail,
		&ct.IsKiosk,
		&ct.KioskName,
		&ct.CompletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to complete task %s for %s: %w", taskTypeID, dateStr, err)
	}
	ct.TaskDate = taskDate.Format("2006-01-02")
	return &ct, nil
}

func (s *Store) UncompleteTask(ctx context.Context, targetDate time.Time, taskTypeID string) error {
	dateStr := targetDate.Format("2006-01-02")
	_, err := s.db.Exec(ctx, `
		DELETE FROM completed_tasks
		WHERE task_date = $1 AND task_type_id = $2
	`, dateStr, taskTypeID)
	if err != nil {
		return fmt.Errorf("failed to uncomplete task %s for %s: %w", taskTypeID, dateStr, err)
	}
	return nil
}

func (s *Store) GetCompletedTasks(ctx context.Context, targetDate time.Time) ([]models.CompletedTask, error) {
	dateStr := targetDate.Format("2006-01-02")
	rows, err := s.db.Query(ctx, `
		SELECT id, task_date, task_type_id, completed_by, completed_by_email, is_kiosk, kiosk_name, completed_at
		FROM completed_tasks
		WHERE task_date = $1
		ORDER BY completed_at ASC
	`, dateStr)
	if err != nil {
		return nil, fmt.Errorf("failed to get completed tasks for %s: %w", dateStr, err)
	}
	defer rows.Close()

	var result []models.CompletedTask
	for rows.Next() {
		var ct models.CompletedTask
		var taskDate time.Time
		if err := rows.Scan(
			&ct.ID,
			&taskDate,
			&ct.TaskTypeID,
			&ct.CompletedBy,
			&ct.CompletedByEmail,
			&ct.IsKiosk,
			&ct.KioskName,
			&ct.CompletedAt,
		); err != nil {
			return nil, err
		}
		ct.TaskDate = taskDate.Format("2006-01-02")
		result = append(result, ct)
	}
	return result, rows.Err()
}

func (s *Store) ListEmployees(ctx context.Context) ([]models.Employee, error) {
	query := `
		SELECT e.id, e.first_name, e.last_name, e.employee_type, e.emails, e.phones, e.address, e.is_kinderschutzbeauftragter, e.allergies_protected, e.created_at, e.updated_at,
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', j.id,
					'name', j.name,
					'description', j.description,
					'contact_email', j.contact_email,
					'soll_persons', j.soll_persons,
					'created_at', j.created_at,
					'updated_at', j.updated_at
				) ORDER BY j.name ASC)
				FROM employee_jobs ej
				JOIN jobs j ON j.id = ej.job_id
				WHERE ej.employee_id = e.id
			), '[]')
		FROM employees e
		ORDER BY e.last_name ASC, e.first_name ASC, e.created_at ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	employees := []models.Employee{}
	for rows.Next() {
		var emp models.Employee
		var emailsRaw, phonesRaw, jobsRaw []byte
		if err := rows.Scan(
			&emp.ID,
			&emp.FirstName,
			&emp.LastName,
			&emp.EmployeeType,
			&emailsRaw,
			&phonesRaw,
			&emp.Address,
			&emp.IsKinderschutzbeauftragter,
			&emp.AllergiesProtected,
			&emp.CreatedAt,
			&emp.UpdatedAt,
			&jobsRaw,
		); err != nil {
			return nil, err
		}
		if len(emailsRaw) > 0 {
			_ = json.Unmarshal(emailsRaw, &emp.Emails)
		}
		if len(phonesRaw) > 0 {
			_ = json.Unmarshal(phonesRaw, &emp.Phones)
		}
		if len(jobsRaw) > 0 {
			_ = json.Unmarshal(jobsRaw, &emp.Jobs)
		}
		emp.Emails = sanitizeSlice(emp.Emails)
		emp.Phones = sanitizePhones(emp.Phones)
		employees = append(employees, emp)
	}
	return employees, rows.Err()
}

func (s *Store) GetEmployeeByID(ctx context.Context, id uuid.UUID) (*models.Employee, error) {
	query := `
		SELECT e.id, e.first_name, e.last_name, e.employee_type, e.emails, e.phones, e.address, e.is_kinderschutzbeauftragter, e.allergies_protected, e.created_at, e.updated_at,
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', j.id,
					'name', j.name,
					'description', j.description,
					'contact_email', j.contact_email,
					'soll_persons', j.soll_persons,
					'created_at', j.created_at,
					'updated_at', j.updated_at
				) ORDER BY j.name ASC)
				FROM employee_jobs ej
				JOIN jobs j ON j.id = ej.job_id
				WHERE ej.employee_id = e.id
			), '[]')
		FROM employees e
		WHERE e.id = $1
	`
	var emp models.Employee
	var emailsRaw, phonesRaw, jobsRaw []byte
	err := s.db.QueryRow(ctx, query, id).Scan(
		&emp.ID,
		&emp.FirstName,
		&emp.LastName,
		&emp.EmployeeType,
		&emailsRaw,
		&phonesRaw,
		&emp.Address,
		&emp.IsKinderschutzbeauftragter,
		&emp.AllergiesProtected,
		&emp.CreatedAt,
		&emp.UpdatedAt,
		&jobsRaw,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if len(emailsRaw) > 0 {
		_ = json.Unmarshal(emailsRaw, &emp.Emails)
	}
	if len(phonesRaw) > 0 {
		_ = json.Unmarshal(phonesRaw, &emp.Phones)
	}
	if len(jobsRaw) > 0 {
		_ = json.Unmarshal(jobsRaw, &emp.Jobs)
	}
	emp.Emails = sanitizeSlice(emp.Emails)
	emp.Phones = sanitizePhones(emp.Phones)
	return &emp, nil
}

func (s *Store) CreateEmployee(ctx context.Context, userID uuid.UUID, emp models.Employee, userEmail ...string) (models.Employee, error) {
	emp.FirstName = strings.TrimSpace(emp.FirstName)
	emp.LastName = strings.TrimSpace(emp.LastName)
	emp.EmployeeType = strings.TrimSpace(emp.EmployeeType)
	emp.Address = strings.TrimSpace(emp.Address)

	if emp.FirstName == "" || emp.LastName == "" {
		return models.Employee{}, fmt.Errorf("given name and surname are required")
	}
	if emp.EmployeeType != "caregiver" && emp.EmployeeType != "cook" && emp.EmployeeType != "bufdi" {
		return models.Employee{}, fmt.Errorf("invalid employee type: must be caregiver, cook, or bufdi")
	}
	if emp.EmployeeType != "caregiver" {
		emp.IsKinderschutzbeauftragter = false
	}

	emp.Emails = sanitizeSlice(emp.Emails)
	emp.Phones = sanitizePhones(emp.Phones)
	emailsJSON, _ := json.Marshal(emp.Emails)
	phonesJSON, _ := json.Marshal(emp.Phones)

	transactionID := uuid.New()
	var created models.Employee

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var emailsRaw, phonesRaw []byte
		err := tx.QueryRow(ctx, `
			INSERT INTO employees (first_name, last_name, employee_type, emails, phones, address, is_kinderschutzbeauftragter, allergies_protected)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, first_name, last_name, employee_type, emails, phones, address, is_kinderschutzbeauftragter, allergies_protected, created_at, updated_at
		`, emp.FirstName, emp.LastName, emp.EmployeeType, emailsJSON, phonesJSON, emp.Address, emp.IsKinderschutzbeauftragter, emp.AllergiesProtected).Scan(
			&created.ID,
			&created.FirstName,
			&created.LastName,
			&created.EmployeeType,
			&emailsRaw,
			&phonesRaw,
			&created.Address,
			&created.IsKinderschutzbeauftragter,
			&created.AllergiesProtected,
			&created.CreatedAt,
			&created.UpdatedAt,
		)
		if err != nil {
			return err
		}
		if len(emailsRaw) > 0 {
			_ = json.Unmarshal(emailsRaw, &created.Emails)
		}
		if len(phonesRaw) > 0 {
			_ = json.Unmarshal(phonesRaw, &created.Phones)
		}
		created.Emails = sanitizeSlice(created.Emails)
		created.Phones = sanitizePhones(created.Phones)
		created.AllergiesUpdated = emp.AllergiesUpdated

		return s.recordAudit(ctx, tx, transactionID, nil, "employee", created.ID, "INSERT", nil, created, userID, userEmail...)
	})

	return created, err
}

func (s *Store) UpdateEmployee(ctx context.Context, userID uuid.UUID, emp models.Employee, userEmail ...string) (models.Employee, error) {
	emp.FirstName = strings.TrimSpace(emp.FirstName)
	emp.LastName = strings.TrimSpace(emp.LastName)
	emp.EmployeeType = strings.TrimSpace(emp.EmployeeType)
	emp.Address = strings.TrimSpace(emp.Address)

	if emp.FirstName == "" || emp.LastName == "" {
		return models.Employee{}, fmt.Errorf("given name and surname are required")
	}
	if emp.EmployeeType != "caregiver" && emp.EmployeeType != "cook" && emp.EmployeeType != "bufdi" {
		return models.Employee{}, fmt.Errorf("invalid employee type: must be caregiver, cook, or bufdi")
	}
	if emp.EmployeeType != "caregiver" {
		emp.IsKinderschutzbeauftragter = false
	}

	emp.Emails = sanitizeSlice(emp.Emails)
	emp.Phones = sanitizePhones(emp.Phones)
	emailsJSON, _ := json.Marshal(emp.Emails)
	phonesJSON, _ := json.Marshal(emp.Phones)

	transactionID := uuid.New()
	var updated models.Employee

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		oldEmp, err := s.GetEmployeeByID(ctx, emp.ID)
		if err != nil {
			return err
		}
		if oldEmp == nil {
			return fmt.Errorf("employee not found")
		}

		if emp.ClearAllergies {
			emp.AllergiesProtected = nil
		} else if emp.AllergiesProtected == nil && len(oldEmp.AllergiesProtected) > 0 {
			emp.AllergiesProtected = oldEmp.AllergiesProtected
		}

		var emailsRaw, phonesRaw []byte
		err = tx.QueryRow(ctx, `
			UPDATE employees
			SET first_name = $1,
			    last_name = $2,
			    employee_type = $3,
			    emails = $4,
			    phones = $5,
			    address = $6,
			    is_kinderschutzbeauftragter = $7,
			    allergies_protected = $8,
			    updated_at = NOW()
			WHERE id = $9
			RETURNING id, first_name, last_name, employee_type, emails, phones, address, is_kinderschutzbeauftragter, allergies_protected, created_at, updated_at
		`, emp.FirstName, emp.LastName, emp.EmployeeType, emailsJSON, phonesJSON, emp.Address, emp.IsKinderschutzbeauftragter, emp.AllergiesProtected, emp.ID).Scan(
			&updated.ID,
			&updated.FirstName,
			&updated.LastName,
			&updated.EmployeeType,
			&emailsRaw,
			&phonesRaw,
			&updated.Address,
			&updated.IsKinderschutzbeauftragter,
			&updated.AllergiesProtected,
			&updated.CreatedAt,
			&updated.UpdatedAt,
		)
		if err != nil {
			return err
		}
		if len(emailsRaw) > 0 {
			_ = json.Unmarshal(emailsRaw, &updated.Emails)
		}
		if len(phonesRaw) > 0 {
			_ = json.Unmarshal(phonesRaw, &updated.Phones)
		}
		updated.Emails = sanitizeSlice(updated.Emails)
		updated.Phones = sanitizePhones(updated.Phones)
		updated.AllergiesUpdated = emp.AllergiesUpdated

		return s.recordAudit(ctx, tx, transactionID, nil, "employee", updated.ID, "UPDATE", oldEmp, updated, userID, userEmail...)
	})

	return updated, err
}

func (s *Store) DeleteEmployee(ctx context.Context, userID uuid.UUID, empID uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		oldEmp, err := s.GetEmployeeByID(ctx, empID)
		if err != nil {
			return err
		}
		if oldEmp == nil {
			return fmt.Errorf("employee not found")
		}

		cmd, err := tx.Exec(ctx, "DELETE FROM employees WHERE id = $1", empID)
		if err != nil {
			return err
		}
		if cmd.RowsAffected() == 0 {
			return fmt.Errorf("employee not found")
		}

		return s.recordAudit(ctx, tx, transactionID, nil, "employee", empID, "DELETE", oldEmp, nil, userID, userEmail...)
	})
}

func (s *Store) GetActiveDEK(ctx context.Context, purpose string) (*crypto.DEKRecord, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database store is not initialized")
	}
	var rec crypto.DEKRecord
	err := s.db.QueryRow(ctx, `
		SELECT id, purpose, kms_key_path, encrypted_dek, is_active
		FROM data_encryption_keys
		WHERE purpose = $1 AND is_active = true
		LIMIT 1
	`, purpose).Scan(&rec.ID, &rec.Purpose, &rec.KMSKeyPath, &rec.EncryptedDEK, &rec.IsActive)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

func (s *Store) GetDEKByID(ctx context.Context, id uuid.UUID) (*crypto.DEKRecord, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database store is not initialized")
	}
	var rec crypto.DEKRecord
	err := s.db.QueryRow(ctx, `
		SELECT id, purpose, kms_key_path, encrypted_dek, is_active
		FROM data_encryption_keys
		WHERE id = $1
	`, id).Scan(&rec.ID, &rec.Purpose, &rec.KMSKeyPath, &rec.EncryptedDEK, &rec.IsActive)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

func (s *Store) CreateActiveDEK(ctx context.Context, rec crypto.DEKRecord) (*crypto.DEKRecord, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database store is not initialized")
	}
	if rec.ID == uuid.Nil {
		rec.ID = uuid.New()
	}
	var out crypto.DEKRecord
	err := s.db.QueryRow(ctx, `
		INSERT INTO data_encryption_keys (id, purpose, kms_key_path, encrypted_dek, is_active)
		VALUES ($1, $2, $3, $4, true)
		ON CONFLICT (purpose) WHERE is_active = true DO NOTHING
		RETURNING id, purpose, kms_key_path, encrypted_dek, is_active
	`, rec.ID, rec.Purpose, rec.KMSKeyPath, rec.EncryptedDEK).Scan(
		&out.ID, &out.Purpose, &out.KMSKeyPath, &out.EncryptedDEK, &out.IsActive,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return s.GetActiveDEK(ctx, rec.Purpose)
		}
		return nil, err
	}
	return &out, nil
}

func (s *Store) ResetTestData(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		TRUNCATE TABLE 
			completed_tasks,
			yellow_bag_days,
			employee_jobs,
			parent_jobs,
			jobs,
			meal_allergens_history,
			meal_allergens,
			meal_plan_from_sheets,
			data_encryption_keys,
			employees,
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

func (s *Store) SeedTestMealPlan(ctx context.Context, dateStr, cookName, comp1, comp2, comp3 string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO meal_plan_from_sheets (date, fetched_at, cook_name, food_component_1, food_component_2, food_component_3)
		VALUES ($1, NOW(), $2, $3, $4, $5)
		ON CONFLICT (date) DO UPDATE SET
			fetched_at = NOW(),
			cook_name = EXCLUDED.cook_name,
			food_component_1 = EXCLUDED.food_component_1,
			food_component_2 = EXCLUDED.food_component_2,
			food_component_3 = EXCLUDED.food_component_3
	`, dateStr, cookName, comp1, comp2, comp3)
	return err
}

func (s *Store) SeedTestYellowBagDays(ctx context.Context, dates []string) error {
	for _, d := range dates {
		_, err := s.db.Exec(ctx, `
			INSERT INTO yellow_bag_days (date, fetched_at)
			VALUES ($1, NOW())
			ON CONFLICT (date) DO UPDATE SET fetched_at = NOW()
		`, d)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListCookOptions(ctx context.Context) ([]models.CookOption, error) {
	var cookEmployees []models.CookOption
	var otherEmployees []models.CookOption

	eRows, err := s.db.Query(ctx, `
		SELECT id, first_name, last_name, employee_type
		FROM employees
		ORDER BY LOWER(TRIM(first_name)) ASC, LOWER(TRIM(last_name)) ASC, first_name ASC, last_name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query employees for cook options: %w", err)
	}
	defer eRows.Close()

	for eRows.Next() {
		var opt models.CookOption
		if err := eRows.Scan(&opt.ID, &opt.FirstName, &opt.LastName, &opt.EmployeeType); err != nil {
			return nil, err
		}
		opt.Type = "employee"
		opt.DisplayName = strings.TrimSpace(opt.FirstName + " " + opt.LastName)
		if opt.EmployeeType == "cook" {
			cookEmployees = append(cookEmployees, opt)
		} else {
			otherEmployees = append(otherEmployees, opt)
		}
	}
	if err := eRows.Err(); err != nil {
		return nil, err
	}

	pRows, err := s.db.Query(ctx, `
		SELECT
			p.id,
			p.family_id,
			p.first_name,
			p.last_name,
			COALESCE((
				SELECT string_agg(DISTINCT TRIM(p2.last_name), ' / ' ORDER BY TRIM(p2.last_name) ASC)
				FROM parents p2
				WHERE p2.family_id = p.family_id AND TRIM(p2.last_name) != ''
			), 'Familie') AS family_name
		FROM parents p
		ORDER BY LOWER(COALESCE((
			SELECT string_agg(DISTINCT TRIM(p2.last_name), ' / ' ORDER BY TRIM(p2.last_name) ASC)
			FROM parents p2
			WHERE p2.family_id = p.family_id AND TRIM(p2.last_name) != ''
		), 'Familie')) ASC,
		p.family_id ASC,
		LOWER(TRIM(p.first_name)) ASC,
		LOWER(TRIM(p.last_name)) ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query parents for cook options: %w", err)
	}
	defer pRows.Close()

	var parentOptions []models.CookOption
	for pRows.Next() {
		var opt models.CookOption
		if err := pRows.Scan(&opt.ID, &opt.FamilyID, &opt.FirstName, &opt.LastName, &opt.FamilyName); err != nil {
			return nil, err
		}
		opt.Type = "parent"
		opt.DisplayName = strings.TrimSpace(opt.FirstName + " " + opt.LastName)
		parentOptions = append(parentOptions, opt)
	}
	if err := pRows.Err(); err != nil {
		return nil, err
	}

	options := make([]models.CookOption, 0, len(cookEmployees)+len(parentOptions)+len(otherEmployees))
	options = append(options, cookEmployees...)
	options = append(options, parentOptions...)
	options = append(options, otherEmployees...)

	return options, nil
}

type planRow struct {
	cookName   string
	components []string
}

type allergenRow struct {
	cooks           models.MealAllergenCookList
	cookParentID    *uuid.UUID
	cookParentFirst string
	cookParentLast  string
	cookParentName  string
	cookEmployeeID  *uuid.UUID
	cookEmpFirst    string
	cookEmpLast     string
	cookEmpName     string
	cookCustomName  string
	mealComponents  models.MealAllergenComponentList
	status          models.MealAllergenStatus
	documentation   models.MealAllergenDocumentation
	createdAt       time.Time
	updatedAt       time.Time
}

type personNameInfo struct {
	firstName string
	lastName  string
}

func (s *Store) loadPersonNameMaps(ctx context.Context) (map[uuid.UUID]personNameInfo, map[uuid.UUID]personNameInfo) {
	parentNames := make(map[uuid.UUID]personNameInfo)
	empNames := make(map[uuid.UUID]personNameInfo)

	pRows, err := s.db.Query(ctx, `SELECT id, first_name, last_name FROM parents`)
	if err == nil {
		for pRows.Next() {
			var id uuid.UUID
			var fn, ln string
			if err := pRows.Scan(&id, &fn, &ln); err == nil {
				parentNames[id] = personNameInfo{firstName: strings.TrimSpace(fn), lastName: strings.TrimSpace(ln)}
			}
		}
		pRows.Close()
	}

	eRows, err := s.db.Query(ctx, `SELECT id, first_name, last_name FROM employees`)
	if err == nil {
		for eRows.Next() {
			var id uuid.UUID
			var fn, ln string
			if err := eRows.Scan(&id, &fn, &ln); err == nil {
				empNames[id] = personNameInfo{firstName: strings.TrimSpace(fn), lastName: strings.TrimSpace(ln)}
			}
		}
		eRows.Close()
	}

	return parentNames, empNames
}

func resolveAllergenRowCooks(
	aRow *allergenRow,
	parentNames map[uuid.UUID]personNameInfo,
	empNames map[uuid.UUID]personNameInfo,
) models.MealAllergenCookList {
	if aRow == nil {
		return models.MealAllergenCookList{}
	}
	rawCooks := aRow.cooks
	if len(rawCooks) == 0 {
		if aRow.cookParentID != nil && *aRow.cookParentID != uuid.Nil {
			rawCooks = models.MealAllergenCookList{
				{ID: *aRow.cookParentID, Type: "parent"},
			}
		} else if aRow.cookEmployeeID != nil && *aRow.cookEmployeeID != uuid.Nil {
			rawCooks = models.MealAllergenCookList{
				{ID: *aRow.cookEmployeeID, Type: "employee"},
			}
		}
	}

	resolved := make(models.MealAllergenCookList, 0, len(rawCooks))
	seen := make(map[string]bool)
	for _, c := range rawCooks {
		if c.ID == uuid.Nil {
			continue
		}
		cType := strings.ToLower(strings.TrimSpace(c.Type))
		if cType != "parent" && cType != "employee" {
			continue
		}
		key := cType + ":" + c.ID.String()
		if seen[key] {
			continue
		}
		seen[key] = true

		first := strings.TrimSpace(c.FirstName)
		last := strings.TrimSpace(c.LastName)
		if cType == "parent" {
			if info, ok := parentNames[c.ID]; ok {
				first = info.firstName
				last = info.lastName
			} else if aRow.cookParentID != nil && *aRow.cookParentID == c.ID {
				first = strings.TrimSpace(aRow.cookParentFirst)
				last = strings.TrimSpace(aRow.cookParentLast)
			} else if first == "" && last == "" {
				continue
			}
		} else {
			if info, ok := empNames[c.ID]; ok {
				first = info.firstName
				last = info.lastName
			} else if aRow.cookEmployeeID != nil && *aRow.cookEmployeeID == c.ID {
				first = strings.TrimSpace(aRow.cookEmpFirst)
				last = strings.TrimSpace(aRow.cookEmpLast)
			} else if first == "" && last == "" {
				continue
			}
		}

		disp := strings.TrimSpace(first + " " + last)
		resolved = append(resolved, models.MealAllergenCook{
			ID:          c.ID,
			Type:        cType,
			FirstName:   first,
			LastName:    last,
			DisplayName: disp,
		})
	}
	return resolved
}

func buildMealAllergenDay(
	dateStr string,
	pRow *planRow,
	aRow *allergenRow,
	parentNames map[uuid.UUID]personNameInfo,
	empNames map[uuid.UUID]personNameInfo,
) models.MealAllergenDay {
	day := models.MealAllergenDay{
		Date:               dateStr,
		HasAllergenRecord:  false,
		Cooks:              models.MealAllergenCookList{},
		MealComponents:     models.MealAllergenComponentList{},
		Status:             models.MealAllergenStatusUnspecified,
		Documentation:      models.MealAllergenDocumentation{},
		PlanCookName:       "",
		PlanMealComponents: []string{},
		HasPlanMeal:        false,
	}

	if pRow != nil {
		day.PlanCookName = pRow.cookName
		if pRow.components != nil {
			day.PlanMealComponents = pRow.components
		}
		day.HasPlanMeal = len(day.PlanMealComponents) > 0
	}

	if aRow != nil {
		day.HasAllergenRecord = true
		day.Cooks = resolveAllergenRowCooks(aRow, parentNames, empNames)
		day.CookParentID = aRow.cookParentID
		day.CookEmployeeID = aRow.cookEmployeeID
		if len(day.Cooks) == 1 {
			idCopy := day.Cooks[0].ID
			if day.Cooks[0].Type == "parent" {
				day.CookParentID = &idCopy
				day.CookEmployeeID = nil
			} else if day.Cooks[0].Type == "employee" {
				day.CookEmployeeID = &idCopy
				day.CookParentID = nil
			}
		}
		day.CookCustomName = aRow.cookCustomName
		if aRow.mealComponents != nil {
			day.MealComponents = aRow.mealComponents
		}
		day.Status = aRow.status
		day.Documentation = aRow.documentation
		cAt := aRow.createdAt
		uAt := aRow.updatedAt
		day.CreatedAt = &cAt
		day.UpdatedAt = &uAt

		if len(day.Cooks) > 0 {
			day.CookDisplayName = models.FormatCooksDisplayName(day.Cooks)
		} else if aRow.cookParentID != nil && aRow.cookParentName != "" {
			day.CookDisplayName = aRow.cookParentName
		} else if aRow.cookEmployeeID != nil && aRow.cookEmpName != "" {
			day.CookDisplayName = aRow.cookEmpName
		} else if strings.TrimSpace(aRow.cookCustomName) != "" {
			day.CookDisplayName = strings.TrimSpace(aRow.cookCustomName)
		} else {
			day.CookDisplayName = day.PlanCookName
		}
	} else {
		day.CookDisplayName = day.PlanCookName
	}

	return day
}

func (s *Store) GetMealAllergenDaysRange(ctx context.Context, startDate, endDate time.Time) ([]models.MealAllergenDay, error) {
	startStr := startDate.Format("2006-01-02")
	endStr := endDate.Format("2006-01-02")

	planMap := make(map[string]*planRow)
	pRows, err := s.db.Query(ctx, `
		SELECT TO_CHAR(date, 'YYYY-MM-DD'), cook_name, food_component_1, food_component_2, food_component_3
		FROM meal_plan_from_sheets
		WHERE date >= $1 AND date <= $2
	`, startStr, endStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query meal_plan_from_sheets range: %w", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var dStr, cookName, c1, c2, c3 string
		if err := pRows.Scan(&dStr, &cookName, &c1, &c2, &c3); err != nil {
			return nil, err
		}
		comps := make([]string, 0, 3)
		for _, c := range []string{c1, c2, c3} {
			trimmed := strings.TrimSpace(c)
			if trimmed != "" {
				comps = append(comps, trimmed)
			}
		}
		planMap[dStr] = &planRow{
			cookName:   strings.TrimSpace(cookName),
			components: comps,
		}
	}
	if err := pRows.Err(); err != nil {
		return nil, err
	}

	allergenMap := make(map[string]*allergenRow)
	aRows, err := s.db.Query(ctx, `
		SELECT
			TO_CHAR(ma.date, 'YYYY-MM-DD'),
			COALESCE(ma.cooks, '[]'::jsonb),
			ma.cook_parent_id,
			COALESCE(p.first_name, ''),
			COALESCE(p.last_name, ''),
			COALESCE(TRIM(p.first_name || ' ' || p.last_name), ''),
			ma.cook_employee_id,
			COALESCE(e.first_name, ''),
			COALESCE(e.last_name, ''),
			COALESCE(TRIM(e.first_name || ' ' || e.last_name), ''),
			ma.cook_custom_name,
			ma.meal_components,
			ma.status,
			ma.documentation,
			ma.created_at,
			ma.updated_at
		FROM meal_allergens ma
		LEFT JOIN parents p ON ma.cook_parent_id = p.id
		LEFT JOIN employees e ON ma.cook_employee_id = e.id
		WHERE ma.date >= $1 AND ma.date <= $2
	`, startStr, endStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query meal_allergens range: %w", err)
	}
	defer aRows.Close()

	for aRows.Next() {
		var dStr, statusStr string
		var ar allergenRow
		if err := aRows.Scan(
			&dStr,
			&ar.cooks,
			&ar.cookParentID,
			&ar.cookParentFirst,
			&ar.cookParentLast,
			&ar.cookParentName,
			&ar.cookEmployeeID,
			&ar.cookEmpFirst,
			&ar.cookEmpLast,
			&ar.cookEmpName,
			&ar.cookCustomName,
			&ar.mealComponents,
			&statusStr,
			&ar.documentation,
			&ar.createdAt,
			&ar.updatedAt,
		); err != nil {
			return nil, err
		}
		ar.status = models.MealAllergenStatus(statusStr)
		allergenMap[dStr] = &ar
	}
	if err := aRows.Err(); err != nil {
		return nil, err
	}

	parentNames, empNames := s.loadPersonNameMaps(ctx)

	var result []models.MealAllergenDay
	for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
		dStr := d.Format("2006-01-02")
		result = append(result, buildMealAllergenDay(dStr, planMap[dStr], allergenMap[dStr], parentNames, empNames))
	}

	return result, nil
}

func (s *Store) GetMealAllergenDay(ctx context.Context, targetDate time.Time) (*models.MealAllergenDay, error) {
	days, err := s.GetMealAllergenDaysRange(ctx, targetDate, targetDate)
	if err != nil {
		return nil, err
	}
	if len(days) == 0 {
		dStr := targetDate.Format("2006-01-02")
		day := buildMealAllergenDay(dStr, nil, nil, nil, nil)
		return &day, nil
	}
	return &days[0], nil
}

func (s *Store) GetAllMealAllergenEntries(ctx context.Context) ([]models.MealAllergenDay, error) {
	planMap := make(map[string]*planRow)
	dateSet := make(map[string]bool)

	pRows, err := s.db.Query(ctx, `
		SELECT TO_CHAR(date, 'YYYY-MM-DD'), cook_name, food_component_1, food_component_2, food_component_3
		FROM meal_plan_from_sheets
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query all meal_plan_from_sheets: %w", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var dStr, cookName, c1, c2, c3 string
		if err := pRows.Scan(&dStr, &cookName, &c1, &c2, &c3); err != nil {
			return nil, err
		}
		comps := make([]string, 0, 3)
		for _, c := range []string{c1, c2, c3} {
			trimmed := strings.TrimSpace(c)
			if trimmed != "" {
				comps = append(comps, trimmed)
			}
		}
		trimmedCook := strings.TrimSpace(cookName)
		if trimmedCook != "" || len(comps) > 0 {
			planMap[dStr] = &planRow{
				cookName:   trimmedCook,
				components: comps,
			}
			dateSet[dStr] = true
		}
	}
	if err := pRows.Err(); err != nil {
		return nil, err
	}

	allergenMap := make(map[string]*allergenRow)
	aRows, err := s.db.Query(ctx, `
		SELECT
			TO_CHAR(ma.date, 'YYYY-MM-DD'),
			COALESCE(ma.cooks, '[]'::jsonb),
			ma.cook_parent_id,
			COALESCE(p.first_name, ''),
			COALESCE(p.last_name, ''),
			COALESCE(TRIM(p.first_name || ' ' || p.last_name), ''),
			ma.cook_employee_id,
			COALESCE(e.first_name, ''),
			COALESCE(e.last_name, ''),
			COALESCE(TRIM(e.first_name || ' ' || e.last_name), ''),
			ma.cook_custom_name,
			ma.meal_components,
			ma.status,
			ma.documentation,
			ma.created_at,
			ma.updated_at
		FROM meal_allergens ma
		LEFT JOIN parents p ON ma.cook_parent_id = p.id
		LEFT JOIN employees e ON ma.cook_employee_id = e.id
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query all meal_allergens: %w", err)
	}
	defer aRows.Close()

	for aRows.Next() {
		var dStr, statusStr string
		var ar allergenRow
		if err := aRows.Scan(
			&dStr,
			&ar.cooks,
			&ar.cookParentID,
			&ar.cookParentFirst,
			&ar.cookParentLast,
			&ar.cookParentName,
			&ar.cookEmployeeID,
			&ar.cookEmpFirst,
			&ar.cookEmpLast,
			&ar.cookEmpName,
			&ar.cookCustomName,
			&ar.mealComponents,
			&statusStr,
			&ar.documentation,
			&ar.createdAt,
			&ar.updatedAt,
		); err != nil {
			return nil, err
		}
		ar.status = models.MealAllergenStatus(statusStr)
		allergenMap[dStr] = &ar
		dateSet[dStr] = true
	}
	if err := aRows.Err(); err != nil {
		return nil, err
	}

	parentNames, empNames := s.loadPersonNameMaps(ctx)

	dates := make([]string, 0, len(dateSet))
	for dStr := range dateSet {
		dates = append(dates, dStr)
	}
	sort.Slice(dates, func(i, j int) bool {
		return dates[i] > dates[j] // descending (most recent first)
	})

	result := make([]models.MealAllergenDay, 0, len(dates))
	for _, dStr := range dates {
		result = append(result, buildMealAllergenDay(dStr, planMap[dStr], allergenMap[dStr], parentNames, empNames))
	}

	return result, nil
}

func sanitizeMealComponents(in models.MealAllergenComponentList) models.MealAllergenComponentList {
	if in == nil {
		return models.MealAllergenComponentList{}
	}
	out := make(models.MealAllergenComponentList, 0, len(in))
	for _, comp := range in {
		name := strings.TrimSpace(comp.Name)
		seen := make(map[string]bool)
		allergens := make([]string, 0, len(comp.Allergens))
		for _, a := range comp.Allergens {
			trimmed := strings.TrimSpace(a)
			if trimmed != "" && !seen[trimmed] {
				seen[trimmed] = true
				allergens = append(allergens, trimmed)
			}
		}
		out = append(out, models.MealAllergenComponent{
			Name:      name,
			Allergens: allergens,
		})
	}
	return out
}

func sanitizeMealAllergenCooks(
	cooks models.MealAllergenCookList,
	cookParentID *uuid.UUID,
	cookEmployeeID *uuid.UUID,
) (models.MealAllergenCookList, *uuid.UUID, *uuid.UUID) {
	clean := make(models.MealAllergenCookList, 0, len(cooks))
	seen := make(map[string]bool)
	for _, c := range cooks {
		if c.ID == uuid.Nil {
			continue
		}
		cType := strings.ToLower(strings.TrimSpace(c.Type))
		if cType != "parent" && cType != "employee" {
			continue
		}
		key := cType + ":" + c.ID.String()
		if seen[key] {
			continue
		}
		seen[key] = true
		clean = append(clean, models.MealAllergenCook{
			ID:   c.ID,
			Type: cType,
		})
	}

	if len(clean) == 0 {
		if cookParentID != nil && *cookParentID != uuid.Nil {
			clean = append(clean, models.MealAllergenCook{
				ID:   *cookParentID,
				Type: "parent",
			})
		} else if cookEmployeeID != nil && *cookEmployeeID != uuid.Nil {
			clean = append(clean, models.MealAllergenCook{
				ID:   *cookEmployeeID,
				Type: "employee",
			})
		}
	}

	var outParentID, outEmployeeID *uuid.UUID
	if len(clean) == 1 {
		idCopy := clean[0].ID
		if clean[0].Type == "parent" {
			outParentID = &idCopy
		} else if clean[0].Type == "employee" {
			outEmployeeID = &idCopy
		}
	}
	return clean, outParentID, outEmployeeID
}

func snapshotFromMealAllergenDay(day *models.MealAllergenDay) models.MealAllergenSnapshot {
	if day == nil {
		return models.MealAllergenSnapshot{
			Cooks:          models.MealAllergenCookList{},
			MealComponents: models.MealAllergenComponentList{},
		}
	}
	comps := day.MealComponents
	if comps == nil {
		comps = models.MealAllergenComponentList{}
	}
	cooks := day.Cooks
	if cooks == nil {
		cooks = models.MealAllergenCookList{}
	}
	return models.MealAllergenSnapshot{
		Cooks:           cooks,
		CookParentID:    day.CookParentID,
		CookEmployeeID:  day.CookEmployeeID,
		CookCustomName:  day.CookCustomName,
		CookDisplayName: day.CookDisplayName,
		MealComponents:  comps,
		Status:          day.Status,
		Documentation:   day.Documentation,
	}
}

func (s *Store) recordMealAllergensHistory(
	ctx context.Context,
	dateStr string,
	op string,
	before *models.MealAllergenSnapshot,
	after models.MealAllergenSnapshot,
	actor models.MealAllergenActor,
) error {
	var beforeBytes []byte
	var err error
	if before != nil {
		beforeBytes, err = json.Marshal(before)
		if err != nil {
			return err
		}
	}
	afterBytes, err := json.Marshal(after)
	if err != nil {
		return err
	}

	var changedByID *uuid.UUID
	if !actor.IsKiosk && actor.UserID != nil && *actor.UserID != uuid.Nil {
		changedByID = actor.UserID
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO meal_allergens_history (
			cooking_date,
			operation,
			before_snapshot,
			after_snapshot,
			changed_by,
			changed_by_email,
			is_kiosk,
			kiosk_name
		) VALUES (
			$1,
			$2,
			$3,
			$4,
			(SELECT id FROM users WHERE id = $5),
			$6,
			$7,
			$8
		)
	`, dateStr, op, beforeBytes, afterBytes, changedByID, actor.Email, actor.IsKiosk, actor.KioskName)
	return err
}

func (s *Store) ListMealAllergensHistory(ctx context.Context, cookingDate string, limit int) ([]models.MealAllergensHistoryEntry, error) {
	var whereClauses []string
	var args []interface{}

	trimmedDate := strings.TrimSpace(cookingDate)
	if trimmedDate != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("h.cooking_date = $%d", len(args)+1))
		args = append(args, trimmedDate)
	}

	query := `
		SELECT
			h.id,
			TO_CHAR(h.cooking_date, 'YYYY-MM-DD'),
			h.operation,
			h.before_snapshot,
			h.after_snapshot,
			h.changed_by,
			COALESCE(NULLIF(h.changed_by_email, ''), u.email, ''),
			h.is_kiosk,
			h.kiosk_name,
			h.created_at
		FROM meal_allergens_history h
		LEFT JOIN users u ON h.changed_by = u.id
	`
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " ORDER BY h.created_at DESC, h.id DESC"

	if limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", len(args)+1)
		args = append(args, limit)
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query meal_allergens_history: %w", err)
	}
	defer rows.Close()

	entries := make([]models.MealAllergensHistoryEntry, 0)
	for rows.Next() {
		var e models.MealAllergensHistoryEntry
		var beforeRaw, afterRaw []byte
		if err := rows.Scan(
			&e.ID,
			&e.CookingDate,
			&e.Operation,
			&beforeRaw,
			&afterRaw,
			&e.ChangedBy,
			&e.ChangedByEmail,
			&e.IsKiosk,
			&e.KioskName,
			&e.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(beforeRaw) > 0 {
			rawMsg := json.RawMessage(beforeRaw)
			e.BeforeSnapshot = &rawMsg
		}
		if len(afterRaw) > 0 {
			e.AfterSnapshot = json.RawMessage(afterRaw)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (s *Store) UpsertMealAllergens(
	ctx context.Context,
	targetDate time.Time,
	cookParentID *uuid.UUID,
	cookEmployeeID *uuid.UUID,
	cookCustomName string,
	mealComponents models.MealAllergenComponentList,
	documentation models.MealAllergenDocumentation,
	explicitStatus *models.MealAllergenStatus,
	actor ...models.MealAllergenActor,
) (*models.MealAllergenDay, error) {
	return s.UpsertMealAllergensWithCooks(
		ctx,
		targetDate,
		nil,
		cookParentID,
		cookEmployeeID,
		cookCustomName,
		mealComponents,
		documentation,
		explicitStatus,
		actor...,
	)
}

func (s *Store) UpsertMealAllergensWithCooks(
	ctx context.Context,
	targetDate time.Time,
	cooks models.MealAllergenCookList,
	cookParentID *uuid.UUID,
	cookEmployeeID *uuid.UUID,
	cookCustomName string,
	mealComponents models.MealAllergenComponentList,
	documentation models.MealAllergenDocumentation,
	explicitStatus *models.MealAllergenStatus,
	actor ...models.MealAllergenActor,
) (*models.MealAllergenDay, error) {
	dateStr := targetDate.Format("2006-01-02")
	cleanComponents := sanitizeMealComponents(mealComponents)
	cleanCustomName := strings.TrimSpace(cookCustomName)
	cleanCooks, dbParentID, dbEmployeeID := sanitizeMealAllergenCooks(cooks, cookParentID, cookEmployeeID)
	documentation.PDFURL = strings.TrimSpace(documentation.PDFURL)

	existing, err := s.GetMealAllergenDay(ctx, targetDate)
	if err != nil {
		return nil, err
	}

	// Whenever a change to allergens JSONB is persisted, the status of the row should change to not_finalized,
	// unless an explicit status (such as finalized via the finalize button) is requested.
	status := models.MealAllergenStatusNotFinalized
	if explicitStatus != nil && models.IsValidMealAllergenStatus(*explicitStatus) {
		status = *explicitStatus
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO meal_allergens (
			date,
			cooks,
			cook_parent_id,
			cook_employee_id,
			cook_custom_name,
			meal_components,
			status,
			documentation
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (date) DO UPDATE SET
			cooks = EXCLUDED.cooks,
			cook_parent_id = EXCLUDED.cook_parent_id,
			cook_employee_id = EXCLUDED.cook_employee_id,
			cook_custom_name = EXCLUDED.cook_custom_name,
			meal_components = EXCLUDED.meal_components,
			status = EXCLUDED.status,
			documentation = EXCLUDED.documentation,
			updated_at = NOW()
	`, dateStr, cleanCooks, dbParentID, dbEmployeeID, cleanCustomName, cleanComponents, string(status), documentation)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert meal_allergens for %s: %w", dateStr, err)
	}

	updated, err := s.GetMealAllergenDay(ctx, targetDate)
	if err != nil {
		return nil, err
	}

	var beforeSnap *models.MealAllergenSnapshot
	op := "INSERT"
	if existing != nil && existing.HasAllergenRecord {
		op = "UPDATE"
		snap := snapshotFromMealAllergenDay(existing)
		beforeSnap = &snap
	}
	if explicitStatus != nil && *explicitStatus == models.MealAllergenStatusFinalized {
		op = "FINALIZE"
	}
	afterSnap := snapshotFromMealAllergenDay(updated)

	if op == "UPDATE" && beforeSnap != nil && reflect.DeepEqual(*beforeSnap, afterSnap) {
		return updated, nil
	}

	var act models.MealAllergenActor
	if len(actor) > 0 {
		act = actor[0]
	}
	if err := s.recordMealAllergensHistory(ctx, dateStr, op, beforeSnap, afterSnap, act); err != nil {
		return nil, fmt.Errorf("failed to record meal_allergens_history for %s: %w", dateStr, err)
	}

	if status == models.MealAllergenStatusFinalized {
		_, _ = s.CompleteTask(ctx, targetDate, "enter_allergens", act)
	} else {
		_ = s.UncompleteTask(ctx, targetDate, "enter_allergens")
	}

	return updated, nil
}

func (s *Store) FinalizeMealAllergens(ctx context.Context, targetDate time.Time, actor ...models.MealAllergenActor) (*models.MealAllergenDay, error) {
	dateStr := targetDate.Format("2006-01-02")
	existing, err := s.GetMealAllergenDay(ctx, targetDate)
	if err != nil {
		return nil, err
	}

	finalizedStatus := models.MealAllergenStatusFinalized
	if existing.HasAllergenRecord {
		_, err := s.db.Exec(ctx, `
			UPDATE meal_allergens
			SET status = $2, updated_at = NOW()
			WHERE date = $1
		`, dateStr, string(finalizedStatus))
		if err != nil {
			return nil, fmt.Errorf("failed to finalize meal_allergens for %s: %w", dateStr, err)
		}
		updated, err := s.GetMealAllergenDay(ctx, targetDate)
		if err != nil {
			return nil, err
		}
		beforeSnap := snapshotFromMealAllergenDay(existing)
		afterSnap := snapshotFromMealAllergenDay(updated)
		var act models.MealAllergenActor
		if len(actor) > 0 {
			act = actor[0]
		}
		if err := s.recordMealAllergensHistory(ctx, dateStr, "FINALIZE", &beforeSnap, afterSnap, act); err != nil {
			return nil, fmt.Errorf("failed to record meal_allergens_history for %s: %w", dateStr, err)
		}
		_, _ = s.CompleteTask(ctx, targetDate, "enter_allergens", act)
		return updated, nil
	}

	// If no row exists yet, initialize from meal plan and finalize
	initComps := make(models.MealAllergenComponentList, 0, len(existing.PlanMealComponents))
	for _, cName := range existing.PlanMealComponents {
		initComps = append(initComps, models.MealAllergenComponent{
			Name:      cName,
			Allergens: []string{},
		})
	}
	return s.UpsertMealAllergens(
		ctx,
		targetDate,
		nil,
		nil,
		existing.PlanCookName,
		initComps,
		models.MealAllergenDocumentation{},
		&finalizedStatus,
		actor...,
	)
}

func (s *Store) ListJobs(ctx context.Context) ([]models.JobWithAssignees, error) {
	query := `
		SELECT 
			j.id, j.name, j.description, j.contact_email, j.roles, j.soll_persons, j.created_at, j.updated_at,
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', p.id,
					'first_name', p.first_name,
					'last_name', p.last_name
				) ORDER BY p.last_name ASC, p.first_name ASC)
				FROM parent_jobs pj
				JOIN parents p ON p.id = pj.parent_id
				WHERE pj.job_id = j.id
			), '[]'),
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', e.id,
					'first_name', e.first_name,
					'last_name', e.last_name,
					'employee_type', e.employee_type
				) ORDER BY e.last_name ASC, e.first_name ASC)
				FROM employee_jobs ej
				JOIN employees e ON e.id = ej.employee_id
				WHERE ej.job_id = j.id
			), '[]')
		FROM jobs j
		ORDER BY j.name ASC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []models.JobWithAssignees
	for rows.Next() {
		var j models.JobWithAssignees
		var rolesRaw, parentsRaw, employeesRaw []byte
		if err := rows.Scan(
			&j.ID,
			&j.Name,
			&j.Description,
			&j.ContactEmail,
			&rolesRaw,
			&j.SollPersons,
			&j.CreatedAt,
			&j.UpdatedAt,
			&parentsRaw,
			&employeesRaw,
		); err != nil {
			return nil, err
		}
		if len(rolesRaw) > 0 {
			_ = json.Unmarshal(rolesRaw, &j.Roles)
		}
		if j.Roles == nil {
			j.Roles = []string{}
		}
		if len(parentsRaw) > 0 {
			_ = json.Unmarshal(parentsRaw, &j.Parents)
		}
		if len(employeesRaw) > 0 {
			_ = json.Unmarshal(employeesRaw, &j.Employees)
		}
		if j.Parents == nil {
			j.Parents = []models.JobAssigneeParent{}
		}
		if j.Employees == nil {
			j.Employees = []models.JobAssigneeEmployee{}
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

func (s *Store) GetJobByID(ctx context.Context, id uuid.UUID) (*models.JobWithAssignees, error) {
	query := `
		SELECT 
			j.id, j.name, j.description, j.contact_email, j.roles, j.soll_persons, j.created_at, j.updated_at,
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', p.id,
					'first_name', p.first_name,
					'last_name', p.last_name
				) ORDER BY p.last_name ASC, p.first_name ASC)
				FROM parent_jobs pj
				JOIN parents p ON p.id = pj.parent_id
				WHERE pj.job_id = j.id
			), '[]'),
			COALESCE((
				SELECT json_agg(json_build_object(
					'id', e.id,
					'first_name', e.first_name,
					'last_name', e.last_name,
					'employee_type', e.employee_type
				) ORDER BY e.last_name ASC, e.first_name ASC)
				FROM employee_jobs ej
				JOIN employees e ON e.id = ej.employee_id
				WHERE ej.job_id = j.id
			), '[]')
		FROM jobs j
		WHERE j.id = $1
	`
	var j models.JobWithAssignees
	var rolesRaw, parentsRaw, employeesRaw []byte
	err := s.db.QueryRow(ctx, query, id).Scan(
		&j.ID,
		&j.Name,
		&j.Description,
		&j.ContactEmail,
		&rolesRaw,
		&j.SollPersons,
		&j.CreatedAt,
		&j.UpdatedAt,
		&parentsRaw,
		&employeesRaw,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if len(rolesRaw) > 0 {
		_ = json.Unmarshal(rolesRaw, &j.Roles)
	}
	if j.Roles == nil {
		j.Roles = []string{}
	}
	if len(parentsRaw) > 0 {
		_ = json.Unmarshal(parentsRaw, &j.Parents)
	}
	if len(employeesRaw) > 0 {
		_ = json.Unmarshal(employeesRaw, &j.Employees)
	}
	if j.Parents == nil {
		j.Parents = []models.JobAssigneeParent{}
	}
	if j.Employees == nil {
		j.Employees = []models.JobAssigneeEmployee{}
	}
	return &j, nil
}

func (s *Store) CreateJob(ctx context.Context, userID uuid.UUID, job models.Job, userEmail ...string) (models.Job, error) {
	job.Name = strings.TrimSpace(job.Name)
	job.Description = strings.TrimSpace(job.Description)
	job.ContactEmail = strings.TrimSpace(job.ContactEmail)
	if job.SollPersons < 0 {
		job.SollPersons = 0
	}
	if job.Name == "" {
		return models.Job{}, fmt.Errorf("job name is required")
	}
	if job.Roles == nil {
		job.Roles = []string{}
	}
	rolesJSON, err := json.Marshal(job.Roles)
	if err != nil {
		return models.Job{}, fmt.Errorf("failed to marshal roles: %w", err)
	}
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}
	transactionID := uuid.New()

	var created models.Job
	var rolesRaw []byte
	err = s.WithTx(ctx, func(tx pgx.Tx) error {
		query := `
			INSERT INTO jobs (id, name, description, contact_email, roles, soll_persons)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, name, description, contact_email, roles, soll_persons, created_at, updated_at
		`
		if err := tx.QueryRow(ctx, query, job.ID, job.Name, job.Description, job.ContactEmail, rolesJSON, job.SollPersons).Scan(
			&created.ID,
			&created.Name,
			&created.Description,
			&created.ContactEmail,
			&rolesRaw,
			&created.SollPersons,
			&created.CreatedAt,
			&created.UpdatedAt,
		); err != nil {
			return err
		}
		if len(rolesRaw) > 0 {
			_ = json.Unmarshal(rolesRaw, &created.Roles)
		}
		if created.Roles == nil {
			created.Roles = []string{}
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "job", created.ID, "INSERT", nil, created, userID, userEmail...)
	})
	if err != nil {
		return models.Job{}, err
	}
	return created, nil
}

func (s *Store) UpdateJob(ctx context.Context, userID uuid.UUID, job models.Job, userEmail ...string) (models.Job, error) {
	job.Name = strings.TrimSpace(job.Name)
	job.Description = strings.TrimSpace(job.Description)
	job.ContactEmail = strings.TrimSpace(job.ContactEmail)
	if job.SollPersons < 0 {
		job.SollPersons = 0
	}
	if job.Name == "" {
		return models.Job{}, fmt.Errorf("job name is required")
	}
	transactionID := uuid.New()

	var updated models.Job
	var rolesRaw []byte
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		oldJob, err := s.GetJobByID(ctx, job.ID)
		if err != nil {
			return err
		}
		if oldJob == nil {
			return fmt.Errorf("job not found")
		}

		// If caller did not provide roles, keep old roles
		if job.Roles == nil {
			job.Roles = oldJob.Roles
		}
		if job.Roles == nil {
			job.Roles = []string{}
		}
		rolesJSON, err := json.Marshal(job.Roles)
		if err != nil {
			return fmt.Errorf("failed to marshal roles: %w", err)
		}

		query := `
			UPDATE jobs
			SET name = $1, description = $2, contact_email = $3, roles = $4, soll_persons = $5, updated_at = NOW()
			WHERE id = $6
			RETURNING id, name, description, contact_email, roles, soll_persons, created_at, updated_at
		`
		if err := tx.QueryRow(ctx, query, job.Name, job.Description, job.ContactEmail, rolesJSON, job.SollPersons, job.ID).Scan(
			&updated.ID,
			&updated.Name,
			&updated.Description,
			&updated.ContactEmail,
			&rolesRaw,
			&updated.SollPersons,
			&updated.CreatedAt,
			&updated.UpdatedAt,
		); err != nil {
			return err
		}
		if len(rolesRaw) > 0 {
			_ = json.Unmarshal(rolesRaw, &updated.Roles)
		}
		if updated.Roles == nil {
			updated.Roles = []string{}
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "job", updated.ID, "UPDATE", oldJob.Job, updated, userID, userEmail...)
	})
	if err != nil {
		return models.Job{}, err
	}
	return updated, nil
}

func (s *Store) SetJobRoles(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, roles []string, userEmail ...string) (*models.JobWithAssignees, error) {
	if roles == nil {
		roles = []string{}
	}
	rolesJSON, err := json.Marshal(roles)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal roles: %w", err)
	}

	transactionID := uuid.New()
	err = s.WithTx(ctx, func(tx pgx.Tx) error {
		oldJob, err := s.GetJobByID(ctx, jobID)
		if err != nil {
			return err
		}
		if oldJob == nil {
			return fmt.Errorf("job not found")
		}

		var updatedJob models.Job
		var rolesRaw []byte
		query := `
			UPDATE jobs
			SET roles = $1, updated_at = NOW()
			WHERE id = $2
			RETURNING id, name, description, contact_email, roles, soll_persons, created_at, updated_at
		`
		if err := tx.QueryRow(ctx, query, rolesJSON, jobID).Scan(
			&updatedJob.ID,
			&updatedJob.Name,
			&updatedJob.Description,
			&updatedJob.ContactEmail,
			&rolesRaw,
			&updatedJob.SollPersons,
			&updatedJob.CreatedAt,
			&updatedJob.UpdatedAt,
		); err != nil {
			return err
		}
		if len(rolesRaw) > 0 {
			_ = json.Unmarshal(rolesRaw, &updatedJob.Roles)
		}
		if updatedJob.Roles == nil {
			updatedJob.Roles = []string{}
		}

		return s.recordAudit(ctx, tx, transactionID, nil, "job", jobID, "UPDATE", oldJob.Job, updatedJob, userID, userEmail...)
	})
	if err != nil {
		return nil, err
	}

	return s.GetJobByID(ctx, jobID)
}

func (s *Store) DeleteJob(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		oldJob, err := s.GetJobByID(ctx, jobID)
		if err != nil {
			return err
		}
		if oldJob == nil {
			return fmt.Errorf("job not found")
		}

		var parentCount, employeeCount int
		if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM parent_jobs WHERE job_id = $1", jobID).Scan(&parentCount); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM employee_jobs WHERE job_id = $1", jobID).Scan(&employeeCount); err != nil {
			return err
		}
		totalAssigned := parentCount + employeeCount
		if totalAssigned > 0 {
			return fmt.Errorf("cannot delete job with active associations: %d persons are assigned to this job", totalAssigned)
		}

		if _, err := tx.Exec(ctx, "DELETE FROM jobs WHERE id = $1", jobID); err != nil {
			return err
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "job", jobID, "DELETE", oldJob.Job, nil, userID, userEmail...)
	})
}

func (s *Store) SetParentJobs(ctx context.Context, userID uuid.UUID, parentID uuid.UUID, jobIDs []uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var familyID uuid.UUID
		err := tx.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&familyID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return fmt.Errorf("parent not found")
			}
			return err
		}

		if _, err := tx.Exec(ctx, "DELETE FROM parent_jobs WHERE parent_id = $1", parentID); err != nil {
			return err
		}
		for _, jID := range jobIDs {
			if _, err := tx.Exec(ctx, "INSERT INTO parent_jobs (parent_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", parentID, jID); err != nil {
				return err
			}
		}
		return s.recordAudit(ctx, tx, transactionID, &familyID, "parent", parentID, "UPDATE", nil, map[string]interface{}{"assigned_job_ids": jobIDs}, userID, userEmail...)
	})
}

func (s *Store) SetEmployeeJobs(ctx context.Context, userID uuid.UUID, employeeID uuid.UUID, jobIDs []uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var exists bool
		err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM employees WHERE id = $1)", employeeID).Scan(&exists)
		if err != nil || !exists {
			return fmt.Errorf("employee not found")
		}

		if _, err := tx.Exec(ctx, "DELETE FROM employee_jobs WHERE employee_id = $1", employeeID); err != nil {
			return err
		}
		for _, jID := range jobIDs {
			if _, err := tx.Exec(ctx, "INSERT INTO employee_jobs (employee_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", employeeID, jID); err != nil {
				return err
			}
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "employee", employeeID, "UPDATE", nil, map[string]interface{}{"assigned_job_ids": jobIDs}, userID, userEmail...)
	})
}

type JobPeopleOptions struct {
	Parents   []models.JobAssigneeParent   `json:"parents"`
	Employees []models.JobAssigneeEmployee `json:"employees"`
}

func (s *Store) ListJobPeopleOptions(ctx context.Context) (JobPeopleOptions, error) {
	options := JobPeopleOptions{
		Parents:   []models.JobAssigneeParent{},
		Employees: []models.JobAssigneeEmployee{},
	}

	pRows, err := s.db.Query(ctx, `
		SELECT 
			p.id, 
			p.family_id, 
			p.first_name, 
			p.last_name,
			COALESCE((
				SELECT string_agg(DISTINCT TRIM(p2.last_name), ' / ' ORDER BY TRIM(p2.last_name) ASC)
				FROM parents p2
				WHERE p2.family_id = p.family_id AND TRIM(p2.last_name) != ''
			), 'Familie') AS family_name
		FROM parents p
		ORDER BY family_name ASC, p.first_name ASC, p.last_name ASC
	`)
	if err != nil {
		return options, fmt.Errorf("failed to query parents for jobs: %w", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var p models.JobAssigneeParent
		if err := pRows.Scan(&p.ID, &p.FamilyID, &p.FirstName, &p.LastName, &p.FamilyName); err != nil {
			return options, err
		}
		options.Parents = append(options.Parents, p)
	}
	if err := pRows.Err(); err != nil {
		return options, err
	}

	eRows, err := s.db.Query(ctx, `
		SELECT id, first_name, last_name, employee_type
		FROM employees
		ORDER BY first_name ASC, last_name ASC
	`)
	if err != nil {
		return options, fmt.Errorf("failed to query employees for jobs: %w", err)
	}
	defer eRows.Close()

	for eRows.Next() {
		var e models.JobAssigneeEmployee
		if err := eRows.Scan(&e.ID, &e.FirstName, &e.LastName, &e.EmployeeType); err != nil {
			return options, err
		}
		options.Employees = append(options.Employees, e)
	}
	if err := eRows.Err(); err != nil {
		return options, err
	}

	return options, nil
}

func (s *Store) SetJobAssignees(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, parentIDs []uuid.UUID, employeeIDs []uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var jobName string
		err := tx.QueryRow(ctx, "SELECT name FROM jobs WHERE id = $1", jobID).Scan(&jobName)
		if err != nil {
			if err == pgx.ErrNoRows {
				return fmt.Errorf("job not found")
			}
			return err
		}

		type AssigneeItem struct {
			ID   uuid.UUID `json:"id"`
			Name string    `json:"name"`
			Type string    `json:"type"`
		}

		var oldParents []AssigneeItem
		oldParentIDs := make([]uuid.UUID, 0)
		pRows, err := tx.Query(ctx, `
			SELECT p.id, p.first_name, p.last_name
			FROM parent_jobs pj
			JOIN parents p ON p.id = pj.parent_id
			WHERE pj.job_id = $1
			ORDER BY p.last_name ASC, p.first_name ASC
		`, jobID)
		if err != nil {
			return err
		}
		for pRows.Next() {
			var id uuid.UUID
			var first, last string
			if err := pRows.Scan(&id, &first, &last); err != nil {
				pRows.Close()
				return err
			}
			name := strings.TrimSpace(first + " " + last)
			oldParents = append(oldParents, AssigneeItem{ID: id, Name: name, Type: "parent"})
			oldParentIDs = append(oldParentIDs, id)
		}
		pRows.Close()
		if err := pRows.Err(); err != nil {
			return err
		}

		var oldEmployees []AssigneeItem
		oldEmployeeIDs := make([]uuid.UUID, 0)
		eRows, err := tx.Query(ctx, `
			SELECT e.id, e.first_name, e.last_name
			FROM employee_jobs ej
			JOIN employees e ON e.id = ej.employee_id
			WHERE ej.job_id = $1
			ORDER BY e.last_name ASC, e.first_name ASC
		`, jobID)
		if err != nil {
			return err
		}
		for eRows.Next() {
			var id uuid.UUID
			var first, last string
			if err := eRows.Scan(&id, &first, &last); err != nil {
				eRows.Close()
				return err
			}
			name := strings.TrimSpace(first + " " + last)
			oldEmployees = append(oldEmployees, AssigneeItem{ID: id, Name: name, Type: "employee"})
			oldEmployeeIDs = append(oldEmployeeIDs, id)
		}
		eRows.Close()
		if err := eRows.Err(); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, "DELETE FROM parent_jobs WHERE job_id = $1", jobID); err != nil {
			return err
		}
		for _, pID := range parentIDs {
			if _, err := tx.Exec(ctx, "INSERT INTO parent_jobs (parent_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", pID, jobID); err != nil {
				return err
			}
		}

		if _, err := tx.Exec(ctx, "DELETE FROM employee_jobs WHERE job_id = $1", jobID); err != nil {
			return err
		}
		for _, eID := range employeeIDs {
			if _, err := tx.Exec(ctx, "INSERT INTO employee_jobs (employee_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", eID, jobID); err != nil {
				return err
			}
		}

		var newParents []AssigneeItem
		if len(parentIDs) > 0 {
			npRows, err := tx.Query(ctx, `
				SELECT id, first_name, last_name
				FROM parents
				WHERE id = ANY($1)
				ORDER BY last_name ASC, first_name ASC
			`, parentIDs)
			if err != nil {
				return err
			}
			for npRows.Next() {
				var id uuid.UUID
				var first, last string
				if err := npRows.Scan(&id, &first, &last); err != nil {
					npRows.Close()
					return err
				}
				name := strings.TrimSpace(first + " " + last)
				newParents = append(newParents, AssigneeItem{ID: id, Name: name, Type: "parent"})
			}
			npRows.Close()
			if err := npRows.Err(); err != nil {
				return err
			}
		}

		var newEmployees []AssigneeItem
		if len(employeeIDs) > 0 {
			neRows, err := tx.Query(ctx, `
				SELECT id, first_name, last_name
				FROM employees
				WHERE id = ANY($1)
				ORDER BY last_name ASC, first_name ASC
			`, employeeIDs)
			if err != nil {
				return err
			}
			for neRows.Next() {
				var id uuid.UUID
				var first, last string
				if err := neRows.Scan(&id, &first, &last); err != nil {
					neRows.Close()
					return err
				}
				name := strings.TrimSpace(first + " " + last)
				newEmployees = append(newEmployees, AssigneeItem{ID: id, Name: name, Type: "employee"})
			}
			neRows.Close()
			if err := neRows.Err(); err != nil {
				return err
			}
		}

		oldMap := make(map[uuid.UUID]AssigneeItem)
		for _, item := range oldParents {
			oldMap[item.ID] = item
		}
		for _, item := range oldEmployees {
			oldMap[item.ID] = item
		}

		newMap := make(map[uuid.UUID]AssigneeItem)
		for _, item := range newParents {
			newMap[item.ID] = item
		}
		for _, item := range newEmployees {
			newMap[item.ID] = item
		}

		var added []AssigneeItem
		for _, item := range newParents {
			if _, exists := oldMap[item.ID]; !exists {
				added = append(added, item)
			}
		}
		for _, item := range newEmployees {
			if _, exists := oldMap[item.ID]; !exists {
				added = append(added, item)
			}
		}

		var removed []AssigneeItem
		for _, item := range oldParents {
			if _, exists := newMap[item.ID]; !exists {
				removed = append(removed, item)
			}
		}
		for _, item := range oldEmployees {
			if _, exists := oldMap[item.ID]; !exists {
				removed = append(removed, item)
			}
		}

		beforeSnapshot := map[string]interface{}{
			"job_id":       jobID,
			"job_name":     jobName,
			"name":         jobName,
			"parent_ids":   oldParentIDs,
			"employee_ids": oldEmployeeIDs,
			"parents":      oldParents,
			"employees":    oldEmployees,
		}

		afterSnapshot := map[string]interface{}{
			"job_id":       jobID,
			"job_name":     jobName,
			"name":         jobName,
			"parent_ids":   parentIDs,
			"employee_ids": employeeIDs,
			"parents":      newParents,
			"employees":    newEmployees,
			"added":        added,
			"removed":      removed,
		}

		return s.recordAudit(ctx, tx, transactionID, nil, "job", jobID, "UPDATE_ASSIGNEES", beforeSnapshot, afterSnapshot, userID, userEmail...)
	})
}

func (s *Store) CreateFeedback(ctx context.Context, feedbackType, description, contactName string, actor models.MealAllergenActor) (*models.Feedback, error) {
	var f models.Feedback
	err := s.db.QueryRow(ctx, `
		INSERT INTO feedback (feedback_type, description, contact_name, submitted_by, submitted_by_email, is_kiosk, kiosk_name, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		RETURNING id, feedback_type, description, contact_name, submitted_by, submitted_by_email, is_kiosk, kiosk_name, created_at
	`, feedbackType, description, contactName, actor.UserID, actor.Email, actor.IsKiosk, actor.KioskName).Scan(
		&f.ID,
		&f.FeedbackType,
		&f.Description,
		&f.ContactName,
		&f.SubmittedBy,
		&f.SubmittedByEmail,
		&f.IsKiosk,
		&f.KioskName,
		&f.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create feedback: %w", err)
	}
	return &f, nil
}

func (s *Store) ListFeedback(ctx context.Context, limit int) ([]models.Feedback, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, feedback_type, description, contact_name, submitted_by, submitted_by_email, is_kiosk, kiosk_name, created_at
		FROM feedback
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list feedback: %w", err)
	}
	defer rows.Close()

	list := make([]models.Feedback, 0)
	for rows.Next() {
		var f models.Feedback
		if err := rows.Scan(
			&f.ID,
			&f.FeedbackType,
			&f.Description,
			&f.ContactName,
			&f.SubmittedBy,
			&f.SubmittedByEmail,
			&f.IsKiosk,
			&f.KioskName,
			&f.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan feedback: %w", err)
		}
		list = append(list, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error listing feedback: %w", err)
	}
	return list, nil
}





