package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/audit"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func TestCalendarEvents_CRUD_Import_And_UpcomingFiltering(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	// Ensure latest migrations (including 00032_create_calendar_events_table.sql) are applied
	database.ApplySchemaMigrations(ctx, dbURL)

	appStore := store.NewStore(pool)
	hub := NewHub()
	go hub.Run()
	server := &Server{
		Store: appStore,
		Hub:   hub,
	}

	r := chi.NewRouter()
	r.Get("/api/me/upcoming-events", server.HandleGetMyUpcomingEvents)
	r.With(auth.RequirePermission("events.all.read")).Get("/api/events", server.HandleListCalendarEvents)
	r.With(auth.RequirePermission("events.all.write")).Post("/api/events", server.HandleCreateCalendarEvent)
	r.With(auth.RequirePermission("events.all.import")).Post("/api/events/import", server.HandleImportCalendarEvents)
	r.With(auth.RequirePermission("events.all.write")).Put("/api/events/{id}", server.HandleUpdateCalendarEvent)
	r.With(auth.RequirePermission("events.all.write")).Delete("/api/events/{id}", server.HandleDeleteCalendarEvent)

	uForbidden := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "forbidden-events@example.com",
		EffectivePermissions: []string{"families.all.read"},
	}
	uReader := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "reader-events@example.com",
		EffectivePermissions: []string{"events.all.read"},
	}
	uWriter := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                fmt.Sprintf("writer-events-%s@example.com", uuid.New().String()[:8]),
		EffectivePermissions: []string{"events.all.write", "events.all.import"},
	}
	uWriter.EnsureImpliedPermissions()
	uWriterNoImport := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "writer-no-import@example.com",
		EffectivePermissions: []string{"events.all.write"},
	}
	uWriterNoImport.EnsureImpliedPermissions()

	if _, err := pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", uWriter.ID, uWriter.Email); err != nil {
		t.Fatalf("failed to insert test writer user: %v", err)
	}

	// Seed a test family with a child in Kleine Gruppe (group 1) for upcoming-events group filtering
	famID := uuid.New()
	parentID := uuid.New()
	childID := uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID); err != nil {
		t.Fatalf("failed to insert test family: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO parents (id, family_id, first_name, last_name) VALUES ($1, $2, 'Anna', 'Test')", parentID, famID); err != nil {
		t.Fatalf("failed to insert test parent: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO children (id, family_id, first_name, last_name, birth_date) VALUES ($1, $2, 'Leo', 'Test', '2094-03-01')", childID, famID); err != nil {
		t.Fatalf("failed to insert test child: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO children_group_changes (id, child, change_date, target_group) VALUES ($1, $2, '2097-09-01', 1)", uuid.New(), childID); err != nil {
		t.Fatalf("failed to insert child group change: %v", err)
	}

	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM calendar_events WHERE start_date >= '2097-01-01' AND start_date <= '2098-12-31'")
		_, _ = pool.Exec(ctx, "DELETE FROM audit_log WHERE entity_type = 'calendar_event' AND changed_by = $1", uWriter.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", famID)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", uWriter.ID)
	}()

	// 1. Permission checks
	reqGet := httptest.NewRequest("GET", "/api/events?start_date=2097-10-01&end_date=2097-10-31", nil)
	recForbid := httptest.NewRecorder()
	r.ServeHTTP(recForbid, reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, uForbidden)))
	if recForbid.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for user without events.all.read, got %d", recForbid.Code)
	}

	reqPostNoPerm := httptest.NewRequest("POST", "/api/events", strings.NewReader(`{"event_type":"sommerfest","start_date":"2097-10-10","end_date":"2097-10-10"}`))
	recPostNoPerm := httptest.NewRecorder()
	r.ServeHTTP(recPostNoPerm, reqPostNoPerm.WithContext(context.WithValue(reqPostNoPerm.Context(), auth.UserContextKey, uReader)))
	if recPostNoPerm.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for reader posting event, got %d", recPostNoPerm.Code)
	}

	reqImportNoPerm := httptest.NewRequest("POST", "/api/events/import", strings.NewReader(`{"mode":"skip_duplicates","events":[]}`))
	recImportNoPerm := httptest.NewRecorder()
	r.ServeHTTP(recImportNoPerm, reqImportNoPerm.WithContext(context.WithValue(reqImportNoPerm.Context(), auth.UserContextKey, uWriterNoImport)))
	if recImportNoPerm.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for writer without events.all.import importing events, got %d", recImportNoPerm.Code)
	}

	// 2. Validation checks: custom without title -> 400, end_time without start_time -> 400
	reqInvalidCustom := httptest.NewRequest("POST", "/api/events", strings.NewReader(`{"event_type":"custom","start_date":"2097-10-10","end_date":"2097-10-10","title":""}`))
	recInvalidCustom := httptest.NewRecorder()
	r.ServeHTTP(recInvalidCustom, reqInvalidCustom.WithContext(context.WithValue(reqInvalidCustom.Context(), auth.UserContextKey, uWriter)))
	if recInvalidCustom.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for custom event without title, got %d: %s", recInvalidCustom.Code, recInvalidCustom.Body.String())
	}

	reqInvalidTime := httptest.NewRequest("POST", "/api/events", strings.NewReader(`{"event_type":"ea_gesamt","start_date":"2097-10-10","end_date":"2097-10-10","end_time":"21:00"}`))
	recInvalidTime := httptest.NewRecorder()
	r.ServeHTTP(recInvalidTime, reqInvalidTime.WithContext(context.WithValue(reqInvalidTime.Context(), auth.UserContextKey, uWriter)))
	if recInvalidTime.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for end_time without start_time, got %d", recInvalidTime.Code)
	}

	reqInvalidMultiDay := httptest.NewRequest("POST", "/api/events", strings.NewReader(`{"event_type":"ea_gesamt","start_date":"2097-10-10","end_date":"2097-10-11"}`))
	recInvalidMultiDay := httptest.NewRecorder()
	r.ServeHTTP(recInvalidMultiDay, reqInvalidMultiDay.WithContext(context.WithValue(reqInvalidMultiDay.Context(), auth.UserContextKey, uWriter)))
	if recInvalidMultiDay.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for multi-day event of type expecting specific time, got %d: %s", recInvalidMultiDay.Code, recInvalidMultiDay.Body.String())
	}

	// 3. Create timed event + update + delete
	createBody := `{"event_type":"ea_kleine_gruppe","start_date":"2097-10-12","end_date":"2097-10-12","start_time":"19:30","end_time":"21:30","description":"Kennenlernen"}`
	reqCreate := httptest.NewRequest("POST", "/api/events", strings.NewReader(createBody))
	recCreate := httptest.NewRecorder()
	r.ServeHTTP(recCreate, reqCreate.WithContext(context.WithValue(reqCreate.Context(), auth.UserContextKey, uWriter)))
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create, got %d: %s", recCreate.Code, recCreate.Body.String())
	}

	var created models.CalendarEvent
	if err := json.Unmarshal(recCreate.Body.Bytes(), &created); err != nil {
		t.Fatalf("unmarshal created failed: %v", err)
	}
	if created.StartTime == nil || *created.StartTime != "19:30" || created.EndTime == nil || *created.EndTime != "21:30" {
		t.Fatalf("unexpected created times: %+v", created)
	}

	// Verify audit policy visibility
	if !audit.CanUserViewEntity(uReader, "calendar_event", nil) {
		t.Errorf("expected uReader to view calendar_event audit logs")
	}
	if audit.CanUserViewEntity(uForbidden, "calendar_event", nil) {
		t.Errorf("expected uForbidden NOT to view calendar_event audit logs")
	}

	// Update event to all-day (clearing times)
	updateBody := `{"event_type":"ea_kleine_gruppe","start_date":"2097-10-12","end_date":"2097-10-12","start_time":null,"end_time":null,"title":"Verschoben","description":"Ganztägig"}`
	reqUpdate := httptest.NewRequest("PUT", "/api/events/"+created.ID.String(), strings.NewReader(updateBody))
	recUpdate := httptest.NewRecorder()
	r.ServeHTTP(recUpdate, reqUpdate.WithContext(context.WithValue(reqUpdate.Context(), auth.UserContextKey, uWriter)))
	if recUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 on update, got %d: %s", recUpdate.Code, recUpdate.Body.String())
	}
	var updated models.CalendarEvent
	_ = json.Unmarshal(recUpdate.Body.Bytes(), &updated)
	if updated.StartTime != nil || updated.Title != "Verschoben" {
		t.Fatalf("expected cleared StartTime and updated Title, got %+v", updated)
	}

	// Delete event
	reqDel := httptest.NewRequest("DELETE", "/api/events/"+created.ID.String(), nil)
	recDel := httptest.NewRecorder()
	r.ServeHTTP(recDel, reqDel.WithContext(context.WithValue(reqDel.Context(), auth.UserContextKey, uWriter)))
	if recDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on delete, got %d", recDel.Code)
	}

	// 4. Bulk import (skip_duplicates) & Upcoming Events group filtering
	importPayload := `{
		"mode": "skip_duplicates",
		"events": [
			{"event_type": "schliesszeit", "start_date": "2097-11-01", "end_date": "2097-11-05"},
			{"event_type": "ferien", "start_date": "2097-11-01", "end_date": "2097-11-07"},
			{"event_type": "ea_kleine_gruppe", "start_date": "2097-11-10", "end_date": "2097-11-10", "start_time": "20:00"},
			{"event_type": "ea_hort", "start_date": "2097-11-11", "end_date": "2097-11-11", "start_time": "20:00"},
			{"event_type": "custom", "start_date": "2097-11-20", "end_date": "2097-11-22", "title": "Hortfreizeit"},
			{"event_type": "sommerfest", "start_date": "2097-12-20", "end_date": "2097-12-20"}
		]
	}`
	reqImp := httptest.NewRequest("POST", "/api/events/import", strings.NewReader(importPayload))
	recImp := httptest.NewRecorder()
	r.ServeHTTP(recImp, reqImp.WithContext(context.WithValue(reqImp.Context(), auth.UserContextKey, uWriter)))
	if recImp.Code != http.StatusOK {
		t.Fatalf("expected 200 on import, got %d: %s", recImp.Code, recImp.Body.String())
	}
	var impResp models.ImportCalendarEventsResponse
	_ = json.Unmarshal(recImp.Body.Bytes(), &impResp)
	if impResp.CreatedCount != 6 || impResp.SkippedCount != 0 {
		t.Fatalf("expected 6 created, 0 skipped, got %+v", impResp)
	}

	// Re-importing identical payload skips all 6
	reqImp2 := httptest.NewRequest("POST", "/api/events/import", strings.NewReader(importPayload))
	recImp2 := httptest.NewRecorder()
	r.ServeHTTP(recImp2, reqImp2.WithContext(context.WithValue(reqImp2.Context(), auth.UserContextKey, uWriter)))
	var impResp2 models.ImportCalendarEventsResponse
	_ = json.Unmarshal(recImp2.Body.Bytes(), &impResp2)
	if impResp2.CreatedCount != 0 || impResp2.SkippedCount != 6 {
		t.Fatalf("expected 0 created, 6 skipped on re-import, got %+v", impResp2)
	}

	// Seed a cooking duty for uKleineParent (parentID) on 2097-11-08 -> should appear in both upcoming-events (sorted chronologically) and /api/events!
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2097-11-08",
		"Anna Test",
		models.MealAllergenCookList{{ID: parentID, Type: "parent", FirstName: "Anna", LastName: "Test"}},
		"resolved",
		"Gemüsesuppe", "Brot", "",
	); err != nil {
		t.Fatalf("failed to seed cooking duty: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM meal_plan_from_sheets WHERE date = '2097-11-08'")
	}()

	// Parent with child in Kleine Gruppe (group 1) on 2097-11-03:
	// Should see ongoing schliesszeit (2097-11-01..05), cooking_duty (2097-11-08), ea_kleine_gruppe (2097-11-10), custom Hortfreizeit (2097-11-20..22), and sommerfest beyond 30 days (2097-12-20)
	// Should NOT see ferien or ea_hort!
	uKleineParent := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "anna@example.com",
		ParentID:             &parentID,
		FamilyID:             &famID,
		EffectivePermissions: []string{"events.all.read"},
	}
	reqUpcoming := httptest.NewRequest("GET", "/api/me/upcoming-events?date="+time.Date(2097, 11, 3, 0, 0, 0, 0, time.UTC).Format("2006-01-02"), nil)
	recUpcoming := httptest.NewRecorder()
	r.ServeHTTP(recUpcoming, reqUpcoming.WithContext(context.WithValue(reqUpcoming.Context(), auth.UserContextKey, uKleineParent)))
	if recUpcoming.Code != http.StatusOK {
		t.Fatalf("expected 200 on upcoming-events, got %d: %s", recUpcoming.Code, recUpcoming.Body.String())
	}
	var upResp models.MyUpcomingEventsResponse
	_ = json.Unmarshal(recUpcoming.Body.Bytes(), &upResp)
	if len(upResp.Events) < 6 {
		t.Fatalf("expected at least 6 filtered upcoming events for Kleine Gruppe parent (5 seeded + derived BW feiertag events), got %d: %+v", len(upResp.Events), upResp.Events)
	}
	if upResp.Events[0].EventType != "schliesszeit" || !upResp.Events[0].Editable ||
		upResp.Events[1].Type != "cooking_duty" || upResp.Events[1].Editable ||
		upResp.Events[1].Date != "2097-11-08" ||
		upResp.Events[2].EventType != "ea_kleine_gruppe" || !upResp.Events[2].Editable ||
		upResp.Events[3].EventType != "custom" || !upResp.Events[3].Editable ||
		upResp.Events[3].Title != "Hortfreizeit" ||
		upResp.Events[4].EventType != "sommerfest" || upResp.Events[4].Date != "2097-12-20" ||
		upResp.Events[5].EventType != "feiertag" || upResp.Events[5].Date != "2097-12-25" || upResp.Events[5].Title != "1. Weihnachtsfeiertag" || upResp.Events[5].Editable {
		t.Fatalf("unexpected upcoming events order/content: %+v", upResp.Events)
	}
	for _, ev := range upResp.Events {
		if ev.EventType == "ferien" || ev.EventType == "ea_hort" {
			t.Fatalf("expected ferien and ea_hort to be excluded from upcoming events, got %+v", ev)
		}
		if ev.Date == "2097-11-01" && ev.EventType == "feiertag" {
			t.Fatalf("expected Allerheiligen on 2097-11-01 (covered by schliesszeit) to be suppressed, got %+v", ev)
		}
	}

	// Verify GET /api/events for uKleineParent includes her personal cooking_duty on 2097-11-08 with matching ID and Editable=false
	reqCalParent := httptest.NewRequest("GET", "/api/events?start_date=2097-11-01&end_date=2097-11-30", nil)
	recCalParent := httptest.NewRecorder()
	r.ServeHTTP(recCalParent, reqCalParent.WithContext(context.WithValue(reqCalParent.Context(), auth.UserContextKey, uKleineParent)))
	if recCalParent.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET /api/events for parent, got %d", recCalParent.Code)
	}
	var calList []models.CalendarEvent
	_ = json.Unmarshal(recCalParent.Body.Bytes(), &calList)
	foundCookingInCal := false
	for _, ce := range calList {
		if ce.EventType == "cooking_duty" || ce.EventType == "feiertag" {
			if ce.Editable {
				t.Fatalf("expected derived %s CalendarEvent to have Editable=false, got true", ce.EventType)
			}
			if ce.EventType == "cooking_duty" && ce.StartDate == "2097-11-08" && ce.ID.String() == upResp.Events[1].ID {
				foundCookingInCal = true
			}
			if ce.EventType == "feiertag" && ce.StartDate == "2097-11-01" {
				t.Fatalf("expected Allerheiligen on 2097-11-01 to be suppressed by schliesszeit in /api/events")
			}
		} else if !ce.Editable {
			t.Fatalf("expected persisted CalendarEvent %s (%s) to have Editable=true", ce.ID, ce.EventType)
		}
	}
	if !foundCookingInCal {
		t.Fatalf("expected personal cooking_duty on 2097-11-08 in /api/events with ID %s, got %+v", upResp.Events[1].ID, calList)
	}

	// Verify GET /api/events for December 2097 returns non-suppressed weekday BW state holidays (12-25 Wed, 12-26 Thu)
	// and suppresses them once covered by a schliesszeit block.
	reqCalDec := httptest.NewRequest("GET", "/api/events?start_date=2097-12-01&end_date=2097-12-31", nil)
	recCalDec := httptest.NewRecorder()
	r.ServeHTTP(recCalDec, reqCalDec.WithContext(context.WithValue(reqCalDec.Context(), auth.UserContextKey, uKleineParent)))
	if recCalDec.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET /api/events for Dec 2097, got %d", recCalDec.Code)
	}
	var decList []models.CalendarEvent
	_ = json.Unmarshal(recCalDec.Body.Bytes(), &decList)
	feiertagDates := make(map[string]string)
	for _, ce := range decList {
		if ce.EventType == "feiertag" {
			feiertagDates[ce.StartDate] = ce.Title
		}
	}
	if feiertagDates["2097-12-25"] != "1. Weihnachtsfeiertag" || feiertagDates["2097-12-26"] != "2. Weihnachtsfeiertag" {
		t.Fatalf("expected 1. & 2. Weihnachtsfeiertag in Dec 2097 events, got %+v", feiertagDates)
	}

	// Verify weekend holiday suppression: in Oct 2026, Tag der Deutschen Einheit (2026-10-03) is a Saturday -> suppressed!
	// Whereas in May 2026, Tag der Arbeit (2026-05-01, Friday), Christi Himmelfahrt (2026-05-14, Thursday),
	// and Pfingstmontag (2026-05-25, Monday) are weekdays -> included!
	oct2026Events, err := appStore.ListCalendarEvents(ctx, "2026-10-01", "2026-10-31")
	if err != nil {
		t.Fatalf("ListCalendarEvents Oct 2026 failed: %v", err)
	}
	for _, ce := range oct2026Events {
		if ce.EventType == "feiertag" && ce.StartDate == "2026-10-03" {
			t.Fatalf("expected Saturday holiday 2026-10-03 (Tag der Deutschen Einheit) to be suppressed, got %+v", ce)
		}
	}
	may2026Events, err := appStore.ListCalendarEvents(ctx, "2026-05-01", "2026-05-31")
	if err != nil {
		t.Fatalf("ListCalendarEvents May 2026 failed: %v", err)
	}
	mayHolidays := make(map[string]string)
	for _, ce := range may2026Events {
		if ce.EventType == "feiertag" {
			mayHolidays[ce.StartDate] = ce.Title
		}
	}
	if mayHolidays["2026-05-01"] != "Tag der Arbeit" ||
		mayHolidays["2026-05-14"] != "Christi Himmelfahrt" ||
		mayHolidays["2026-05-25"] != "Pfingstmontag" {
		t.Fatalf("expected weekday May 2026 BW holidays, got %+v", mayHolidays)
	}
}
