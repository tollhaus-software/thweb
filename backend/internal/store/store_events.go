package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

var (
	ErrCalendarEventNotFound = errors.New("calendar event not found")
	timeHHMMRegex            = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
)

func normalizeTimePtr(t *string) (*string, error) {
	if t == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*t)
	if trimmed == "" {
		return nil, nil
	}
	// Accept HH:MM:SS from HTML/SQL inputs by normalizing to HH:MM when seconds are 00..59
	if len(trimmed) == 8 && trimmed[2] == ':' && trimmed[5] == ':' {
		trimmed = trimmed[:5]
	}
	if !timeHHMMRegex.MatchString(trimmed) {
		return nil, fmt.Errorf("invalid time format %q (expected HH:MM)", trimmed)
	}
	return &trimmed, nil
}

func normalizeAndValidateCalendarEvent(ev *models.CalendarEvent) error {
	ev.EventType = strings.TrimSpace(ev.EventType)
	ev.Title = strings.TrimSpace(ev.Title)
	ev.Description = strings.TrimSpace(ev.Description)
	ev.Location = strings.TrimSpace(ev.Location)
	ev.StartDate = strings.TrimSpace(ev.StartDate)
	ev.EndDate = strings.TrimSpace(ev.EndDate)

	if !models.ValidCalendarEventTypes[ev.EventType] {
		return fmt.Errorf("invalid event_type: %s", ev.EventType)
	}
	if ev.EventType == "custom" && ev.Title == "" {
		return fmt.Errorf("title is required when event_type is custom")
	}

	startDate, err := time.Parse("2006-01-02", ev.StartDate)
	if err != nil {
		return fmt.Errorf("invalid start_date format (expected YYYY-MM-DD): %w", err)
	}
	if ev.EndDate == "" {
		ev.EndDate = ev.StartDate
	}
	endDate, err := time.Parse("2006-01-02", ev.EndDate)
	if err != nil {
		return fmt.Errorf("invalid end_date format (expected YYYY-MM-DD): %w", err)
	}
	if endDate.Before(startDate) {
		return fmt.Errorf("end_date must be on or after start_date")
	}

	startTime, err := normalizeTimePtr(ev.StartTime)
	if err != nil {
		return fmt.Errorf("invalid start_time: %w", err)
	}
	endTime, err := normalizeTimePtr(ev.EndTime)
	if err != nil {
		return fmt.Errorf("invalid end_time: %w", err)
	}
	if startTime == nil && endTime != nil {
		return fmt.Errorf("end_time cannot be set without start_time")
	}
	if startTime != nil && endTime != nil && ev.StartDate == ev.EndDate && *endTime < *startTime {
		return fmt.Errorf("end_time must be on or after start_time")
	}
	ev.StartTime = startTime
	ev.EndTime = endTime
	return nil
}

func actorEmailFromSlice(userEmail []string) string {
	if len(userEmail) > 0 {
		return strings.TrimSpace(userEmail[0])
	}
	return ""
}

func (s *Store) ListCalendarEvents(ctx context.Context, startDate, endDate string) ([]models.CalendarEvent, error) {
	if s == nil || s.db == nil {
		return []models.CalendarEvent{}, nil
	}
	startDate = strings.TrimSpace(startDate)
	endDate = strings.TrimSpace(endDate)

	var (
		rows pgx.Rows
		err  error
	)

	const selectCols = `
		id,
		event_type,
		title,
		description,
		location,
		TO_CHAR(start_date, 'YYYY-MM-DD'),
		TO_CHAR(end_date, 'YYYY-MM-DD'),
		TO_CHAR(start_time, 'HH24:MI'),
		TO_CHAR(end_time, 'HH24:MI'),
		created_by_email,
		updated_by_email,
		created_at,
		updated_at
	`

	if startDate != "" && endDate != "" {
		if _, err := time.Parse("2006-01-02", startDate); err != nil {
			return nil, fmt.Errorf("invalid start_date format (expected YYYY-MM-DD): %w", err)
		}
		if _, err := time.Parse("2006-01-02", endDate); err != nil {
			return nil, fmt.Errorf("invalid end_date format (expected YYYY-MM-DD): %w", err)
		}
		rows, err = s.db.Query(ctx, `
			SELECT `+selectCols+`
			FROM calendar_events
			WHERE start_date <= $2::date AND end_date >= $1::date
			ORDER BY start_date ASC, start_time ASC NULLS FIRST, end_date DESC, created_at ASC
		`, startDate, endDate)
	} else {
		rows, err = s.db.Query(ctx, `
			SELECT `+selectCols+`
			FROM calendar_events
			ORDER BY start_date ASC, start_time ASC NULLS FIRST, end_date DESC, created_at ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]models.CalendarEvent, 0)
	for rows.Next() {
		var ev models.CalendarEvent
		if err := rows.Scan(
			&ev.ID,
			&ev.EventType,
			&ev.Title,
			&ev.Description,
			&ev.Location,
			&ev.StartDate,
			&ev.EndDate,
			&ev.StartTime,
			&ev.EndTime,
			&ev.CreatedByEmail,
			&ev.UpdatedByEmail,
			&ev.CreatedAt,
			&ev.UpdatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func (s *Store) GetCalendarEventByID(ctx context.Context, id uuid.UUID) (*models.CalendarEvent, error) {
	var ev models.CalendarEvent
	err := s.db.QueryRow(ctx, `
		SELECT
			id,
			event_type,
			title,
			description,
			location,
			TO_CHAR(start_date, 'YYYY-MM-DD'),
			TO_CHAR(end_date, 'YYYY-MM-DD'),
			TO_CHAR(start_time, 'HH24:MI'),
			TO_CHAR(end_time, 'HH24:MI'),
			created_by_email,
			updated_by_email,
			created_at,
			updated_at
		FROM calendar_events
		WHERE id = $1
	`, id).Scan(
		&ev.ID,
		&ev.EventType,
		&ev.Title,
		&ev.Description,
		&ev.Location,
		&ev.StartDate,
		&ev.EndDate,
		&ev.StartTime,
		&ev.EndTime,
		&ev.CreatedByEmail,
		&ev.UpdatedByEmail,
		&ev.CreatedAt,
		&ev.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &ev, nil
}

func insertCalendarEventTx(ctx context.Context, tx pgx.Tx, ev models.CalendarEvent, email string) (models.CalendarEvent, error) {
	if ev.ID == uuid.Nil {
		ev.ID = uuid.New()
	}
	var created models.CalendarEvent
	err := tx.QueryRow(ctx, `
		INSERT INTO calendar_events (
			id, event_type, title, description, location,
			start_date, end_date, start_time, end_time,
			created_by_email, updated_by_email
		)
		VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::time, $9::time, $10, $10)
		RETURNING
			id,
			event_type,
			title,
			description,
			location,
			TO_CHAR(start_date, 'YYYY-MM-DD'),
			TO_CHAR(end_date, 'YYYY-MM-DD'),
			TO_CHAR(start_time, 'HH24:MI'),
			TO_CHAR(end_time, 'HH24:MI'),
			created_by_email,
			updated_by_email,
			created_at,
			updated_at
	`,
		ev.ID,
		ev.EventType,
		ev.Title,
		ev.Description,
		ev.Location,
		ev.StartDate,
		ev.EndDate,
		ev.StartTime,
		ev.EndTime,
		email,
	).Scan(
		&created.ID,
		&created.EventType,
		&created.Title,
		&created.Description,
		&created.Location,
		&created.StartDate,
		&created.EndDate,
		&created.StartTime,
		&created.EndTime,
		&created.CreatedByEmail,
		&created.UpdatedByEmail,
		&created.CreatedAt,
		&created.UpdatedAt,
	)
	return created, err
}

func (s *Store) CreateCalendarEvent(ctx context.Context, userID uuid.UUID, ev models.CalendarEvent, userEmail ...string) (models.CalendarEvent, error) {
	if err := normalizeAndValidateCalendarEvent(&ev); err != nil {
		return models.CalendarEvent{}, err
	}
	email := actorEmailFromSlice(userEmail)
	transactionID := uuid.New()

	var created models.CalendarEvent
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		var txErr error
		created, txErr = insertCalendarEventTx(ctx, tx, ev, email)
		if txErr != nil {
			return txErr
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "calendar_event", created.ID, "INSERT", nil, created, userID, userEmail...)
	})
	if err != nil {
		return models.CalendarEvent{}, err
	}
	return created, nil
}

func (s *Store) UpdateCalendarEvent(ctx context.Context, userID uuid.UUID, ev models.CalendarEvent, userEmail ...string) (models.CalendarEvent, error) {
	if ev.ID == uuid.Nil {
		return models.CalendarEvent{}, fmt.Errorf("invalid calendar event ID")
	}
	if err := normalizeAndValidateCalendarEvent(&ev); err != nil {
		return models.CalendarEvent{}, err
	}
	email := actorEmailFromSlice(userEmail)
	transactionID := uuid.New()

	var updated models.CalendarEvent
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		existing, err := s.GetCalendarEventByID(ctx, ev.ID)
		if err != nil {
			return err
		}
		if existing == nil {
			return ErrCalendarEventNotFound
		}

		// Preserve reserved location if not supplied in edit form
		loc := ev.Location
		if loc == "" && existing.Location != "" {
			loc = existing.Location
		}

		err = tx.QueryRow(ctx, `
			UPDATE calendar_events
			SET event_type = $1,
			    title = $2,
			    description = $3,
			    location = $4,
			    start_date = $5::date,
			    end_date = $6::date,
			    start_time = $7::time,
			    end_time = $8::time,
			    updated_by_email = $9
			WHERE id = $10
			RETURNING
				id,
				event_type,
				title,
				description,
				location,
				TO_CHAR(start_date, 'YYYY-MM-DD'),
				TO_CHAR(end_date, 'YYYY-MM-DD'),
				TO_CHAR(start_time, 'HH24:MI'),
				TO_CHAR(end_time, 'HH24:MI'),
				created_by_email,
				updated_by_email,
				created_at,
				updated_at
		`,
			ev.EventType,
			ev.Title,
			ev.Description,
			loc,
			ev.StartDate,
			ev.EndDate,
			ev.StartTime,
			ev.EndTime,
			email,
			ev.ID,
		).Scan(
			&updated.ID,
			&updated.EventType,
			&updated.Title,
			&updated.Description,
			&updated.Location,
			&updated.StartDate,
			&updated.EndDate,
			&updated.StartTime,
			&updated.EndTime,
			&updated.CreatedByEmail,
			&updated.UpdatedByEmail,
			&updated.CreatedAt,
			&updated.UpdatedAt,
		)
		if err != nil {
			return err
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "calendar_event", updated.ID, "UPDATE", *existing, updated, userID, userEmail...)
	})
	if err != nil {
		return models.CalendarEvent{}, err
	}
	return updated, nil
}

func (s *Store) DeleteCalendarEvent(ctx context.Context, userID uuid.UUID, id uuid.UUID, userEmail ...string) error {
	transactionID := uuid.New()
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		existing, err := s.GetCalendarEventByID(ctx, id)
		if err != nil {
			return err
		}
		if existing == nil {
			return ErrCalendarEventNotFound
		}

		if _, err := tx.Exec(ctx, "DELETE FROM calendar_events WHERE id = $1", id); err != nil {
			return err
		}
		return s.recordAudit(ctx, tx, transactionID, nil, "calendar_event", id, "DELETE", *existing, nil, userID, userEmail...)
	})
}

func calendarEventDedupKey(ev models.CalendarEvent) string {
	st := ""
	if ev.StartTime != nil {
		st = *ev.StartTime
	}
	return fmt.Sprintf("%s|%s|%s|%s|%s",
		ev.EventType,
		ev.StartDate,
		ev.EndDate,
		st,
		strings.ToLower(strings.TrimSpace(ev.Title)),
	)
}

func (s *Store) ImportCalendarEvents(ctx context.Context, userID uuid.UUID, req models.ImportCalendarEventsRequest, userEmail ...string) (models.ImportCalendarEventsResponse, error) {
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "skip_duplicates"
	}
	if mode != "skip_duplicates" && mode != "replace_range" {
		return models.ImportCalendarEventsResponse{}, fmt.Errorf("invalid import mode %q (expected skip_duplicates or replace_range)", mode)
	}
	if len(req.Events) == 0 && mode != "replace_range" {
		return models.ImportCalendarEventsResponse{Events: []models.CalendarEvent{}}, nil
	}

	normalized := make([]models.CalendarEvent, len(req.Events))
	minStart := ""
	maxEnd := ""
	for i := range req.Events {
		ev := req.Events[i]
		if err := normalizeAndValidateCalendarEvent(&ev); err != nil {
			return models.ImportCalendarEventsResponse{}, fmt.Errorf("row %d: %w", i+1, err)
		}
		normalized[i] = ev
		if minStart == "" || ev.StartDate < minStart {
			minStart = ev.StartDate
		}
		if maxEnd == "" || ev.EndDate > maxEnd {
			maxEnd = ev.EndDate
		}
	}

	replaceStart := strings.TrimSpace(req.ReplaceStartDate)
	replaceEnd := strings.TrimSpace(req.ReplaceEndDate)
	if mode == "replace_range" {
		if replaceStart == "" {
			replaceStart = minStart
		}
		if replaceEnd == "" {
			replaceEnd = maxEnd
		}
		rs, err := time.Parse("2006-01-02", replaceStart)
		if err != nil {
			return models.ImportCalendarEventsResponse{}, fmt.Errorf("invalid replace_start_date: %w", err)
		}
		re, err := time.Parse("2006-01-02", replaceEnd)
		if err != nil {
			return models.ImportCalendarEventsResponse{}, fmt.Errorf("invalid replace_end_date: %w", err)
		}
		if re.Before(rs) {
			return models.ImportCalendarEventsResponse{}, fmt.Errorf("replace_end_date must be on or after replace_start_date")
		}
	}

	email := actorEmailFromSlice(userEmail)
	transactionID := uuid.New()
	resp := models.ImportCalendarEventsResponse{
		Events: make([]models.CalendarEvent, 0, len(normalized)),
	}

	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		seenKeys := make(map[string]bool)

		if mode == "replace_range" {
			rows, err := tx.Query(ctx, `
				SELECT
					id,
					event_type,
					title,
					description,
					location,
					TO_CHAR(start_date, 'YYYY-MM-DD'),
					TO_CHAR(end_date, 'YYYY-MM-DD'),
					TO_CHAR(start_time, 'HH24:MI'),
					TO_CHAR(end_time, 'HH24:MI'),
					created_by_email,
					updated_by_email,
					created_at,
					updated_at
				FROM calendar_events
				WHERE start_date <= $2::date AND end_date >= $1::date
				FOR UPDATE
			`, replaceStart, replaceEnd)
			if err != nil {
				return err
			}
			toDelete := make([]models.CalendarEvent, 0)
			for rows.Next() {
				var old models.CalendarEvent
				if err := rows.Scan(
					&old.ID,
					&old.EventType,
					&old.Title,
					&old.Description,
					&old.Location,
					&old.StartDate,
					&old.EndDate,
					&old.StartTime,
					&old.EndTime,
					&old.CreatedByEmail,
					&old.UpdatedByEmail,
					&old.CreatedAt,
					&old.UpdatedAt,
				); err != nil {
					rows.Close()
					return err
				}
				toDelete = append(toDelete, old)
			}
			if err := rows.Err(); err != nil {
				rows.Close()
				return err
			}
			rows.Close()

			for _, old := range toDelete {
				if _, err := tx.Exec(ctx, "DELETE FROM calendar_events WHERE id = $1", old.ID); err != nil {
					return err
				}
				if err := s.recordAudit(ctx, tx, transactionID, nil, "calendar_event", old.ID, "DELETE", old, nil, userID, userEmail...); err != nil {
					return err
				}
				resp.DeletedCount++
			}
		} else if minStart != "" && maxEnd != "" {
			rows, err := tx.Query(ctx, `
				SELECT
					event_type,
					title,
					TO_CHAR(start_date, 'YYYY-MM-DD'),
					TO_CHAR(end_date, 'YYYY-MM-DD'),
					TO_CHAR(start_time, 'HH24:MI')
				FROM calendar_events
				WHERE start_date <= $2::date AND end_date >= $1::date
			`, minStart, maxEnd)
			if err != nil {
				return err
			}
			for rows.Next() {
				var existing models.CalendarEvent
				if err := rows.Scan(
					&existing.EventType,
					&existing.Title,
					&existing.StartDate,
					&existing.EndDate,
					&existing.StartTime,
				); err != nil {
					rows.Close()
					return err
				}
				seenKeys[calendarEventDedupKey(existing)] = true
			}
			if err := rows.Err(); err != nil {
				rows.Close()
				return err
			}
			rows.Close()
		}

		for _, ev := range normalized {
			key := calendarEventDedupKey(ev)
			if seenKeys[key] {
				resp.SkippedCount++
				continue
			}
			seenKeys[key] = true

			created, err := insertCalendarEventTx(ctx, tx, ev, email)
			if err != nil {
				return err
			}
			if err := s.recordAudit(ctx, tx, transactionID, nil, "calendar_event", created.ID, "INSERT", nil, created, userID, userEmail...); err != nil {
				return err
			}
			resp.CreatedCount++
			resp.Events = append(resp.Events, created)
		}
		return nil
	})
	if err != nil {
		return models.ImportCalendarEventsResponse{}, err
	}
	return resp, nil
}

func requiredGroupForEventType(eventType string) int {
	switch eventType {
	case "ea_kleine_gruppe":
		return 1
	case "ea_grosse_gruppe":
		return 2
	case "ea_hort":
		return 3
	default:
		return 0
	}
}

func (s *Store) GetFamilyIDByParentID(ctx context.Context, parentID uuid.UUID) (*uuid.UUID, error) {
	if s == nil || s.db == nil || parentID == uuid.Nil {
		return nil, nil
	}
	var famID uuid.UUID
	err := s.db.QueryRow(ctx, "SELECT family_id FROM parents WHERE id = $1", parentID).Scan(&famID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &famID, nil
}

func (s *Store) familyHasChildInGroupOnDate(ctx context.Context, familyID uuid.UUID, onDate string, targetGroup int) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM children c
			WHERE c.family_id = $1
			  AND COALESCE(
			      (
			          SELECT gc.target_group
			          FROM children_group_changes gc
			          WHERE gc.child = c.id AND gc.change_date <= $2::date
			          ORDER BY gc.change_date DESC
			          LIMIT 1
			      ),
			      (
			          SELECT gc.target_group
			          FROM children_group_changes gc
			          WHERE gc.child = c.id AND gc.target_group > 0
			          ORDER BY gc.change_date ASC
			          LIMIT 1
			      )
			  ) = $3
		)
	`, familyID, onDate, targetGroup).Scan(&exists)
	return exists, err
}

func (s *Store) GetMyUpcomingEventsWithCalendar(
	ctx context.Context,
	fromDate time.Time,
	parentID, employeeID, familyID *uuid.UUID,
	canReadEvents bool,
	includeAllGroupEAs bool,
) ([]models.UpcomingEvent, error) {
	events, err := s.GetMyUpcomingEvents(ctx, fromDate, parentID, employeeID)
	if err != nil {
		return nil, err
	}
	if !canReadEvents || s == nil || s.db == nil {
		return events, nil
	}

	fromStr := fromDate.Format("2006-01-02")
	untilStr := fromDate.AddDate(0, 0, 30).Format("2006-01-02")

	rows, err := s.db.Query(ctx, `
		SELECT
			id,
			event_type,
			title,
			description,
			TO_CHAR(start_date, 'YYYY-MM-DD'),
			TO_CHAR(end_date, 'YYYY-MM-DD'),
			TO_CHAR(start_time, 'HH24:MI'),
			TO_CHAR(end_time, 'HH24:MI')
		FROM calendar_events
		WHERE end_date >= $1::date
		  AND start_date <= $2::date
		  AND event_type <> 'ferien'
		ORDER BY start_date ASC, start_time ASC NULLS FIRST, created_at ASC
	`, fromStr, untilStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query upcoming calendar events: %w", err)
	}
	defer rows.Close()

	calEvents := make([]models.CalendarEvent, 0)
	for rows.Next() {
		var ev models.CalendarEvent
		if err := rows.Scan(
			&ev.ID,
			&ev.EventType,
			&ev.Title,
			&ev.Description,
			&ev.StartDate,
			&ev.EndDate,
			&ev.StartTime,
			&ev.EndTime,
		); err != nil {
			return nil, err
		}
		calEvents = append(calEvents, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	for _, ev := range calEvents {
		reqGroup := requiredGroupForEventType(ev.EventType)
		if reqGroup > 0 && !includeAllGroupEAs {
			if familyID == nil || *familyID == uuid.Nil {
				continue
			}
			ok, err := s.familyHasChildInGroupOnDate(ctx, *familyID, ev.StartDate, reqGroup)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
		}

		events = append(events, models.UpcomingEvent{
			Type:        string(models.UpcomingEventCalendarEvent),
			Date:        ev.StartDate,
			ID:          ev.ID.String(),
			EventType:   ev.EventType,
			EndDate:     ev.EndDate,
			StartTime:   ev.StartTime,
			EndTime:     ev.EndTime,
			Title:       ev.Title,
			Description: ev.Description,
		})
	}

	sort.SliceStable(events, func(i, j int) bool {
		effI := events[i].Date
		if effI < fromStr {
			effI = fromStr
		}
		effJ := events[j].Date
		if effJ < fromStr {
			effJ = fromStr
		}
		if effI != effJ {
			return effI < effJ
		}
		if events[i].Date != events[j].Date {
			return events[i].Date < events[j].Date
		}
		ti := ""
		if events[i].StartTime != nil {
			ti = *events[i].StartTime
		}
		tj := ""
		if events[j].StartTime != nil {
			tj = *events[j].StartTime
		}
		if ti != tj {
			return ti < tj
		}
		return events[i].Type < events[j].Type
	})

	return events, nil
}
