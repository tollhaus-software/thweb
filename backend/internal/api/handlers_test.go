package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func TestMain(m *testing.M) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	database.ApplySchemaMigrations(context.Background(), dbURL)
	os.Exit(m.Run())
}

func TestHandleListAuditLogs_Permission(t *testing.T) {
	s := &Server{}

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name:       "no user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
		{
			name: "user without audit.view",
			user: &models.UserWithPermissions{
				Email:                "developer@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/audit-logs", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), auth.UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			s.HandleListAuditLogs(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("HandleListAuditLogs status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleGetDailyBrief_InvalidDate(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("GET", "/api/dashboard/daily-brief?date=invalid-date", nil)
	rec := httptest.NewRecorder()

	s.HandleGetDailyBrief(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("HandleGetDailyBrief with invalid date got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleGetMealPlanDay_InvalidDate(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("GET", "/api/mealplan?date=invalid-date", nil)
	rec := httptest.NewRecorder()

	s.HandleGetMealPlanDay(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("HandleGetMealPlanDay with invalid date got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleGetKioskCertStatus_NoCA(t *testing.T) {
	s := &Server{
		KioskGenerator: nil,
	}
	req := httptest.NewRequest("GET", "/api/admin/kiosk-certs/status", nil)
	rec := httptest.NewRecorder()

	s.HandleGetKioskCertStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), `"ca_initialized":false`) {
		t.Errorf("expected ca_initialized: false, got: %s", rec.Body.String())
	}
}

func TestHandleGetActivityStats_NilRecorder(t *testing.T) {
	s := &Server{
		ActivityRecorder: nil,
	}
	req := httptest.NewRequest("GET", "/api/admin/activity?days=7&limit=50", nil)
	rec := httptest.NewRecorder()

	s.HandleGetActivityStats(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), `"available":false`) {
		t.Errorf("expected available: false, got: %s", rec.Body.String())
	}
}

func TestHandleIssueKioskCert_NoCA(t *testing.T) {
	s := &Server{
		KioskGenerator: nil,
	}
	req := httptest.NewRequest("POST", "/api/admin/kiosk-certs", strings.NewReader(`{"device_name":"tablet-1"}`))
	rec := httptest.NewRecorder()

	s.HandleIssueKioskCert(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestHandleIssueKioskCert_MissingDeviceName(t *testing.T) {
	tmpDir := t.TempDir()
	caCertPath := filepath.Join(tmpDir, "kiosk-ca.crt")
	caKeyPath := filepath.Join(tmpDir, "kiosk-ca.key")
	_ = os.WriteFile(caCertPath, []byte("fake"), 0644)
	_ = os.WriteFile(caKeyPath, []byte("fake"), 0600)

	s := &Server{
		KioskGenerator: &kioskcert.Generator{
			CaCertPath: caCertPath,
			CaKeyPath:  caKeyPath,
		},
	}
	req := httptest.NewRequest("POST", "/api/admin/kiosk-certs", strings.NewReader(`{"device_name":""}`))
	rec := httptest.NewRecorder()

	s.HandleIssueKioskCert(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleUpdateTHMembership_Validation(t *testing.T) {
	s := &Server{}
	user := &models.UserWithPermissions{
		ID:    [16]byte{1},
		Email: "admin@example.com",
	}

	tests := []struct {
		name       string
		url        string
		body       string
		wantStatus int
	}{
		{
			name:       "invalid membership ID",
			url:        "/api/memberships/invalid-uuid",
			body:       `{"start_date":"2026-01-01","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid JSON",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `invalid-json`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid start_date format",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"not-a-date","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid end_date format",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-01","end_date":"not-a-date","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "end_date equal to start_date",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-01","end_date":"2026-01-01","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "end_date earlier than start_date",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-05","end_date":"2026-01-04","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("PUT", tt.url, strings.NewReader(tt.body))
			ctx := context.WithValue(req.Context(), auth.UserContextKey, user)
			req = req.WithContext(ctx)

			// chi URL param mock if needed
			rCtx := chi.NewRouteContext()
			parts := strings.Split(tt.url, "/")
			if len(parts) > 3 {
				rCtx.URLParams.Add("id", parts[3])
			}
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rCtx))

			rec := httptest.NewRecorder()
			s.HandleUpdateTHMembership(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("%s status = %d, want %d", tt.name, rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleUpdateHygieneEvent_Validation(t *testing.T) {
	s := &Server{}
	user := &models.UserWithPermissions{
		ID:    [16]byte{1},
		Email: "admin@example.com",
	}

	tests := []struct {
		name       string
		url        string
		body       string
		wantStatus int
	}{
		{
			name:       "invalid event ID",
			url:        "/api/hygiene-events/invalid-uuid",
			body:       `{"event_date":"2026-01-01","event_type":"initial","documentation":"doc"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid JSON",
			url:        "/api/hygiene-events/11111111-1111-1111-1111-111111111111",
			body:       `invalid-json`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid event_type",
			url:        "/api/hygiene-events/11111111-1111-1111-1111-111111111111",
			body:       `{"event_date":"2026-01-01","event_type":"invalid","documentation":"doc"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid event_date format",
			url:        "/api/hygiene-events/11111111-1111-1111-1111-111111111111",
			body:       `{"event_date":"not-a-date","event_type":"initial","documentation":"doc"}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("PUT", tt.url, strings.NewReader(tt.body))
			ctx := context.WithValue(req.Context(), auth.UserContextKey, user)
			req = req.WithContext(ctx)

			rCtx := chi.NewRouteContext()
			parts := strings.Split(tt.url, "/")
			if len(parts) > 3 {
				rCtx.URLParams.Add("id", parts[3])
			}
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rCtx))

			rec := httptest.NewRecorder()
			s.HandleUpdateHygieneEvent(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("%s status = %d, want %d", tt.name, rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleTestReset_ForbiddenWithoutMockAuth(t *testing.T) {
	s := &Server{
		Authenticator: &auth.Authenticator{
			AllowMockAuth: false,
		},
	}
	req := httptest.NewRequest("POST", "/api/test/reset", nil)
	rec := httptest.NewRecorder()
	s.HandleTestReset(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("HandleTestReset without mock auth got %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestHandleUpdateFamilyParents_IdentifierEmailPermissions(t *testing.T) {
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

	appStore := store.NewStore(pool)
	hub := NewHub()
	go hub.Run()
	s := &Server{
		Store: appStore,
		Hub:   hub,
	}

	// Create test family with one parent having an identifier email and a normal email
	testUserID := uuid.New()
	testUserEmail := "test-user-" + testUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, testUserEmail)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	familyID := uuid.New()
	parentID := uuid.New()

	parent := models.Parent{
		ID:        parentID,
		FamilyID:  familyID,
		FirstName: "Alice",
		LastName:  "Test",
		Emails: models.MultiValueList{
			{Value: "alice.id@example.com", IdentifierEmail: true, AddressList: true},
			{Value: "alice.normal@example.com", IdentifierEmail: false, AddressList: true},
		},
		Phones: models.MultiValueList{
			{Value: "123456", AddressList: true},
		},
	}

	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("failed to seed test family parents: %v", err)
	}

	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID)
	}()

	userWithoutWrite := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "caregiver@example.com",
		EffectivePermissions: []string{"families.all.read"},
	}

	userWithWrite := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "admin@example.com",
		EffectivePermissions: []string{"families.all.read", "families.all.write"},
	}

	makeRequest := func(user *models.UserWithPermissions, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("PUT", "/api/families/"+familyID.String(), strings.NewReader(body))
		reqCtx := context.WithValue(req.Context(), auth.UserContextKey, user)
		rCtx := chi.NewRouteContext()
		rCtx.URLParams.Add("id", familyID.String())
		reqCtx = context.WithValue(reqCtx, chi.RouteCtxKey, rCtx)
		req = req.WithContext(reqCtx)

		rec := httptest.NewRecorder()
		s.HandleUpdateFamilyParents(rec, req)
		return rec
	}

	// 1. Without families.all.write: attempt to remove identifier email -> should fail 403
	bodyRemoveID := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.normal@example.com","identifier_email":false}],"phones":[]}]}`, parentID, familyID)
	rec := makeRequest(userWithoutWrite, bodyRemoveID)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when removing identifier email without permission, got %d", rec.Code)
	}

	// 2. Without families.all.write: attempt to modify identifier email value -> should fail 403
	bodyModifyID := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.modified@example.com","identifier_email":true},{"value":"alice.normal@example.com","identifier_email":false}],"phones":[]}]}`, parentID, familyID)
	rec = makeRequest(userWithoutWrite, bodyModifyID)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when modifying identifier email value without permission, got %d", rec.Code)
	}

	// 3. Without families.all.write: attempt to set identifier_email = false on existing identifier email -> should fail 403
	bodyUnflagID := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.id@example.com","identifier_email":false},{"value":"alice.normal@example.com","identifier_email":false}],"phones":[]}]}`, parentID, familyID)
	rec = makeRequest(userWithoutWrite, bodyUnflagID)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when unflagging identifier email without permission, got %d", rec.Code)
	}

	// 4. Without families.all.write: attempt to add new identifier email -> should fail 403
	bodyAddID := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.id@example.com","identifier_email":true},{"value":"new.id@example.com","identifier_email":true}],"phones":[]}]}`, parentID, familyID)
	rec = makeRequest(userWithoutWrite, bodyAddID)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when adding identifier email without permission, got %d", rec.Code)
	}

	// 5. Without families.all.write: modify normal email and phones while preserving identifier email -> should SUCCEED 200
	bodyValidNormalEdit := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.id@example.com","identifier_email":true,"address_list":false},{"value":"alice.changed_normal@example.com","identifier_email":false}],"phones":[{"value":"987654"}]}]}`, parentID, familyID)
	rec = makeRequest(userWithoutWrite, bodyValidNormalEdit)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 when editing non-identifier email without families.all.write, got %d (%s)", rec.Code, rec.Body.String())
	}

	// 6. With families.all.write: user CAN modify identifier email -> should SUCCEED 200
	bodyAdminModifyID := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","emails":[{"value":"alice.new_id@example.com","identifier_email":true}],"phones":[]}]}`, parentID, familyID)
	rec = makeRequest(userWithWrite, bodyAdminModifyID)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 when editing identifier email with families.all.write, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestHandleListFamiliesOverview_ProjectionAndScoping(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	s := &Server{Store: appStore}

	testUserID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	familyID1 := uuid.New()
	familyID2 := uuid.New()

	parentID1 := uuid.New()
	parentID2 := uuid.New()

	parents1 := []models.Parent{
		{
			ID:                      parentID1,
			FamilyID:                familyID1,
			FirstName:               "Alice",
			FirstNameForAddressList: "Ali",
			LastName:                "FamilyOne",
			Emails: models.MultiValueList{
				{Value: "alice.public@example.com", AddressList: true, IdentifierEmail: true},
				{Value: "alice.secret@example.com", AddressList: false, IdentifierEmail: false},
			},
			Phones: models.MultiValueList{
				{Value: "111-public", AddressList: true},
				{Value: "111-private", AddressList: false},
			},
			Address: "Musterstraße 10, 70173 Stuttgart",
			Notes:   "Sensitive parent notes that should NOT be in overview",
		},
	}
	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID1, parents1); err != nil {
		t.Fatalf("failed to seed family 1: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID1)
	}()

	parents2 := []models.Parent{
		{
			ID:        parentID2,
			FamilyID:  familyID2,
			FirstName: "Bob",
			LastName:  "FamilyTwo",
			Emails: models.MultiValueList{
				{Value: "bob.public@example.com", AddressList: true, IdentifierEmail: true},
			},
			Phones: models.MultiValueList{
				{Value: "222-public", AddressList: true},
			},
		},
	}
	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID2, parents2); err != nil {
		t.Fatalf("failed to seed family 2: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID2)
	}()

	// Add children to family 1 with different birth dates
	childID1 := uuid.New()
	child1 := models.Child{
		ID:                      childID1,
		FamilyID:                familyID1,
		FirstName:               "Charlie",
		FirstNameForAddressList: "Chuck",
		LastName:                "FamilyOne",
		BirthDate:               time.Date(2021, 5, 1, 0, 0, 0, 0, time.UTC),
		Notes:                   "Secret child notes",
	}
	if err := appStore.UpdateChild(ctx, testUserID, childID1, child1); err != nil {
		t.Fatalf("failed to seed child: %v", err)
	}

	childID2 := uuid.New()
	child2 := models.Child{
		ID:        childID2,
		FamilyID:  familyID1,
		FirstName: "Abby",
		LastName:  "FamilyOne",
		BirthDate: time.Date(2019, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	if err := appStore.UpdateChild(ctx, testUserID, childID2, child2); err != nil {
		t.Fatalf("failed to seed child 2: %v", err)
	}

	changeDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       childID1,
		ChangeDate:  changeDate,
		TargetGroup: 1,
	})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       childID2,
		ChangeDate:  changeDate,
		TargetGroup: 1,
	})

	// User representing Family 1 with self-service
	restrictedUser := &models.UserWithPermissions{
		Email:                "alice.public@example.com",
		Roles:                []string{"parent_default"},
		EffectivePermissions: []string{"families.all.restrictedread", "fees.self.read", "families.self.selfservice"},
		FamilyID:             &familyID1,
	}

	req := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqCtx := context.WithValue(req.Context(), auth.UserContextKey, restrictedUser)
	req = req.WithContext(reqCtx)
	rec := httptest.NewRecorder()

	s.HandleListFamiliesOverview(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleListFamiliesOverview, got %d (%s)", rec.Code, rec.Body.String())
	}

	bodyStr := rec.Body.String()
	// Must NOT contain sensitive notes
	if strings.Contains(bodyStr, "Sensitive parent notes") {
		t.Errorf("HandleListFamiliesOverview leaked parent notes: %s", bodyStr)
	}
	if strings.Contains(bodyStr, "Secret child notes") {
		t.Errorf("HandleListFamiliesOverview leaked child notes: %s", bodyStr)
	}
	// Must NOT contain unlisted emails/phones
	if strings.Contains(bodyStr, "alice.secret@example.com") {
		t.Errorf("HandleListFamiliesOverview leaked non-address-list email: %s", bodyStr)
	}
	if strings.Contains(bodyStr, "111-private") {
		t.Errorf("HandleListFamiliesOverview leaked non-address-list phone: %s", bodyStr)
	}
	// MUST contain public email, phone, and address
	if !strings.Contains(bodyStr, "alice.public@example.com") {
		t.Errorf("expected alice.public@example.com in overview, got: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "111-public") {
		t.Errorf("expected 111-public in overview, got: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "Musterstraße 10, 70173 Stuttgart") {
		t.Errorf("expected parent address in overview, got: %s", bodyStr)
	}
	// Custom address list names Ali and Chuck should be returned instead of Alice and Charlie
	if !strings.Contains(bodyStr, "Chuck") {
		t.Errorf("expected custom address list child name Chuck in overview, got: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "Ali") {
		t.Errorf("expected custom address list parent name Ali in overview, got: %s", bodyStr)
	}

	var result []OverviewFamily
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to unmarshal overview response: %v", err)
	}
	for _, f := range result {
		if f.ID == familyID1 {
			if len(f.Children) < 2 {
				t.Fatalf("expected at least 2 children for family 1, got %d", len(f.Children))
			}
			if f.Children[0].FirstName != "Abby" || f.Children[1].FirstName != "Chuck" {
				t.Errorf("expected children sorted by birthdate (Abby then Chuck), got %s then %s", f.Children[0].FirstName, f.Children[1].FirstName)
			}
			if len(f.Parents) < 1 || f.Parents[0].FirstName != "Ali" {
				t.Errorf("expected parent first name Ali in overview, got %+v", f.Parents)
			}
		}
		if f.ID == familyID2 {
			if len(f.Parents) < 1 || f.Parents[0].FirstName != "Bob" {
				t.Errorf("expected parent first name Bob in overview, got %+v", f.Parents)
			}
		}
	}
}

func TestHandleListFamiliesOverview_DateFiltering(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	s := &Server{Store: appStore}

	testUserID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	now := time.Now()

	// Family A: Child exited > 1 year ago (should be excluded from overview)
	famAId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famAId, []models.Parent{{ID: uuid.New(), FamilyID: famAId, FirstName: "ParentA", LastName: "FamA"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famAId) }()
	childAId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childAId, models.Child{ID: childAId, FamilyID: famAId, FirstName: "ChildA", LastName: "FamA", BirthDate: now.AddDate(-6, 0, 0)})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childAId, ChangeDate: now.AddDate(-2, 0, 0), TargetGroup: 1})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childAId, ChangeDate: now.AddDate(-1, 0, -5), TargetGroup: 0})

	// Family B: Child exited 6 months ago (within 1 year, should be included in overview)
	famBId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famBId, []models.Parent{{ID: uuid.New(), FamilyID: famBId, FirstName: "ParentB", LastName: "FamB"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famBId) }()
	childBId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childBId, models.Child{ID: childBId, FamilyID: famBId, FirstName: "ChildB", LastName: "FamB", BirthDate: now.AddDate(-5, 0, 0)})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childBId, ChangeDate: now.AddDate(-2, 0, 0), TargetGroup: 1})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childBId, ChangeDate: now.AddDate(0, -6, 0), TargetGroup: 0})

	// Family C: New family, child planned to start in 5 months (> 4 months, should be excluded from overview)
	famCId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famCId, []models.Parent{{ID: uuid.New(), FamilyID: famCId, FirstName: "ParentC", LastName: "FamC"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famCId) }()
	childCId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childCId, models.Child{ID: childCId, FamilyID: famCId, FirstName: "ChildC", LastName: "FamC", BirthDate: now.AddDate(-3, 0, 0)})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childCId, ChangeDate: now.AddDate(0, 5, 0), TargetGroup: 1})

	// Family D: New family, child planned to start in 2 months (<= 4 months, should be included in overview)
	famDId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famDId, []models.Parent{{ID: uuid.New(), FamilyID: famDId, FirstName: "ParentD", LastName: "FamD"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famDId) }()
	childDId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childDId, models.Child{ID: childDId, FamilyID: famDId, FirstName: "ChildD", LastName: "FamD", BirthDate: now.AddDate(-3, 0, 0)})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childDId, ChangeDate: now.AddDate(0, 2, 0), TargetGroup: 1})

	// Family E: Active child enrolled 2 months ago (should be included in overview)
	famEId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famEId, []models.Parent{{ID: uuid.New(), FamilyID: famEId, FirstName: "ParentE", LastName: "FamE"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famEId) }()
	childEId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childEId, models.Child{ID: childEId, FamilyID: famEId, FirstName: "ChildE", LastName: "FamE", BirthDate: now.AddDate(-4, 0, 0)})
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{Child: childEId, ChangeDate: now.AddDate(0, -2, 0), TargetGroup: 1})

	// Family F: New family, child has NO group start date configured yet (should be excluded from overview)
	famFId := uuid.New()
	_ = appStore.UpdateFamilyParents(ctx, testUserID, famFId, []models.Parent{{ID: uuid.New(), FamilyID: famFId, FirstName: "ParentF", LastName: "FamF"}})
	defer func() { _ = appStore.DeleteFamily(ctx, testUserID, famFId) }()
	childFId := uuid.New()
	_ = appStore.UpdateChild(ctx, testUserID, childFId, models.Child{ID: childFId, FamilyID: famFId, FirstName: "ChildF", LastName: "FamF", BirthDate: now.AddDate(-2, 0, 0)})

	user := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "staff@example.com",
		EffectivePermissions: []string{"families.all.read", "families.all.restrictedread"},
	}

	// 1. Check HandleListFamiliesOverview
	reqOv := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqOv = reqOv.WithContext(context.WithValue(reqOv.Context(), auth.UserContextKey, user))
	recOv := httptest.NewRecorder()
	s.HandleListFamiliesOverview(recOv, reqOv)

	if recOv.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for overview, got %d", recOv.Code)
	}

	var overviewFamilies []OverviewFamily
	if err := json.Unmarshal(recOv.Body.Bytes(), &overviewFamilies); err != nil {
		t.Fatalf("failed to unmarshal overview response: %v", err)
	}

	overviewMap := make(map[uuid.UUID]bool)
	for _, f := range overviewFamilies {
		overviewMap[f.ID] = true
	}

	if overviewMap[famAId] {
		t.Errorf("Family A (child exited > 1 year ago) should NOT be in overview")
	}
	if !overviewMap[famBId] {
		t.Errorf("Family B (child exited 6 months ago) should BE in overview")
	}
	if overviewMap[famCId] {
		t.Errorf("Family C (planned start > 4 months away) should NOT be in overview")
	}
	if !overviewMap[famDId] {
		t.Errorf("Family D (planned start <= 4 months away) should BE in overview")
	}
	if !overviewMap[famEId] {
		t.Errorf("Family E (active child) should BE in overview")
	}
	if overviewMap[famFId] {
		t.Errorf("Family F (no group start date configured) should NOT be in overview")
	}

	// 2. Check HandleListFamilies (management view should contain all families)
	reqFam := httptest.NewRequest("GET", "/api/families", nil)
	reqFam = reqFam.WithContext(context.WithValue(reqFam.Context(), auth.UserContextKey, user))
	recFam := httptest.NewRecorder()
	s.HandleListFamilies(recFam, reqFam)

	if recFam.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for families, got %d", recFam.Code)
	}

	var allFamilies []models.Family
	if err := json.Unmarshal(recFam.Body.Bytes(), &allFamilies); err != nil {
		t.Fatalf("failed to unmarshal families response: %v", err)
	}

	allMap := make(map[uuid.UUID]bool)
	for _, f := range allFamilies {
		allMap[f.ID] = true
	}

	if !allMap[famAId] || !allMap[famBId] || !allMap[famCId] || !allMap[famDId] || !allMap[famEId] {
		t.Errorf("All families must be present in HandleListFamilies (management view)")
	}
}

func TestHandleCalculateFees_RestrictedUser(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	s := &Server{Store: appStore}

	testUserID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	familyID1 := uuid.New()
	familyID2 := uuid.New()

	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID1, []models.Parent{
		{ID: uuid.New(), FamilyID: familyID1, FirstName: "F1", LastName: "Parent"},
	}); err != nil {
		t.Fatalf("failed to update family 1: %v", err)
	}
	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID2, []models.Parent{
		{ID: uuid.New(), FamilyID: familyID2, FirstName: "F2", LastName: "Parent"},
	}); err != nil {
		t.Fatalf("failed to update family 2: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID1)
		_ = appStore.DeleteFamily(ctx, testUserID, familyID2)
	}()

	calcBody := `{"start_month":"2026-09","end_month":"2026-09"}`

	// 1. Restricted user with fees.self.read: only returns familyID1
	userSelf := &models.UserWithPermissions{
		Email:                "f1@example.com",
		EffectivePermissions: []string{"families.all.restrictedread", "fees.self.read"},
		FamilyID:             &familyID1,
	}
	req := httptest.NewRequest("POST", "/api/fees/calculate", strings.NewReader(calcBody))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, userSelf))
	rec := httptest.NewRecorder()
	s.HandleCalculateFees(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", rec.Code, rec.Body.String())
	}
	bodyStr := rec.Body.String()
	if !strings.Contains(bodyStr, familyID1.String()) {
		t.Errorf("expected result to contain familyID1 (%s), got: %s", familyID1.String(), bodyStr)
	}
	if strings.Contains(bodyStr, familyID2.String()) {
		t.Errorf("restricted user result must NOT contain familyID2 (%s), got: %s", familyID2.String(), bodyStr)
	}

	// 2. User without fees permissions -> 403 Forbidden
	userNoFees := &models.UserWithPermissions{
		Email:                "nofees@example.com",
		EffectivePermissions: []string{"families.all.restrictedread"},
	}
	reqNoFees := httptest.NewRequest("POST", "/api/fees/calculate", strings.NewReader(calcBody))
	reqNoFees = reqNoFees.WithContext(context.WithValue(reqNoFees.Context(), auth.UserContextKey, userNoFees))
	recNoFees := httptest.NewRecorder()
	s.HandleCalculateFees(recNoFees, reqNoFees)
	if recNoFees.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden without fees permission, got %d", recNoFees.Code)
	}
}

func TestParentAddress_PersistenceAndRetrieval(t *testing.T) {
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

	appStore := store.NewStore(pool)
	hub := NewHub()
	go hub.Run()
	s := &Server{
		Store: appStore,
		Hub:   hub,
	}

	testUserID := uuid.New()
	testUserEmail := "test-user-addr-" + testUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, testUserEmail)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	familyID := uuid.New()
	p1ID := uuid.New()
	p2ID := uuid.New()

	parents := []models.Parent{
		{
			ID:        p1ID,
			FamilyID:  familyID,
			FirstName: "Alice",
			LastName:  "Test",
			Address:   "Hauptstr. 1, 70173 Stuttgart",
		},
		{
			ID:        p2ID,
			FamilyID:  familyID,
			FirstName: "Bob",
			LastName:  "Test",
			Address:   "Gartenweg 2, 70174 Stuttgart",
		},
	}

	// 1. Create/Insert parents with distinct addresses
	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID, parents); err != nil {
		t.Fatalf("failed to insert parents with addresses: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID)
	}()

	// 2. Query parents directly and verify addresses
	loaded, err := appStore.GetParentsByFamilyID(ctx, familyID)
	if err != nil {
		t.Fatalf("failed to load parents: %v", err)
	}
	if len(loaded) != 2 {
		t.Fatalf("expected 2 parents, got %d", len(loaded))
	}
	parentMap := make(map[uuid.UUID]models.Parent)
	for _, p := range loaded {
		parentMap[p.ID] = p
	}
	if parentMap[p1ID].Address != "Hauptstr. 1, 70173 Stuttgart" {
		t.Errorf("expected p1 address 'Hauptstr. 1, 70173 Stuttgart', got '%s'", parentMap[p1ID].Address)
	}
	if parentMap[p2ID].Address != "Gartenweg 2, 70174 Stuttgart" {
		t.Errorf("expected p2 address 'Gartenweg 2, 70174 Stuttgart', got '%s'", parentMap[p2ID].Address)
	}

	// 3. Update to shared address for all parents of the family
	sharedAddress := "Gemeinsameweg 99, 70178 Stuttgart"
	updateBody := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"Alice","last_name":"Test","address":"%s"},{"id":"%s","family_id":"%s","first_name":"Bob","last_name":"Test","address":"%s"}]}`,
		p1ID, familyID, sharedAddress, p2ID, familyID, sharedAddress)

	adminUser := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                testUserEmail,
		EffectivePermissions: []string{"families.all.read", "families.all.write"},
	}

	req := httptest.NewRequest("PUT", "/api/families/"+familyID.String()+"/parents", strings.NewReader(updateBody))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, adminUser))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", familyID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	s.HandleUpdateFamilyParents(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", rec.Code, rec.Body.String())
	}

	// 4. Verify shared address persisted
	loadedAfterUpdate, err := appStore.GetParentsByFamilyID(ctx, familyID)
	if err != nil {
		t.Fatalf("failed to reload parents: %v", err)
	}
	for _, p := range loadedAfterUpdate {
		if p.Address != sharedAddress {
			t.Errorf("expected parent %s to have shared address '%s', got '%s'", p.FirstName, sharedAddress, p.Address)
		}
	}
}

func TestComputeChildOverviewGroupStatus(t *testing.T) {
	now := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

	// 1. No group changes -> nil, nil, false
	cg, pg, isFormer := computeChildOverviewGroupStatus(nil, now)
	if cg != nil || pg != nil || isFormer {
		t.Errorf("expected nil, nil, false for empty changes; got %v, %v, %v", cg, pg, isFormer)
	}

	// 2. Future enrollment only -> nil, *1, false
	cg, pg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
	}, now)
	if cg != nil || pg == nil || *pg != 1 || isFormer {
		t.Errorf("expected nil, 1, false for future-only change; got %v, %v, %v", cg, pg, isFormer)
	}

	// 3. Active enrollment -> *int(2), nil, false
	cg, pg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
		{ChangeDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 2},
		{ChangeDate: time.Date(2027, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
	}, now)
	if cg == nil || *cg != 2 || pg != nil || isFormer {
		t.Errorf("expected 2, nil, false for active enrollment; got %v, %v, %v", cg, pg, isFormer)
	}

	// 4. Exited on or before today -> nil, nil, true
	cg, pg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
		{ChangeDate: time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
	}, now)
	if cg != nil || pg != nil || !isFormer {
		t.Errorf("expected nil, nil, true for former child; got %v, %v, %v", cg, pg, isFormer)
	}
}

func TestShouldIncludeFamilyInOverview(t *testing.T) {
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)

	// 1. Empty family (no children) -> excluded
	if shouldIncludeFamilyInOverview(models.Family{ID: uuid.New()}, now) {
		t.Errorf("expected empty family to be excluded")
	}

	// 2. Family with child having no group changes -> excluded
	if shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{ID: uuid.New(), FirstName: "Baby", GroupChanges: nil},
		},
	}, now) {
		t.Errorf("expected family with unassigned child to be excluded")
	}

	// 3. Family with active child -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with active child to be included")
	}

	// 4. Former family: child exited 6 months ago (within 1 year) -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2026, 4, 30, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
		},
	}, now) {
		t.Errorf("expected family whose child exited 6 months ago to be included")
	}

	// 5. Former family: child exited exactly 1 year ago (2025-10-28) -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2025, 10, 28, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
		},
	}, now) {
		t.Errorf("expected family whose child exited exactly 1 year ago to be included")
	}

	// 6. Former family: child exited 1 year + 1 day ago (2025-10-27) -> excluded
	if shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2025, 10, 27, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
		},
	}, now) {
		t.Errorf("expected family whose child exited > 1 year ago to be excluded")
	}

	// 7. Multiple children: child 1 exited 2 years ago, child 2 exited 3 months ago -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2024, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with child 2 exiting 3 months ago to be included")
	}

	// 8. Multiple children: child 1 exited 3 years ago, child 2 exited 14 months ago -> excluded
	if shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2022, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2023, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2025, 8, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with all children exited > 1 year ago to be excluded")
	}

	// 9. Multiple children: child 1 exited 2 years ago, child 2 is active -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2024, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with active child to be included even if older child exited")
	}

	// 10. New family: planned start in 5 months (> 4 months) -> excluded
	// now = 2026-10-28; 4 months is 2027-02-28; 5 months is 2027-03-28
	if shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2027, 3, 28, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected new family with planned start > 4 months away to be excluded")
	}

	// 11. New family: planned start exactly 4 months away (2027-02-28) -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2027, 2, 28, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected new family with planned start exactly 4 months away to be included")
	}

	// 12. New family: planned start in 4 weeks (2026-11-25) -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected new family with planned start in 4 weeks to be included")
	}

	// 13. New family with 2 children: child 1 planned in 6 months, child 2 planned in 6 weeks -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2027, 4, 28, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2026, 12, 9, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected new family with earliest child starting in 6 weeks to be included")
	}

	// 14. Former family (left > 1 year ago) with new child planned in 6 weeks -> included
	if !shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2024, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2026, 12, 9, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with new child starting in 6 weeks to be included")
	}

	// 15. Former family (left > 1 year ago) with new child planned in 5 months -> excluded
	if shouldIncludeFamilyInOverview(models.Family{
		ID: uuid.New(),
		Children: []models.Child{
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
					{ChangeDate: time.Date(2024, 7, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
				},
			},
			{
				ID: uuid.New(),
				GroupChanges: []models.ChildGroupChange{
					{ChangeDate: time.Date(2027, 3, 28, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
				},
			},
		},
	}, now) {
		t.Errorf("expected family with child exited > 1 year ago and new child starting > 4 months away to be excluded")
	}
}

func TestHandleListMembers_Permissions(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	s := &Server{Store: appStore}
	handler := auth.RequirePermission("memberships.all.read")(http.HandlerFunc(s.HandleListMembers))

	// 1. Without permission -> 403 Forbidden
	req := httptest.NewRequest("GET", "/api/members", nil)
	uForbidden := &models.UserWithPermissions{
		Email:                "caregiver@example.com",
		EffectivePermissions: []string{"families.all.read"},
	}
	ctxReq := context.WithValue(req.Context(), auth.UserContextKey, uForbidden)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req.WithContext(ctxReq))
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden without memberships.all.read, got %d", rec.Code)
	}

	// 2. With memberships.all.read -> 200 OK
	uAllowed := &models.UserWithPermissions{
		Email:                "finanz@example.com",
		EffectivePermissions: []string{"memberships.all.read"},
	}
	ctxReq2 := context.WithValue(req.Context(), auth.UserContextKey, uAllowed)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req.WithContext(ctxReq2))
	if rec2.Code != http.StatusOK {
		t.Errorf("expected 200 OK with memberships.all.read, got %d", rec2.Code)
	}

	// 3. Implied via memberships.all.write -> 200 OK
	uWrite := &models.UserWithPermissions{
		Email:                "treasurer@example.com",
		EffectivePermissions: []string{"memberships.all.write"},
	}
	ctxReq3 := context.WithValue(req.Context(), auth.UserContextKey, uWrite)
	rec3 := httptest.NewRecorder()
	handler.ServeHTTP(rec3, req.WithContext(ctxReq3))
	if rec3.Code != http.StatusOK {
		t.Errorf("expected 200 OK with implied memberships.all.write, got %d", rec3.Code)
	}
}

func getTestDBPool(t *testing.T) *pgxpool.Pool {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("skipping test: unable to ping db: %v", err)
	}
	return pool
}

func TestHandleSimulation_LifecycleAndModifyingActions(t *testing.T) {
	pool := getTestDBPool(t)
	defer pool.Close()
	appStore := store.NewStore(pool)
	ctx := context.Background()

	adminUser, err := appStore.GetUserWithPermissionsByEmail(ctx, "developer@example.com")
	if err != nil {
		t.Fatalf("failed to load developer user: %v", err)
	}

	authn := auth.NewAuthenticator("mock", true, appStore)
	server := &Server{
		Store:         appStore,
		Authenticator: authn,
	}

	// 1. GET /api/simulation/options as Admin
	reqOptions := httptest.NewRequest("GET", "/api/simulation/options", nil)
	ctxOptions := context.WithValue(reqOptions.Context(), auth.UserContextKey, adminUser)
	recOptions := httptest.NewRecorder()
	server.HandleGetSimulationOptions(recOptions, reqOptions.WithContext(ctxOptions))
	if recOptions.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for options, got %d", recOptions.Code)
	}

	var optionsResp struct {
		Users       []models.SimulationCandidate `json:"users"`
		Roles       []models.Role                `json:"roles"`
		Permissions []string                     `json:"permissions"`
	}
	if err := json.Unmarshal(recOptions.Body.Bytes(), &optionsResp); err != nil {
		t.Fatalf("failed to decode options: %v", err)
	}
	if len(optionsResp.Users) == 0 {
		t.Error("expected candidate users to be populated")
	}
	if len(optionsResp.Permissions) == 0 {
		t.Error("expected permissions to be populated")
	}

	// 2. Start simulation (Mode: user, parent email)
	familyID := uuid.New()
	parentID := uuid.New()
	parentEmail := "test.sim.parent@example.com"
	parent := models.Parent{
		ID:        parentID,
		FamilyID:  familyID,
		FirstName: "Simulated",
		LastName:  "Parent",
		Emails: models.MultiValueList{
			{Value: parentEmail, IdentifierEmail: true, AddressList: true},
		},
		Phones: models.MultiValueList{},
	}
	if err := appStore.UpdateFamilyParents(ctx, adminUser.ID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("failed to seed parent: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, adminUser.ID, familyID)
	}()

	startBody := fmt.Sprintf(`{"mode":"user","user_email":"%s"}`, parentEmail)
	reqStart := httptest.NewRequest("POST", "/api/simulation", bytes.NewBufferString(startBody))
	ctxStart := context.WithValue(reqStart.Context(), auth.UserContextKey, adminUser)
	recStart := httptest.NewRecorder()
	server.HandleStartSimulation(recStart, reqStart.WithContext(ctxStart))
	if recStart.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for start simulation, got %d (%s)", recStart.Code, recStart.Body.String())
	}

	// Check cookie was set
	cookies := recStart.Result().Cookies()
	var simCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "thweb_sim" {
			simCookie = c
			break
		}
	}
	if simCookie == nil {
		t.Fatal("expected thweb_sim cookie to be set")
	}

	// 3. Test modifying action through router with simulation active
	hub := NewHub()
	router := SetupRouter(appStore, authn, hub, nil)

	// Attempt write action that parent CANNOT do (e.g. POST /api/families to create a new family requires families.all.write)
	newFamBody := `{"parents":[{"first_name":"Unauthorized","last_name":"Parent"}]}`
	reqWriteDenied := httptest.NewRequest("POST", "/api/families", bytes.NewBufferString(newFamBody))
	reqWriteDenied.Header.Set("Authorization", "Bearer developer@example.com")
	reqWriteDenied.AddCookie(simCookie)
	recWriteDenied := httptest.NewRecorder()
	router.ServeHTTP(recWriteDenied, reqWriteDenied)
	if recWriteDenied.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for families.all.write under parent simulation, got %d", recWriteDenied.Code)
	}

	// Now switch simulation to role that HAS write permissions (custom role with families.all.write)
	startWriteBody := `{"mode":"custom","roles":["admin"],"permissions":["families.all.write"]}`
	reqStartWrite := httptest.NewRequest("POST", "/api/simulation", bytes.NewBufferString(startWriteBody))
	ctxStartWrite := context.WithValue(reqStartWrite.Context(), auth.UserContextKey, adminUser)
	recStartWrite := httptest.NewRecorder()
	server.HandleStartSimulation(recStartWrite, reqStartWrite.WithContext(ctxStartWrite))
	if recStartWrite.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recStartWrite.Code)
	}

	var writeSimCookie *http.Cookie
	for _, c := range recStartWrite.Result().Cookies() {
		if c.Name == "thweb_sim" {
			writeSimCookie = c
			break
		}
	}

	// Modifying action: update parent in existing family
	updateParentBody := fmt.Sprintf(`{"parents":[{"id":"%s","family_id":"%s","first_name":"UpdatedSim","last_name":"Parent","emails":[{"value":"%s","identifier_email":true}]}]}`, parentID, familyID, parentEmail)
	reqUpdate := httptest.NewRequest("PUT", fmt.Sprintf("/api/families/%s", familyID), bytes.NewBufferString(updateParentBody))
	reqUpdate.Header.Set("Authorization", "Bearer developer@example.com")
	reqUpdate.AddCookie(writeSimCookie)
	recUpdate := httptest.NewRecorder()
	router.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for updating family parents, got %d (%s)", recUpdate.Code, recUpdate.Body.String())
	}

	// 4. Verify audit log: MUST BE RECORDED IN REAL USER'S NAME (developer@example.com)!
	logs, err := appStore.ListAuditLogs(ctx)
	if err != nil {
		t.Fatalf("failed to query audit logs: %v", err)
	}
	var foundLog bool
	for _, l := range logs {
		if l.EntityID == parentID && l.Operation == "UPDATE" {
			foundLog = true
			if l.ChangedBy == nil || *l.ChangedBy != adminUser.ID {
				t.Errorf("expected ChangedBy to be actual user ID %v, got %v", adminUser.ID, l.ChangedBy)
			}
			if l.ChangedByEmail != "developer@example.com" {
				t.Errorf("expected ChangedByEmail to be %q, got %q", "developer@example.com", l.ChangedByEmail)
			}
			break
		}
	}
	if !foundLog {
		t.Error("expected to find audit log for the update operation")
	}

	// 5. Leave simulation
	reqLeave := httptest.NewRequest("DELETE", "/api/simulation", nil)
	ctxLeave := context.WithValue(reqLeave.Context(), auth.UserContextKey, adminUser)
	recLeave := httptest.NewRecorder()
	server.HandleLeaveSimulation(recLeave, reqLeave.WithContext(ctxLeave))
	if recLeave.Code != http.StatusOK {
		t.Errorf("expected 200 OK for leaving simulation, got %d", recLeave.Code)
	}
	leaveCookies := recLeave.Result().Cookies()
	var clearedCookie *http.Cookie
	for _, c := range leaveCookies {
		if c.Name == "thweb_sim" {
			clearedCookie = c
			break
		}
	}
	if clearedCookie == nil || clearedCookie.MaxAge > 0 {
		t.Error("expected thweb_sim cookie to be cleared with MaxAge <= 0")
	}
}

func TestEmployee_APIEndpointsAndPermissions(t *testing.T) {
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

	appStore := store.NewStore(pool)
	server := &Server{Store: appStore, Hub: NewHub()}
	go server.Hub.Run()

	listHandler := auth.RequirePermission("employees.all.read")(http.HandlerFunc(server.HandleListEmployees))
	createHandler := auth.RequirePermission("employees.all.write")(http.HandlerFunc(server.HandleCreateEmployee))
	updateHandler := auth.RequirePermission("employees.all.write")(http.HandlerFunc(server.HandleUpdateEmployee))
	deleteHandler := auth.RequirePermission("employees.all.write")(http.HandlerFunc(server.HandleDeleteEmployee))

	uForbidden := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "no-emp@example.com",
		EffectivePermissions: []string{"families.all.read"},
	}
	uRead := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "emp-reader@example.com",
		EffectivePermissions: []string{"employees.all.read"},
	}
	writeEmail := fmt.Sprintf("emp-writer-%s@example.com", uuid.New().String()[:8])
	uWrite := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                writeEmail,
		EffectivePermissions: []string{"employees.all.write"},
	}
	if _, err := pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", uWrite.ID, uWrite.Email); err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}

	// 1. GET /api/employees permissions
	reqGet := httptest.NewRequest("GET", "/api/employees", nil)
	recGet1 := httptest.NewRecorder()
	listHandler.ServeHTTP(recGet1, reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, uForbidden)))
	if recGet1.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for GET /api/employees without permission, got %d", recGet1.Code)
	}

	recGet2 := httptest.NewRecorder()
	listHandler.ServeHTTP(recGet2, reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, uRead)))
	if recGet2.Code != http.StatusOK {
		t.Errorf("expected 200 OK for GET /api/employees with employees.all.read, got %d", recGet2.Code)
	}

	recGet3 := httptest.NewRecorder()
	listHandler.ServeHTTP(recGet3, reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, uWrite)))
	if recGet3.Code != http.StatusOK {
		t.Errorf("expected 200 OK for GET /api/employees with implied employees.all.write, got %d", recGet3.Code)
	}

	// 2. POST /api/employees permissions & validation
	createBody := `{
		"first_name": "Hans",
		"last_name": "Bauer",
		"employee_type": "caregiver",
		"emails": [{"value": "hans@example.com", "identifier_email": true, "address_list": true}],
		"phones": [{"value": "0123456789"}],
		"address": "Waldweg 3",
		"is_kinderschutzbeauftragter": true
	}`
	reqPost := httptest.NewRequest("POST", "/api/employees", strings.NewReader(createBody))
	recPost1 := httptest.NewRecorder()
	createHandler.ServeHTTP(recPost1, reqPost.WithContext(context.WithValue(reqPost.Context(), auth.UserContextKey, uRead)))
	if recPost1.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for POST /api/employees with read-only permission, got %d", recPost1.Code)
	}

	reqPostValid := httptest.NewRequest("POST", "/api/employees", strings.NewReader(createBody))
	recPostValid := httptest.NewRecorder()
	createHandler.ServeHTTP(recPostValid, reqPostValid.WithContext(context.WithValue(reqPostValid.Context(), auth.UserContextKey, uWrite)))
	if recPostValid.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for POST /api/employees, got %d (body: %s)", recPostValid.Code, recPostValid.Body.String())
	}

	var createdEmp models.Employee
	if err := json.Unmarshal(recPostValid.Body.Bytes(), &createdEmp); err != nil {
		t.Fatalf("failed to decode created employee JSON: %v", err)
	}
	if createdEmp.ID == uuid.Nil || createdEmp.FirstName != "Hans" || !createdEmp.IsKinderschutzbeauftragter {
		t.Fatalf("unexpected created employee response: %+v", createdEmp)
	}

	// 3. PUT /api/employees/{id}
	updateBody := `{
		"first_name": "Hans-Peter",
		"last_name": "Bauer",
		"employee_type": "bufdi",
		"emails": [{"value": "hans.peter@example.com", "identifier_email": false}],
		"phones": [],
		"address": "Waldweg 5",
		"is_kinderschutzbeauftragter": false
	}`
	rCtx := chi.NewRouteContext()
	rCtx.URLParams.Add("id", createdEmp.ID.String())

	reqPut := httptest.NewRequest("PUT", "/api/employees/"+createdEmp.ID.String(), strings.NewReader(updateBody))
	reqPut = reqPut.WithContext(context.WithValue(reqPut.Context(), chi.RouteCtxKey, rCtx))
	reqPut = reqPut.WithContext(context.WithValue(reqPut.Context(), auth.UserContextKey, uWrite))

	recPut := httptest.NewRecorder()
	updateHandler.ServeHTTP(recPut, reqPut)
	if recPut.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for PUT /api/employees/{id}, got %d (body: %s)", recPut.Code, recPut.Body.String())
	}

	var updatedEmp models.Employee
	if err := json.Unmarshal(recPut.Body.Bytes(), &updatedEmp); err != nil {
		t.Fatalf("failed to decode updated employee JSON: %v", err)
	}
	if updatedEmp.FirstName != "Hans-Peter" || updatedEmp.EmployeeType != "bufdi" || updatedEmp.IsKinderschutzbeauftragter {
		t.Fatalf("unexpected updated employee response: %+v", updatedEmp)
	}

	// 4. DELETE /api/employees/{id}
	reqDel := httptest.NewRequest("DELETE", "/api/employees/"+createdEmp.ID.String(), nil)
	reqDel = reqDel.WithContext(context.WithValue(reqDel.Context(), chi.RouteCtxKey, rCtx))
	reqDel = reqDel.WithContext(context.WithValue(reqDel.Context(), auth.UserContextKey, uWrite))

	recDel := httptest.NewRecorder()
	deleteHandler.ServeHTTP(recDel, reqDel)
	if recDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for DELETE /api/employees/{id}, got %d", recDel.Code)
	}
}

func TestHandleUpdateChild_FamiliencardsValidation(t *testing.T) {
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

	appStore := store.NewStore(pool)
	server := &Server{Store: appStore, Hub: NewHub()}

	familyID := uuid.New()
	childID := uuid.New()

	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM children WHERE id = $1", childID)
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
	}()

	userAdmin := &models.UserWithPermissions{
		Email:                "admin@example.com",
		EffectivePermissions: []string{"children.all.write"},
	}

	// 1. Invalid familiencard year (out of range)
	invalidPayload := map[string]interface{}{
		"family_id":     familyID.String(),
		"first_name":    "Bart",
		"last_name":     "Simpson",
		"birth_date":    "2018-04-01",
		"familiencards": []int{1850},
	}
	bodyBytes, _ := json.Marshal(invalidPayload)

	req := httptest.NewRequest("PUT", "/api/children/"+childID.String(), bytes.NewReader(bodyBytes))
	rCtx := chi.NewRouteContext()
	rCtx.URLParams.Add("id", childID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rCtx))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, userAdmin))

	rec := httptest.NewRecorder()
	server.HandleUpdateChild(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for invalid familiencard year, got %d", rec.Code)
	}

	// 2. Valid familiencards
	validPayload := map[string]interface{}{
		"family_id":     familyID.String(),
		"first_name":    "Bart",
		"last_name":     "Simpson",
		"birth_date":    "2018-04-01",
		"familiencards": []int{2025, 2026},
	}
	bodyBytes, _ = json.Marshal(validPayload)

	req = httptest.NewRequest("PUT", "/api/children/"+childID.String(), bytes.NewReader(bodyBytes))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rCtx))
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, userAdmin))

	rec = httptest.NewRecorder()
	server.HandleUpdateChild(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid familiencard, got %d (body: %s)", rec.Code, rec.Body.String())
	}
}

func TestHandleListAuditLogs_PaginationAndSearch(t *testing.T) {
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

	appStore := store.NewStore(pool)

	testUserID := uuid.New()
	userEmail := "audit-handler-tester@example.com"
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING", testUserID, userEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	adminUser := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                userEmail,
		EffectivePermissions: []string{"*"},
	}

	// Create a family to generate audit logs
	_, err = appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{
			FirstName: "Wolfgang",
			LastName:  "Mozart",
			Address:   "Salzburg Getreidegasse 9",
			Emails: models.MultiValueList{
				{Value: "wolfgang@amadeus.at", AddressList: true},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}

	server := &Server{Store: appStore}

	// 1. Test search with matching query
	req := httptest.NewRequest("GET", "/api/audit-logs?q=Getreidegasse", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, adminUser))
	rec := httptest.NewRecorder()
	server.HandleListAuditLogs(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	var logs []models.AuditLog
	if err := json.Unmarshal(rec.Body.Bytes(), &logs); err != nil {
		t.Fatalf("expected JSON array response, got error: %v (body: %s)", err, rec.Body.String())
	}
	if len(logs) == 0 {
		t.Errorf("expected at least 1 log matching 'Getreidegasse', got 0")
	}

	// 2. Test search with non-matching query
	req = httptest.NewRequest("GET", "/api/audit-logs?q=NonExistentQueryZzzz", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, adminUser))
	rec = httptest.NewRecorder()
	server.HandleListAuditLogs(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	logs = nil
	if err := json.Unmarshal(rec.Body.Bytes(), &logs); err != nil {
		t.Fatalf("expected JSON array response, got error: %v", err)
	}
	if len(logs) != 0 {
		t.Errorf("expected 0 logs matching non-existent query, got %d", len(logs))
	}

	// 3. Test envelope format
	req = httptest.NewRequest("GET", "/api/audit-logs?format=envelope&limit=10", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, adminUser))
	rec = httptest.NewRecorder()
	server.HandleListAuditLogs(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	var envResp struct {
		Logs    []models.AuditLog `json:"logs"`
		HasMore bool              `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envResp); err != nil {
		t.Fatalf("expected JSON envelope response, got error: %v", err)
	}
	if len(envResp.Logs) == 0 {
		t.Errorf("expected logs in envelope response, got 0")
	}
	if rec.Header().Get("X-Has-More") == "" {
		t.Errorf("expected X-Has-More header to be set")
	}
}

func TestAllergies_ChildrenEmployeesSummaryAndAudit(t *testing.T) {
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

	appStore := store.NewStore(pool)
	_, _ = pool.Exec(ctx, "DELETE FROM data_encryption_keys WHERE purpose = $1", crypto.PurposeAllergies)
	allergiesKMS := crypto.NewMockKMSProvider()
	hub := NewHub()
	server := &Server{
		Store:                appStore,
		Hub:                  hub,
		AllergiesKMSProvider: allergiesKMS,
	}

	testUserID := uuid.New()
	userEmail := "allergies-tester@example.com"
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING", testUserID, userEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	// Create 2 families
	fam1, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{FirstName: "Anna", LastName: "AllergieFam1"},
	})
	if err != nil {
		t.Fatalf("failed to create family 1: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, fam1.ID)
	}()

	fam2, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{FirstName: "Bernd", LastName: "AllergieFam2"},
	})
	if err != nil {
		t.Fatalf("failed to create family 2: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, fam2.ID)
	}()

	child1ID := uuid.New()
	if err := appStore.UpdateChild(ctx, testUserID, child1ID, models.Child{
		ID:        child1ID,
		FamilyID:  fam1.ID,
		FirstName: "Max",
		LastName:  "AllergieFam1",
		BirthDate: time.Date(2022, 3, 15, 0, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("failed to create child 1: %v", err)
	}
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       child1ID,
		ChangeDate:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		TargetGroup: 1,
	})

	child2ID := uuid.New()
	if err := appStore.UpdateChild(ctx, testUserID, child2ID, models.Child{
		ID:        child2ID,
		FamilyID:  fam2.ID,
		FirstName: "Lisa",
		LastName:  "AllergieFam2",
		BirthDate: time.Date(2021, 7, 10, 0, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("failed to create child 2: %v", err)
	}
	_, _ = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       child2ID,
		ChangeDate:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		TargetGroup: 1,
	})

	// 1. MGA user (has allergies.children.write & families.all.read, NOT children.all.write) updates child1 and child2 allergies
	mgaUser := &models.UserWithPermissions{
		ID:    testUserID,
		Email: userEmail,
		EffectivePermissions: []string{
			"families.all.read",
			"families.all.restrictedread",
			"allergies.children.read",
			"allergies.children.write",
			"allergies.summary.read",
			"audit.view",
		},
	}

	updateBody1 := []byte(`{"allergies": ["Erdnuss", "Laktose"]}`)
	req1 := httptest.NewRequest("PUT", "/api/children/"+child1ID.String(), bytes.NewReader(updateBody1))
	rctx1 := chi.NewRouteContext()
	rctx1.URLParams.Add("id", child1ID.String())
	req1 = req1.WithContext(context.WithValue(context.WithValue(req1.Context(), chi.RouteCtxKey, rctx1), auth.UserContextKey, mgaUser))
	rec1 := httptest.NewRecorder()
	server.HandleUpdateChild(rec1, req1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK when MGA updates child1 allergies, got %d (%s)", rec1.Code, rec1.Body.String())
	}

	// Verify MGA cannot modify child1's first_name without children.all.write
	forbiddenBody := []byte(`{"first_name": "HackedName", "allergies": ["Erdnuss"]}`)
	reqForb := httptest.NewRequest("PUT", "/api/children/"+child1ID.String(), bytes.NewReader(forbiddenBody))
	reqForb = reqForb.WithContext(context.WithValue(context.WithValue(reqForb.Context(), chi.RouteCtxKey, rctx1), auth.UserContextKey, mgaUser))
	recForb := httptest.NewRecorder()
	server.HandleUpdateChild(recForb, reqForb)
	if recForb.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when MGA tries to change first_name without children.all.write, got %d", recForb.Code)
	}

	// Update child2 allergies using extensible object syntax {"name": "..."} to test backward/forward compatibility
	updateBody2 := []byte(`{"allergies": [{"name": "erdnuss"}, {"name": "Haselnuss"}]}`)
	req2 := httptest.NewRequest("PUT", "/api/children/"+child2ID.String(), bytes.NewReader(updateBody2))
	rctx2 := chi.NewRouteContext()
	rctx2.URLParams.Add("id", child2ID.String())
	req2 = req2.WithContext(context.WithValue(context.WithValue(req2.Context(), chi.RouteCtxKey, rctx2), auth.UserContextKey, mgaUser))
	rec2 := httptest.NewRecorder()
	server.HandleUpdateChild(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK when MGA updates child2 allergies, got %d (%s)", rec2.Code, rec2.Body.String())
	}

	// 2. Overview endpoint (/api/families/overview):
	//    Due to privacy constraints, /api/families/overview must NOT serve allergies per person (not even for own child or admin).
	parentUser1 := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "parent1@example.com",
		FamilyID:             &fam1.ID,
		EffectivePermissions: []string{"families.all.restrictedread", "allergies.summary.read"},
	}
	reqOv := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqOv = reqOv.WithContext(context.WithValue(reqOv.Context(), auth.UserContextKey, parentUser1))
	recOv := httptest.NewRecorder()
	server.HandleListFamiliesOverview(recOv, reqOv)
	if recOv.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for overview, got %d", recOv.Code)
	}
	ovBodyStr := recOv.Body.String()
	if strings.Contains(ovBodyStr, "Erdnuss") || strings.Contains(ovBodyStr, "Laktose") || strings.Contains(ovBodyStr, "allergies") {
		t.Errorf("expected overview endpoint NOT to serve allergies per person to parent, got: %s", ovBodyStr)
	}

	adminUser := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                userEmail,
		EffectivePermissions: []string{"*"},
	}
	reqAdminOv := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqAdminOv = reqAdminOv.WithContext(context.WithValue(reqAdminOv.Context(), auth.UserContextKey, adminUser))
	recAdminOv := httptest.NewRecorder()
	server.HandleListFamiliesOverview(recAdminOv, reqAdminOv)
	if recAdminOv.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for admin overview, got %d", recAdminOv.Code)
	}
	if strings.Contains(recAdminOv.Body.String(), "Erdnuss") || strings.Contains(recAdminOv.Body.String(), "allergies") {
		t.Errorf("expected overview endpoint NOT to serve allergies per person even to admin, got: %s", recAdminOv.Body.String())
	}

	// 3. Employee allergies: create employee with allergies and verify summary
	empBody := []byte(`{"first_name": "Erika", "last_name": "Koechin", "employee_type": "cook", "allergies": ["Sellerie", "Gluten"]}`)
	reqEmp := httptest.NewRequest("POST", "/api/employees", bytes.NewReader(empBody))
	reqEmp = reqEmp.WithContext(context.WithValue(reqEmp.Context(), auth.UserContextKey, adminUser))
	recEmp := httptest.NewRecorder()
	server.HandleCreateEmployee(recEmp, reqEmp)
	if recEmp.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for employee with allergies, got %d (%s)", recEmp.Code, recEmp.Body.String())
	}
	var createdEmp models.Employee
	if err := json.Unmarshal(recEmp.Body.Bytes(), &createdEmp); err != nil {
		t.Fatalf("failed to unmarshal created employee: %v", err)
	}
	defer func() {
		_ = appStore.DeleteEmployee(ctx, testUserID, createdEmp.ID)
	}()
	if len(createdEmp.Allergies) != 2 || createdEmp.Allergies[0] != "Sellerie" || createdEmp.Allergies[1] != "Gluten" {
		t.Errorf("expected created employee allergies [Sellerie Gluten], got %v", createdEmp.Allergies)
	}

	// Verify user with employees.all.read but WITHOUT allergies.employees.read does NOT see employee allergies
	empReaderNoAllergies := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "emp-reader@example.com",
		EffectivePermissions: []string{"employees.all.read"},
	}
	reqListEmp := httptest.NewRequest("GET", "/api/employees", nil)
	reqListEmp = reqListEmp.WithContext(context.WithValue(reqListEmp.Context(), auth.UserContextKey, empReaderNoAllergies))
	recListEmp := httptest.NewRecorder()
	server.HandleListEmployees(recListEmp, reqListEmp)
	var listedEmps []models.Employee
	_ = json.Unmarshal(recListEmp.Body.Bytes(), &listedEmps)
	for _, e := range listedEmps {
		if e.ID == createdEmp.ID && len(e.Allergies) > 0 {
			t.Errorf("expected employee allergies to be hidden without allergies.employees.read, got %v", e.Allergies)
		}
	}

	// 4. Test HandleGetAllergiesSummary (/api/allergies/summary):
	//    Group 1 has child1 (Erdnuss, Laktose) and child2 (erdnuss, Haselnuss) -> deduplicated: [Erdnuss, Haselnuss, Laktose]
	//    Employees has Erika (Sellerie, Gluten) -> deduplicated: [Gluten, Sellerie]
	reqSum := httptest.NewRequest("GET", "/api/allergies/summary?date=2026-06-01", nil)
	reqSum = reqSum.WithContext(context.WithValue(reqSum.Context(), auth.UserContextKey, parentUser1))
	recSum := httptest.NewRecorder()
	server.HandleGetAllergiesSummary(recSum, reqSum)
	if recSum.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for allergies summary, got %d (%s)", recSum.Code, recSum.Body.String())
	}
	var sumResp AllergiesSummaryResponse
	if err := json.Unmarshal(recSum.Body.Bytes(), &sumResp); err != nil {
		t.Fatalf("failed to unmarshal allergies summary: %v", err)
	}
	if len(sumResp.Groups) != 3 {
		t.Fatalf("expected 3 groups in allergies summary, got %d", len(sumResp.Groups))
	}
	grp1 := sumResp.Groups[0]
	if grp1.GroupID != 1 || len(grp1.Allergies) != 3 || grp1.Allergies[0] != "Erdnuss" || grp1.Allergies[1] != "Haselnuss" || grp1.Allergies[2] != "Laktose" {
		t.Errorf("expected group 1 deduplicated allergies [Erdnuss Haselnuss Laktose], got %+v", grp1.Allergies)
	}
	if len(grp1.FoodAllergies) != 3 || grp1.FoodAllergies[0] != "Erdnuss" || grp1.FoodAllergies[1] != "Haselnuss" || grp1.FoodAllergies[2] != "Laktose" {
		t.Errorf("expected group 1 food allergies [Erdnuss Haselnuss Laktose], got %+v", grp1.FoodAllergies)
	}
	if len(sumResp.Employees) < 2 {
		t.Errorf("expected employee allergies in summary to include Gluten and Sellerie, got %+v", sumResp.Employees)
	}

	// 5. Verify Audit Log records who edited allergies (changed_by) and sets allergies_updated: true without leaking plaintext allergy strings
	logs, _, err := appStore.QueryAuditLogsForUser(ctx, mgaUser, models.AuditLogFilter{Limit: 20})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser failed: %v", err)
	}
	foundChild1Audit := false
	for _, l := range logs {
		if l.EntityType == "child" && l.EntityID == child1ID && l.Operation == "UPDATE" {
			afterStr := string(l.AfterSnapshot)
			if strings.Contains(afterStr, `"allergies_updated":true`) {
				foundChild1Audit = true
			}
			if strings.Contains(afterStr, "Erdnuss") || strings.Contains(afterStr, "Laktose") {
				t.Errorf("CRITICAL: audit log after_snapshot leaked plaintext allergy strings: %s", afterStr)
			}
		}
	}
	if !foundChild1Audit {
		t.Errorf("expected child UPDATE audit log with allergies_updated=true for child1")
	}
}

func TestAllergies_CachedCipherContextInServer(t *testing.T) {
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

	appStore := store.NewStore(pool)
	_, _ = pool.Exec(ctx, "DELETE FROM data_encryption_keys WHERE purpose = $1", crypto.PurposeAllergies)
	allergiesKMS := crypto.NewMockKMSProvider()
	hub := NewHub()
	server := &Server{
		Store:                appStore,
		Hub:                  hub,
		AllergiesKMSProvider: allergiesKMS,
	}

	testUserID := uuid.New()
	userEmail := "cache-tester@example.com"
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING", testUserID, userEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	fam, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{FirstName: "CacheTester", LastName: "Family"},
	})
	if err != nil {
		t.Fatalf("failed to create family: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, fam.ID)
	}()

	childID := uuid.New()
	if err := appStore.UpdateChild(ctx, testUserID, childID, models.Child{
		ID:        childID,
		FamilyID:  fam.ID,
		FirstName: "Leo",
		LastName:  "Cached",
		BirthDate: time.Date(2022, 5, 20, 0, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("failed to create child: %v", err)
	}

	adminUser := &models.UserWithPermissions{
		ID:    testUserID,
		Email: userEmail,
		EffectivePermissions: []string{
			"children.all.write",
			"allergies.children.write",
			"allergies.children.read",
			"families.all.read",
		},
	}

	// 1. Initial write creates and caches DEK
	putBody := `{"first_name":"Leo","last_name":"Cached","allergies":[{"name":"Erdnüsse","category":"lebensmittel"}]}`
	req1 := httptest.NewRequest(http.MethodPut, "/api/children/"+childID.String(), strings.NewReader(putBody))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", childID.String())
	req1 = req1.WithContext(context.WithValue(context.WithValue(req1.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, adminUser))
	w1 := httptest.NewRecorder()
	server.HandleUpdateChild(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("HandleUpdateChild failed with HTTP %d: %s", w1.Code, w1.Body.String())
	}

	decryptCallsAfterInitialWrite := allergiesKMS.DecryptCalls()

	// 2. Perform 10 GET requests to list families across separate HTTP requests
	for i := 0; i < 10; i++ {
		reqGet := httptest.NewRequest(http.MethodGet, "/api/families", nil)
		reqGet = reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, adminUser))
		wGet := httptest.NewRecorder()
		server.HandleListFamilies(wGet, reqGet)
		if wGet.Code != http.StatusOK {
			t.Fatalf("HandleListFamilies iteration %d failed: %d", i, wGet.Code)
		}
	}

	// Across all 10 requests, KMS Decrypt must NOT have been called again (served from memory cache)
	if allergiesKMS.DecryptCalls() != decryptCallsAfterInitialWrite {
		t.Fatalf("Expected 0 KMS Decrypt calls during cached GETs, got %d", allergiesKMS.DecryptCalls()-decryptCallsAfterInitialWrite)
	}

	// 3. Rotate DEK in the database
	_, newEncDEK, err := allergiesKMS.GenerateDEK(ctx, "", "")
	if err != nil {
		t.Fatalf("GenerateDEK failed: %v", err)
	}
	_, _ = pool.Exec(ctx, "UPDATE data_encryption_keys SET is_active = false WHERE purpose = $1", crypto.PurposeAllergies)
	newKeyID := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO data_encryption_keys (id, purpose, kms_key_path, encrypted_dek, is_active)
		VALUES ($1, $2, $3, $4, true)
	`, newKeyID, crypto.PurposeAllergies, allergiesKMS.KeyPath(), newEncDEK)
	if err != nil {
		t.Fatalf("Failed to insert rotated DEK: %v", err)
	}

	// 4. Next write must check active key_id in store, notice the change, unwrap the new active key, and encrypt
	putBody2 := `{"first_name":"Leo","last_name":"Cached","allergies":[{"name":"Walnüsse","category":"lebensmittel"}]}`
	req2 := httptest.NewRequest(http.MethodPut, "/api/children/"+childID.String(), strings.NewReader(putBody2))
	rctx2 := chi.NewRouteContext()
	rctx2.URLParams.Add("id", childID.String())
	req2 = req2.WithContext(context.WithValue(context.WithValue(req2.Context(), chi.RouteCtxKey, rctx2), auth.UserContextKey, adminUser))
	w2 := httptest.NewRecorder()
	server.HandleUpdateChild(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("HandleUpdateChild after rotation failed with HTTP %d: %s", w2.Code, w2.Body.String())
	}

	// Verify that the child's protected blob in DB uses the new key_id
	var rawBlob []byte
	err = pool.QueryRow(ctx, "SELECT allergies_protected FROM children WHERE id = $1", childID).Scan(&rawBlob)
	if err != nil {
		t.Fatalf("Query updated child failed: %v", err)
	}
	var blobKeyID uuid.UUID
	copy(blobKeyID[:], rawBlob[1:17])
	if blobKeyID != newKeyID {
		t.Fatalf("Expected new blob to be encrypted with rotated key %s, got %s", newKeyID, blobKeyID)
	}
}

func TestMealAllergensHandlers(t *testing.T) {
	ctx := context.Background()
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	server := &Server{
		Store: appStore,
		Hub:   NewHub(),
	}

	testDate := "2099-11-16"

	// Ensure meal_allergens and meal_allergens_history tables exist and are clean for testDate
	_, _ = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS meal_allergens (
			date DATE PRIMARY KEY,
			cook_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
			cook_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
			cook_custom_name TEXT NOT NULL DEFAULT '',
			cooks JSONB NOT NULL DEFAULT '[]'::jsonb,
			meal_components JSONB NOT NULL DEFAULT '[]'::jsonb,
			status TEXT NOT NULL DEFAULT 'unspecified' CHECK (status IN ('unspecified', 'not_relevant', 'not_finalized', 'finalized')),
			documentation JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE meal_allergens ADD COLUMN IF NOT EXISTS cooks JSONB NOT NULL DEFAULT '[]'::jsonb;
		CREATE TABLE IF NOT EXISTS meal_allergens_history (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			cooking_date DATE NOT NULL,
			operation TEXT NOT NULL,
			before_snapshot JSONB,
			after_snapshot JSONB NOT NULL,
			changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
			changed_by_email TEXT NOT NULL DEFAULT '',
			is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
			kiosk_name TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens_history WHERE cooking_date = $1", testDate)
	_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens WHERE date = $1", testDate)
	_, _ = pool.Exec(ctx, "DELETE FROM meal_plan_from_sheets WHERE date = $1", testDate)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens_history WHERE cooking_date = $1", testDate)
		_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens WHERE date = $1", testDate)
		_, _ = pool.Exec(ctx, "DELETE FROM meal_plan_from_sheets WHERE date = $1", testDate)
	}()

	// Seed meal plan for testDate
	if err := appStore.SeedTestMealPlan(ctx, testDate, "Maria Köchin", "Spaghetti Bolognese", "Salat", "Obst"); err != nil {
		t.Fatalf("SeedTestMealPlan failed: %v", err)
	}

	userID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING", userID, "cook-history-test@example.com")
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	}()

	user := &models.UserWithPermissions{
		ID:                   userID,
		Email:                "cook-history-test@example.com",
		EffectivePermissions: []string{"meal_allergens.read", "meal_allergens.write"},
	}

	kioskUser := &models.UserWithPermissions{
		Email:                "kiosk+CN=kiosk-kitchen@internal",
		EffectivePermissions: []string{"meal_allergens.read", "meal_allergens.write"},
		IsKiosk:              true,
		KioskName:            "kiosk-kitchen",
	}

	// 1. GET /api/meal-allergens?start_date=2099-11-16&end_date=2099-11-16 -> unspecified status, plan components populated
	reqGet := httptest.NewRequest("GET", "/api/meal-allergens?start_date="+testDate+"&end_date="+testDate, nil)
	reqGet = reqGet.WithContext(context.WithValue(reqGet.Context(), auth.UserContextKey, user))
	recGet := httptest.NewRecorder()
	server.HandleListMealAllergens(recGet, reqGet)
	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleListMealAllergens, got %d (%s)", recGet.Code, recGet.Body.String())
	}
	var days []models.MealAllergenDay
	if err := json.Unmarshal(recGet.Body.Bytes(), &days); err != nil {
		t.Fatalf("failed to unmarshal days: %v", err)
	}
	if len(days) != 1 {
		t.Fatalf("expected 1 day, got %d", len(days))
	}
	if days[0].Status != models.MealAllergenStatusUnspecified || !days[0].HasPlanMeal || days[0].PlanCookName != "Maria Köchin" {
		t.Errorf("unexpected initial day state: %+v", days[0])
	}

	// 2. PUT /api/meal-allergens/{date} by regular user -> status becomes not_finalized, records INSERT in meal_allergens_history
	putBody := []byte(`{
		"cook_custom_name": "Maria Custom",
		"meal_components": [
			{"name": "Spaghetti Bolognese", "allergens": ["gluten", "sellerie"]},
			{"name": "Salat", "allergens": ["senf"]}
		],
		"documentation": {"pdf_url": "https://drive.google.com/file/d/123/view"}
	}`)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("date", testDate)
	reqPut := httptest.NewRequest("PUT", "/api/meal-allergens/"+testDate, bytes.NewReader(putBody))
	reqPut = reqPut.WithContext(context.WithValue(context.WithValue(reqPut.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, user))
	recPut := httptest.NewRecorder()
	server.HandleUpsertMealAllergens(recPut, reqPut)
	if recPut.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleUpsertMealAllergens, got %d (%s)", recPut.Code, recPut.Body.String())
	}
	var updatedDay models.MealAllergenDay
	_ = json.Unmarshal(recPut.Body.Bytes(), &updatedDay)
	if updatedDay.Status != models.MealAllergenStatusNotFinalized {
		t.Errorf("expected status 'not_finalized' after upsert, got %q", updatedDay.Status)
	}
	if updatedDay.CookDisplayName != "Maria Custom" || len(updatedDay.MealComponents) != 2 {
		t.Errorf("unexpected updatedDay: %+v", updatedDay)
	}

	// 3. POST /api/meal-allergens/{date}/finalize by kiosk caller -> status becomes finalized, records FINALIZE with is_kiosk=true and kiosk_name="kiosk-kitchen"
	reqFin := httptest.NewRequest("POST", "/api/meal-allergens/"+testDate+"/finalize", nil)
	reqFin = reqFin.WithContext(context.WithValue(context.WithValue(reqFin.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, kioskUser))
	recFin := httptest.NewRecorder()
	server.HandleFinalizeMealAllergens(recFin, reqFin)
	if recFin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleFinalizeMealAllergens, got %d (%s)", recFin.Code, recFin.Body.String())
	}
	var finDay models.MealAllergenDay
	_ = json.Unmarshal(recFin.Body.Bytes(), &finDay)
	if finDay.Status != models.MealAllergenStatusFinalized {
		t.Errorf("expected status 'finalized' after finalize, got %q", finDay.Status)
	}

	// 4. Subsequent PUT /api/meal-allergens/{date} by kiosk caller (editing after finalization) -> status reverts to not_finalized, records UPDATE
	putBodyKiosk := []byte(`{
		"cook_custom_name": "Maria Custom",
		"meal_components": [
			{"name": "Spaghetti Bolognese", "allergens": ["gluten", "sellerie", "laktose"]},
			{"name": "Salat", "allergens": ["senf"]}
		]
	}`)
	reqPut2 := httptest.NewRequest("PUT", "/api/meal-allergens/"+testDate, bytes.NewReader(putBodyKiosk))
	reqPut2 = reqPut2.WithContext(context.WithValue(context.WithValue(reqPut2.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, kioskUser))
	recPut2 := httptest.NewRecorder()
	server.HandleUpsertMealAllergens(recPut2, reqPut2)
	if recPut2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from second HandleUpsertMealAllergens, got %d", recPut2.Code)
	}
	var revertedDay models.MealAllergenDay
	_ = json.Unmarshal(recPut2.Body.Bytes(), &revertedDay)
	if revertedDay.Status != models.MealAllergenStatusNotFinalized {
		t.Errorf("expected status to revert to 'not_finalized' after editing finalized entry, got %q", revertedDay.Status)
	}

	// 5. Verify meal_allergens_history via GET /api/meal-allergens/history?date=2099-11-16
	reqHist := httptest.NewRequest("GET", "/api/meal-allergens/history?date="+testDate, nil)
	reqHist = reqHist.WithContext(context.WithValue(reqHist.Context(), auth.UserContextKey, user))
	recHist := httptest.NewRecorder()
	server.HandleListMealAllergensHistory(recHist, reqHist)
	if recHist.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleListMealAllergensHistory, got %d (%s)", recHist.Code, recHist.Body.String())
	}
	var histEntries []models.MealAllergensHistoryEntry
	if err := json.Unmarshal(recHist.Body.Bytes(), &histEntries); err != nil {
		t.Fatalf("failed to unmarshal meal_allergens_history: %v", err)
	}
	if len(histEntries) != 3 {
		t.Fatalf("expected 3 history entries for %s, got %d: %+v", testDate, len(histEntries), histEntries)
	}

	// Entries are ordered DESC by created_at: [0]=UPDATE (kiosk), [1]=FINALIZE (kiosk), [2]=INSERT (user)
	latest := histEntries[0]
	if latest.Operation != "UPDATE" || !latest.IsKiosk || latest.KioskName != "kiosk-kitchen" || latest.CookingDate != testDate {
		t.Errorf("unexpected latest history entry: %+v", latest)
	}
	if latest.BeforeSnapshot == nil || !strings.Contains(string(*latest.BeforeSnapshot), `"status":"finalized"`) {
		t.Errorf("expected latest before_snapshot to have status finalized, got %v", latest.BeforeSnapshot)
	}
	if !strings.Contains(string(latest.AfterSnapshot), `"laktose"`) {
		t.Errorf("expected latest after_snapshot to contain 'laktose', got %s", string(latest.AfterSnapshot))
	}

	mid := histEntries[1]
	if mid.Operation != "FINALIZE" || !mid.IsKiosk || mid.KioskName != "kiosk-kitchen" {
		t.Errorf("unexpected mid history entry: %+v", mid)
	}

	first := histEntries[2]
	if first.Operation != "INSERT" || first.IsKiosk || first.KioskName != "" || first.ChangedBy == nil || *first.ChangedBy != userID || first.ChangedByEmail != "cook-history-test@example.com" {
		t.Errorf("unexpected first history entry: %+v", first)
	}
	if first.BeforeSnapshot != nil {
		t.Errorf("expected first history entry before_snapshot to be nil, got %s", string(*first.BeforeSnapshot))
	}

	// 6. Verify multi-cook persistence and same-surname display formatting ("GivenNameA & GivenNameB CommonSurname")
	famID := uuid.New()
	p1ID := uuid.New()
	p2ID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID)
	if err != nil {
		t.Fatalf("failed to insert test family: %v", err)
	}
	_, err = pool.Exec(ctx, "INSERT INTO parents (id, family_id, first_name, last_name) VALUES ($1, $3, 'Anna', 'Müller'), ($2, $3, 'Thomas', 'Müller')", p1ID, p2ID, famID)
	if err != nil {
		t.Fatalf("failed to insert test parents: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM parents WHERE id IN ($1, $2)", p1ID, p2ID)
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", famID)
	}()

	putMultiCookBody := []byte(fmt.Sprintf(`{
		"cooks": [
			{"id": "%s", "type": "parent"},
			{"id": "%s", "type": "parent"}
		],
		"meal_components": [
			{"name": "Spaghetti Bolognese", "allergens": ["gluten"]}
		]
	}`, p1ID.String(), p2ID.String()))
	reqPutMulti := httptest.NewRequest("PUT", "/api/meal-allergens/"+testDate, bytes.NewReader(putMultiCookBody))
	reqPutMulti = reqPutMulti.WithContext(context.WithValue(context.WithValue(reqPutMulti.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, user))
	recPutMulti := httptest.NewRecorder()
	server.HandleUpsertMealAllergens(recPutMulti, reqPutMulti)
	if recPutMulti.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from multi-cook HandleUpsertMealAllergens, got %d (%s)", recPutMulti.Code, recPutMulti.Body.String())
	}
	var multiCookDay models.MealAllergenDay
	if err := json.Unmarshal(recPutMulti.Body.Bytes(), &multiCookDay); err != nil {
		t.Fatalf("failed to unmarshal multiCookDay: %v", err)
	}
	if len(multiCookDay.Cooks) != 2 {
		t.Errorf("expected 2 cooks in multiCookDay, got %d: %+v", len(multiCookDay.Cooks), multiCookDay.Cooks)
	}
	if multiCookDay.CookDisplayName != "Anna & Thomas Müller" {
		t.Errorf("expected CookDisplayName 'Anna & Thomas Müller', got %q", multiCookDay.CookDisplayName)
	}
}

func TestJobs_APIHandlersAndPermissions(t *testing.T) {
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

	appStore := store.NewStore(pool)
	hub := NewHub()
	authn := auth.NewAuthenticator("mock", true, appStore)

	viewerEmail := "jobs-viewer@example.com"
	readerEmail := "jobs-reader@example.com"
	writerEmail := "jobs-writer@example.com"

	viewerID := uuid.New()
	readerID := uuid.New()
	writerID := uuid.New()

	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[]'::jsonb) ON CONFLICT (id) DO NOTHING", viewerID, viewerEmail)
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[\"jobs.all.read\"]'::jsonb) ON CONFLICT (id) DO NOTHING", readerID, readerEmail)
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[\"jobs.all.write\"]'::jsonb) ON CONFLICT (id) DO NOTHING", writerID, writerEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id IN ($1, $2, $3)", viewerID, readerID, writerID)
	}()

	router := SetupRouter(appStore, authn, hub, nil)

	// 1. GET /api/jobs permission check
	reqGet := httptest.NewRequest("GET", "/api/jobs", nil)
	reqGet.Header.Set("X-Forwarded-Email", viewerEmail)
	recGetViewer := httptest.NewRecorder()
	router.ServeHTTP(recGetViewer, reqGet)
	if recGetViewer.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for viewer without jobs.all.read, got %d", recGetViewer.Code)
	}

	reqGetReader := httptest.NewRequest("GET", "/api/jobs", nil)
	reqGetReader.Header.Set("X-Forwarded-Email", readerEmail)
	recGetReader := httptest.NewRecorder()
	router.ServeHTTP(recGetReader, reqGetReader)
	if recGetReader.Code != http.StatusOK {
		t.Errorf("expected 200 OK for reader with jobs.all.read, got %d", recGetReader.Code)
	}

	// 2. POST /api/jobs permission check & creation
	newJobJSON := `{"name":"Hygiene Test","description":"Hygiene tasks","contact_email":"hygiene@tollhaus.de"}`
	reqPostReader := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(newJobJSON))
	reqPostReader.Header.Set("Content-Type", "application/json")
	reqPostReader.Header.Set("X-Forwarded-Email", readerEmail)
	recPostReader := httptest.NewRecorder()
	router.ServeHTTP(recPostReader, reqPostReader)
	if recPostReader.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for reader attempting POST /api/jobs, got %d", recPostReader.Code)
	}

	reqPostWriter := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(newJobJSON))
	reqPostWriter.Header.Set("Content-Type", "application/json")
	reqPostWriter.Header.Set("X-Forwarded-Email", writerEmail)
	recPostWriter := httptest.NewRecorder()
	router.ServeHTTP(recPostWriter, reqPostWriter)
	if recPostWriter.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created from POST /api/jobs, got %d (%s)", recPostWriter.Code, recPostWriter.Body.String())
	}
	var createdJob models.Job
	_ = json.Unmarshal(recPostWriter.Body.Bytes(), &createdJob)
	if createdJob.ID == uuid.Nil || createdJob.Name != "Hygiene Test" {
		t.Fatalf("unexpected created job: %+v", createdJob)
	}
	defer func() {
		_ = appStore.DeleteJob(ctx, writerID, createdJob.ID)
	}()

	// 3. PUT /api/jobs/{id}
	updateJobJSON := `{"name":"Hygiene Test Updated","description":"Updated hygiene tasks","contact_email":"updated@tollhaus.de","soll_persons":3}`
	reqPut := httptest.NewRequest("PUT", "/api/jobs/"+createdJob.ID.String(), strings.NewReader(updateJobJSON))
	reqPut.Header.Set("Content-Type", "application/json")
	reqPut.Header.Set("X-Forwarded-Email", writerEmail)
	recPut := httptest.NewRecorder()
	router.ServeHTTP(recPut, reqPut)
	if recPut.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from PUT /api/jobs/{id}, got %d (%s)", recPut.Code, recPut.Body.String())
	}
	var updatedJob models.Job
	_ = json.Unmarshal(recPut.Body.Bytes(), &updatedJob)
	if updatedJob.SollPersons != 3 {
		t.Fatalf("expected soll_persons=3, got %d", updatedJob.SollPersons)
	}

	// Verify PUT without soll_persons preserves existing soll_persons
	updateJobJSON2 := `{"name":"Hygiene Test Updated Again","description":"Updated hygiene tasks","contact_email":"updated@tollhaus.de"}`
	reqPut2 := httptest.NewRequest("PUT", "/api/jobs/"+createdJob.ID.String(), strings.NewReader(updateJobJSON2))
	reqPut2.Header.Set("Content-Type", "application/json")
	reqPut2.Header.Set("X-Forwarded-Email", writerEmail)
	recPut2 := httptest.NewRecorder()
	router.ServeHTTP(recPut2, reqPut2)
	if recPut2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from PUT /api/jobs/{id}, got %d (%s)", recPut2.Code, recPut2.Body.String())
	}
	var updatedJobPreserved models.Job
	_ = json.Unmarshal(recPut2.Body.Bytes(), &updatedJobPreserved)
	if updatedJobPreserved.SollPersons != 3 {
		t.Fatalf("expected soll_persons=3 to be preserved, got %d", updatedJobPreserved.SollPersons)
	}

	// 4. Create a parent and associate job
	fam, err := appStore.CreateFamilyWithParents(ctx, writerID, []models.Parent{
		{
			FirstName: "TestJobParent",
			LastName:  "Mustermann",
		},
	})
	if err != nil {
		t.Fatalf("failed to create family: %v", err)
	}
	parentID := fam.Parents[0].ID
	defer func() {
		_ = appStore.DeleteFamily(ctx, writerID, fam.ID)
	}()

	jobChildID := uuid.New()
	_ = appStore.UpdateChild(ctx, writerID, jobChildID, models.Child{
		ID:        jobChildID,
		FamilyID:  fam.ID,
		FirstName: "JobChild",
		LastName:  "Mustermann",
		BirthDate: time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	_, _ = appStore.CreateChildGroupChange(ctx, writerID, models.ChildGroupChange{
		Child:       jobChildID,
		ChangeDate:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		TargetGroup: 1,
	})

	setParentJobsJSON := fmt.Sprintf(`{"job_ids":["%s"]}`, createdJob.ID.String())
	reqSetParent := httptest.NewRequest("PUT", "/api/parents/"+parentID.String()+"/jobs", strings.NewReader(setParentJobsJSON))
	reqSetParent.Header.Set("Content-Type", "application/json")
	reqSetParent.Header.Set("X-Forwarded-Email", writerEmail)
	recSetParent := httptest.NewRecorder()
	router.ServeHTTP(recSetParent, reqSetParent)
	if recSetParent.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from PUT /api/parents/{id}/jobs, got %d (%s)", recSetParent.Code, recSetParent.Body.String())
	}

	// 5. DELETE /api/jobs/{id} should fail because parent is associated
	reqDel := httptest.NewRequest("DELETE", "/api/jobs/"+createdJob.ID.String(), nil)
	reqDel.Header.Set("X-Forwarded-Email", writerEmail)
	recDelBlocked := httptest.NewRecorder()
	router.ServeHTTP(recDelBlocked, reqDel)
	if recDelBlocked.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when deleting job with active assignments, got %d", recDelBlocked.Code)
	}

	// 6. Verify HandleListFamiliesOverview includes the job
	reqOv := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqOv.Header.Set("X-Forwarded-Email", "developer@example.com")
	recOv := httptest.NewRecorder()
	router.ServeHTTP(recOv, reqOv)
	if recOv.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/families/overview, got %d", recOv.Code)
	}
	var ovData []OverviewFamily
	_ = json.Unmarshal(recOv.Body.Bytes(), &ovData)
	var foundOvParent *OverviewParent
	for _, f := range ovData {
		for i := range f.Parents {
			if f.Parents[i].ID == parentID {
				foundOvParent = &f.Parents[i]
				break
			}
		}
	}
	if foundOvParent == nil {
		t.Fatalf("parent not found in /api/families/overview")
	}
	if len(foundOvParent.Jobs) != 1 || foundOvParent.Jobs[0].ID != createdJob.ID {
		t.Fatalf("expected 1 job on parent in overview, got %+v", foundOvParent.Jobs)
	}

	// 7. Clear parent association and delete job
	clearParentJobsJSON := `{"job_ids":[]}`
	reqClearParent := httptest.NewRequest("PUT", "/api/parents/"+parentID.String()+"/jobs", strings.NewReader(clearParentJobsJSON))
	reqClearParent.Header.Set("Content-Type", "application/json")
	reqClearParent.Header.Set("X-Forwarded-Email", writerEmail)
	recClearParent := httptest.NewRecorder()
	router.ServeHTTP(recClearParent, reqClearParent)
	if recClearParent.Code != http.StatusOK {
		t.Fatalf("expected 200 OK clearing parent jobs, got %d", recClearParent.Code)
	}

	recDelSuccess := httptest.NewRecorder()
	router.ServeHTTP(recDelSuccess, reqDel)
	if recDelSuccess.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content when deleting unassociated job, got %d (%s)", recDelSuccess.Code, recDelSuccess.Body.String())
	}

	// 6. Test GET /api/jobs/people
	reqPeopleViewer := httptest.NewRequest("GET", "/api/jobs/people", nil)
	reqPeopleViewer.Header.Set("X-Forwarded-Email", viewerEmail)
	recPeopleViewer := httptest.NewRecorder()
	router.ServeHTTP(recPeopleViewer, reqPeopleViewer)
	if recPeopleViewer.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for viewer on GET /api/jobs/people, got %d", recPeopleViewer.Code)
	}

	reqPeopleReader := httptest.NewRequest("GET", "/api/jobs/people", nil)
	reqPeopleReader.Header.Set("X-Forwarded-Email", readerEmail)
	recPeopleReader := httptest.NewRecorder()
	router.ServeHTTP(recPeopleReader, reqPeopleReader)
	if recPeopleReader.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for reader on GET /api/jobs/people, got %d", recPeopleReader.Code)
	}

	var peopleRes struct {
		Parents   []models.JobAssigneeParent   `json:"parents"`
		Employees []models.JobAssigneeEmployee `json:"employees"`
	}
	if err := json.Unmarshal(recPeopleReader.Body.Bytes(), &peopleRes); err != nil {
		t.Fatalf("failed to decode GET /api/jobs/people response: %v", err)
	}

	// 7. Test PUT /api/jobs/{id}/assignees
	// Create another job to test assignees
	newJob2JSON := `{"name":"Assignees Test Job","description":"Desc","contact_email":"assignees@example.com"}`
	reqPostJob2 := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(newJob2JSON))
	reqPostJob2.Header.Set("X-Forwarded-Email", writerEmail)
	recPostJob2 := httptest.NewRecorder()
	router.ServeHTTP(recPostJob2, reqPostJob2)
	if recPostJob2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created from POST /api/jobs, got %d", recPostJob2.Code)
	}
	var job2 models.Job
	_ = json.Unmarshal(recPostJob2.Body.Bytes(), &job2)
	defer func() {
		_ = appStore.DeleteJob(ctx, writerID, job2.ID)
	}()

	setAssigneesJSON := fmt.Sprintf(`{"parent_ids":["%s"],"employee_ids":[]}`, parentID.String())
	reqSetAssigneesReader := httptest.NewRequest("PUT", "/api/jobs/"+job2.ID.String()+"/assignees", strings.NewReader(setAssigneesJSON))
	reqSetAssigneesReader.Header.Set("X-Forwarded-Email", readerEmail)
	recSetAssigneesReader := httptest.NewRecorder()
	router.ServeHTTP(recSetAssigneesReader, reqSetAssigneesReader)
	if recSetAssigneesReader.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for reader on PUT /api/jobs/{id}/assignees, got %d", recSetAssigneesReader.Code)
	}

	reqSetAssigneesWriter := httptest.NewRequest("PUT", "/api/jobs/"+job2.ID.String()+"/assignees", strings.NewReader(setAssigneesJSON))
	reqSetAssigneesWriter.Header.Set("X-Forwarded-Email", writerEmail)
	recSetAssigneesWriter := httptest.NewRecorder()
	router.ServeHTTP(recSetAssigneesWriter, reqSetAssigneesWriter)
	if recSetAssigneesWriter.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from PUT /api/jobs/{id}/assignees, got %d (%s)", recSetAssigneesWriter.Code, recSetAssigneesWriter.Body.String())
	}
	var updatedJob2 models.JobWithAssignees
	_ = json.Unmarshal(recSetAssigneesWriter.Body.Bytes(), &updatedJob2)
	if len(updatedJob2.Parents) != 1 || updatedJob2.Parents[0].ID != parentID {
		t.Fatalf("expected 1 parent assigned to job, got %d", len(updatedJob2.Parents))
	}

	var auditBefore, auditAfter []byte
	err = pool.QueryRow(ctx, "SELECT before_snapshot, after_snapshot FROM audit_log WHERE entity_id = $1 AND operation = 'UPDATE_ASSIGNEES' ORDER BY created_at DESC LIMIT 1", job2.ID).Scan(&auditBefore, &auditAfter)
	if err != nil {
		t.Fatalf("failed to query audit log for UPDATE_ASSIGNEES: %v", err)
	}
	if !strings.Contains(string(auditAfter), "Assignees Test Job") {
		t.Errorf("expected after_snapshot to contain job name 'Assignees Test Job', got %s", string(auditAfter))
	}
	if !strings.Contains(string(auditAfter), `"added"`) || !strings.Contains(string(auditAfter), parentID.String()) {
		t.Errorf("expected after_snapshot to contain added parent, got %s", string(auditAfter))
	}

	// Clear assignees
	clearAssigneesJSON := `{"parent_ids":[],"employee_ids":[]}`
	reqClear := httptest.NewRequest("PUT", "/api/jobs/"+job2.ID.String()+"/assignees", strings.NewReader(clearAssigneesJSON))
	reqClear.Header.Set("X-Forwarded-Email", writerEmail)
	recClear := httptest.NewRecorder()
	router.ServeHTTP(recClear, reqClear)
	if recClear.Code != http.StatusOK {
		t.Fatalf("expected 200 OK clearing assignees, got %d", recClear.Code)
	}

	err = pool.QueryRow(ctx, "SELECT before_snapshot, after_snapshot FROM audit_log WHERE entity_id = $1 AND operation = 'UPDATE_ASSIGNEES' ORDER BY created_at DESC LIMIT 1", job2.ID).Scan(&auditBefore, &auditAfter)
	if err != nil {
		t.Fatalf("failed to query audit log for clear assignees: %v", err)
	}
	if !strings.Contains(string(auditAfter), `"removed"`) || !strings.Contains(string(auditAfter), parentID.String()) {
		t.Errorf("expected after_snapshot to contain removed parent, got %s", string(auditAfter))
	}
}

func TestJobs_RolesAPI(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	appStore := store.NewStore(pool)
	hub := NewHub()
	authn := auth.NewAuthenticator("mock", true, appStore)

	adminEmail := "job-perm-admin@example.com"
	mgaEmail := "job-perm-mga@example.com"

	adminID := uuid.New()
	mgaID := uuid.New()

	// Admin has "*"
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[\"*\"]'::jsonb) ON CONFLICT (id) DO NOTHING", adminID, adminEmail)
	// MGA has jobs.all.read, jobs.all.write but NOT job.role_assignment.*
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[\"jobs.all.read\", \"jobs.all.write\"]'::jsonb) ON CONFLICT (id) DO NOTHING", mgaID, mgaEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id IN ($1, $2)", adminID, mgaID)
	}()

	router := SetupRouter(appStore, authn, hub, nil)

	// 1. GET /api/permissions
	reqPerms := httptest.NewRequest("GET", "/api/permissions", nil)
	reqPerms.Header.Set("X-Forwarded-Email", adminEmail)
	recPerms := httptest.NewRecorder()
	router.ServeHTTP(recPerms, reqPerms)
	if recPerms.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GET /api/permissions, got %d", recPerms.Code)
	}
	var permsResp struct {
		Permissions []string `json:"permissions"`
	}
	_ = json.Unmarshal(recPerms.Body.Bytes(), &permsResp)
	foundJobRoleWrite := false
	for _, p := range permsResp.Permissions {
		if p == "job.role_assignment.write" {
			foundJobRoleWrite = true
			break
		}
	}
	if !foundJobRoleWrite {
		t.Fatalf("expected job.role_assignment.write in GET /api/permissions")
	}

	// 2. MGA creating job with roles should fail with 403
	postPayloadWithRoles := `{"name":"Secret Roles Job","description":"Desc","roles":["mga"]}`
	reqPostMGA := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(postPayloadWithRoles))
	reqPostMGA.Header.Set("Content-Type", "application/json")
	reqPostMGA.Header.Set("X-Forwarded-Email", mgaEmail)
	recPostMGA := httptest.NewRecorder()
	router.ServeHTTP(recPostMGA, reqPostMGA)
	if recPostMGA.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when MGA attempts to create job with roles, got %d", recPostMGA.Code)
	}

	// 3. Admin creating job with roles should succeed (201)
	reqPostAdmin := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(postPayloadWithRoles))
	reqPostAdmin.Header.Set("Content-Type", "application/json")
	reqPostAdmin.Header.Set("X-Forwarded-Email", adminEmail)
	recPostAdmin := httptest.NewRecorder()
	router.ServeHTTP(recPostAdmin, reqPostAdmin)
	if recPostAdmin.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created when Admin creates job with roles, got %d (%s)", recPostAdmin.Code, recPostAdmin.Body.String())
	}
	var createdJob models.Job
	_ = json.Unmarshal(recPostAdmin.Body.Bytes(), &createdJob)
	defer func() {
		_ = appStore.DeleteJob(ctx, adminID, createdJob.ID)
	}()

	// 4. GET /api/jobs as MGA should have roles sanitized to empty []
	reqGetMGA := httptest.NewRequest("GET", "/api/jobs", nil)
	reqGetMGA.Header.Set("X-Forwarded-Email", mgaEmail)
	recGetMGA := httptest.NewRecorder()
	router.ServeHTTP(recGetMGA, reqGetMGA)
	if recGetMGA.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GET /api/jobs for MGA, got %d", recGetMGA.Code)
	}
	var mgaJobs []models.JobWithAssignees
	_ = json.Unmarshal(recGetMGA.Body.Bytes(), &mgaJobs)
	var foundMGAJob *models.JobWithAssignees
	for i := range mgaJobs {
		if mgaJobs[i].ID == createdJob.ID {
			foundMGAJob = &mgaJobs[i]
			break
		}
	}
	if foundMGAJob == nil {
		t.Fatalf("job not found in MGA list")
	}
	if len(foundMGAJob.Roles) != 0 {
		t.Fatalf("expected roles to be sanitized/empty for MGA, got %+v", foundMGAJob.Roles)
	}

	// 5. GET /api/jobs as Admin should see the roles
	reqGetAdmin := httptest.NewRequest("GET", "/api/jobs", nil)
	reqGetAdmin.Header.Set("X-Forwarded-Email", adminEmail)
	recGetAdmin := httptest.NewRecorder()
	router.ServeHTTP(recGetAdmin, reqGetAdmin)
	if recGetAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GET /api/jobs for Admin, got %d", recGetAdmin.Code)
	}
	var adminJobs []models.JobWithAssignees
	_ = json.Unmarshal(recGetAdmin.Body.Bytes(), &adminJobs)
	var foundAdminJob *models.JobWithAssignees
	for i := range adminJobs {
		if adminJobs[i].ID == createdJob.ID {
			foundAdminJob = &adminJobs[i]
			break
		}
	}
	if foundAdminJob == nil {
		t.Fatalf("job not found in Admin list")
	}
	if len(foundAdminJob.Roles) != 1 || foundAdminJob.Roles[0] != "mga" {
		t.Fatalf("expected ['mga'] roles for Admin, got %+v", foundAdminJob.Roles)
	}

	// 6. PUT /api/jobs/{id}/roles as MGA should fail with 403
	putRolesPayload := `{"roles":["viewer","mga"]}`
	reqPutMGA := httptest.NewRequest("PUT", "/api/jobs/"+createdJob.ID.String()+"/roles", strings.NewReader(putRolesPayload))
	reqPutMGA.Header.Set("Content-Type", "application/json")
	reqPutMGA.Header.Set("X-Forwarded-Email", mgaEmail)
	recPutMGA := httptest.NewRecorder()
	router.ServeHTTP(recPutMGA, reqPutMGA)
	if recPutMGA.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for MGA on PUT /api/jobs/{id}/roles, got %d", recPutMGA.Code)
	}

	// 7. PUT /api/jobs/{id}/roles as Admin should succeed
	reqPutAdmin := httptest.NewRequest("PUT", "/api/jobs/"+createdJob.ID.String()+"/roles", strings.NewReader(putRolesPayload))
	reqPutAdmin.Header.Set("Content-Type", "application/json")
	reqPutAdmin.Header.Set("X-Forwarded-Email", adminEmail)
	recPutAdmin := httptest.NewRecorder()
	router.ServeHTTP(recPutAdmin, reqPutAdmin)
	if recPutAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for Admin on PUT /api/jobs/{id}/roles, got %d (%s)", recPutAdmin.Code, recPutAdmin.Body.String())
	}
	var updatedJob models.JobWithAssignees
	_ = json.Unmarshal(recPutAdmin.Body.Bytes(), &updatedJob)
	if len(updatedJob.Roles) != 2 {
		t.Fatalf("expected 2 roles after update, got %+v", updatedJob.Roles)
	}
}

func TestHandleUpdateFamilyMentor(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	appStore := store.NewStore(pool)
	authn := auth.NewAuthenticator("mock", true, appStore)
	hub := NewHub()
	router := SetupRouter(appStore, authn, hub, nil)

	adminUserID := uuid.New()
	adminEmail := "mentor-admin-" + adminUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, $3)", adminUserID, adminEmail, []string{"*"})
	if err != nil {
		t.Fatalf("failed to insert admin user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminUserID)
	}()

	readOnlyUserID := uuid.New()
	readOnlyEmail := "mentor-readonly-" + readOnlyUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, $3)", readOnlyUserID, readOnlyEmail, []string{"families.all.read"})
	if err != nil {
		t.Fatalf("failed to insert read-only user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", readOnlyUserID)
	}()

	// 1. Create Family A (mentor candidate)
	famA, err := appStore.CreateFamilyWithParents(ctx, adminUserID, []models.Parent{
		{FirstName: "MentorA1", LastName: "FamilyA"},
		{FirstName: "MentorA2", LastName: "FamilyA"},
	})
	if err != nil {
		t.Fatalf("failed to create Family A: %v", err)
	}
	defer func() { _ = appStore.DeleteFamily(ctx, adminUserID, famA.ID) }()

	// 2. Create Family B (target)
	famB, err := appStore.CreateFamilyWithParents(ctx, adminUserID, []models.Parent{
		{FirstName: "TargetB1", LastName: "FamilyB"},
	})
	if err != nil {
		t.Fatalf("failed to create Family B: %v", err)
	}
	defer func() { _ = appStore.DeleteFamily(ctx, adminUserID, famB.ID) }()

	// 3. Test read-only user cannot update mentor (403)
	putPayload := fmt.Sprintf(`{"mentor_family_id": "%s", "mentor_parent_ids": []}`, famA.ID)
	reqRO := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putPayload))
	reqRO.Header.Set("Content-Type", "application/json")
	reqRO.Header.Set("X-Forwarded-Email", readOnlyEmail)
	recRO := httptest.NewRecorder()
	router.ServeHTTP(recRO, reqRO)
	if recRO.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for read-only user, got %d", recRO.Code)
	}

	// 4. Admin updates Family B's mentor to whole Family A
	reqAdmin := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putPayload))
	reqAdmin.Header.Set("Content-Type", "application/json")
	reqAdmin.Header.Set("X-Forwarded-Email", adminEmail)
	recAdmin := httptest.NewRecorder()
	router.ServeHTTP(recAdmin, reqAdmin)
	if recAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK updating mentor, got %d (%s)", recAdmin.Code, recAdmin.Body.String())
	}

	// Verify via GET /api/families
	reqGet := httptest.NewRequest("GET", "/api/families", nil)
	reqGet.Header.Set("X-Forwarded-Email", adminEmail)
	recGet := httptest.NewRecorder()
	router.ServeHTTP(recGet, reqGet)
	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GET /api/families, got %d", recGet.Code)
	}
	var families []models.Family
	_ = json.Unmarshal(recGet.Body.Bytes(), &families)
	var foundB *models.Family
	for i := range families {
		if families[i].ID == famB.ID {
			foundB = &families[i]
			break
		}
	}
	if foundB == nil {
		t.Fatalf("Family B not found in list")
	}
	if foundB.MentorFamilyID == nil || *foundB.MentorFamilyID != famA.ID {
		t.Fatalf("expected MentorFamilyID %s, got %v", famA.ID, foundB.MentorFamilyID)
	}
	if len(foundB.MentorParentIDs) != 0 {
		t.Fatalf("expected 0 mentor parent IDs for whole family, got %d", len(foundB.MentorParentIDs))
	}

	// 5. Update Family B's mentor to only Parent A1
	parentA1ID := famA.Parents[0].ID
	putSingleParent := fmt.Sprintf(`{"mentor_family_id": "%s", "mentor_parent_ids": ["%s"]}`, famA.ID, parentA1ID)
	reqSingle := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putSingleParent))
	reqSingle.Header.Set("Content-Type", "application/json")
	reqSingle.Header.Set("X-Forwarded-Email", adminEmail)
	recSingle := httptest.NewRecorder()
	router.ServeHTTP(recSingle, reqSingle)
	if recSingle.Code != http.StatusOK {
		t.Fatalf("expected 200 OK updating mentor to single parent, got %d (%s)", recSingle.Code, recSingle.Body.String())
	}

	// Verify single parent persisted
	famsAfter, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("failed to list families: %v", err)
	}
	for _, f := range famsAfter {
		if f.ID == famB.ID {
			if len(f.MentorParentIDs) != 1 || f.MentorParentIDs[0] != parentA1ID {
				t.Fatalf("expected mentor parent ID %s, got %+v", parentA1ID, f.MentorParentIDs)
			}
		}
	}

	// 6. Test self-mentor rejected
	putSelf := fmt.Sprintf(`{"mentor_family_id": "%s", "mentor_parent_ids": []}`, famB.ID)
	reqSelf := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putSelf))
	reqSelf.Header.Set("Content-Type", "application/json")
	reqSelf.Header.Set("X-Forwarded-Email", adminEmail)
	recSelf := httptest.NewRecorder()
	router.ServeHTTP(recSelf, reqSelf)
	if recSelf.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for self mentor, got %d", recSelf.Code)
	}

	// 7. Test invalid parent from another family rejected
	invalidParent := famB.Parents[0].ID
	putInvalidParent := fmt.Sprintf(`{"mentor_family_id": "%s", "mentor_parent_ids": ["%s"]}`, famA.ID, invalidParent)
	reqInvalid := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putInvalidParent))
	reqInvalid.Header.Set("Content-Type", "application/json")
	reqInvalid.Header.Set("X-Forwarded-Email", adminEmail)
	recInvalid := httptest.NewRecorder()
	router.ServeHTTP(recInvalid, reqInvalid)
	if recInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for invalid mentor parent, got %d", recInvalid.Code)
	}

	// 8. Clear mentor
	putClear := `{"mentor_family_id": null, "mentor_parent_ids": []}`
	reqClear := httptest.NewRequest("PUT", "/api/families/"+famB.ID.String()+"/mentor", strings.NewReader(putClear))
	reqClear.Header.Set("Content-Type", "application/json")
	reqClear.Header.Set("X-Forwarded-Email", adminEmail)
	recClear := httptest.NewRecorder()
	router.ServeHTTP(recClear, reqClear)
	if recClear.Code != http.StatusOK {
		t.Fatalf("expected 200 OK clearing mentor, got %d (%s)", recClear.Code, recClear.Body.String())
	}

	famsCleared, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("failed to list families: %v", err)
	}
	for _, f := range famsCleared {
		if f.ID == famB.ID {
			if f.MentorFamilyID != nil {
				t.Fatalf("expected MentorFamilyID nil after clear, got %v", f.MentorFamilyID)
			}
			if len(f.MentorParentIDs) != 0 {
				t.Fatalf("expected 0 mentor parent IDs after clear, got %d", len(f.MentorParentIDs))
			}
		}
	}
}

func TestHandleUpdateFamilyNotes(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	appStore := store.NewStore(pool)
	authn := auth.NewAuthenticator("mock", true, appStore)
	hub := NewHub()
	router := SetupRouter(appStore, authn, hub, nil)

	adminUserID := uuid.New()
	adminEmail := "notes-admin-" + adminUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, $3)", adminUserID, adminEmail, []string{"*"})
	if err != nil {
		t.Fatalf("failed to insert admin user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminUserID)
	}()

	readOnlyUserID := uuid.New()
	readOnlyEmail := "notes-ro-" + readOnlyUserID.String() + "@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, $3)", readOnlyUserID, readOnlyEmail, []string{"families.all.read"})
	if err != nil {
		t.Fatalf("failed to insert read-only user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", readOnlyUserID)
	}()

	fam, err := appStore.CreateFamilyWithParents(ctx, adminUserID, []models.Parent{
		{FirstName: "TestP", LastName: "NotesFamily"},
	})
	if err != nil {
		t.Fatalf("failed to create Family: %v", err)
	}
	defer func() { _ = appStore.DeleteFamily(ctx, adminUserID, fam.ID) }()

	// 1. Read-only user attempt should be forbidden (403)
	payload := `{"notes": "Confidential family note"}`
	reqRO := httptest.NewRequest("PUT", "/api/families/"+fam.ID.String()+"/notes", strings.NewReader(payload))
	reqRO.Header.Set("Content-Type", "application/json")
	reqRO.Header.Set("X-Forwarded-Email", readOnlyEmail)
	recRO := httptest.NewRecorder()
	router.ServeHTTP(recRO, reqRO)
	if recRO.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for read-only user, got %d", recRO.Code)
	}

	// 2. Admin user updates notes (200)
	reqAdmin := httptest.NewRequest("PUT", "/api/families/"+fam.ID.String()+"/notes", strings.NewReader(payload))
	reqAdmin.Header.Set("Content-Type", "application/json")
	reqAdmin.Header.Set("X-Forwarded-Email", adminEmail)
	recAdmin := httptest.NewRecorder()
	router.ServeHTTP(recAdmin, reqAdmin)
	if recAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK updating family notes, got %d (%s)", recAdmin.Code, recAdmin.Body.String())
	}

	// 3. Verify via ListFamilies
	fams, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("failed to list families: %v", err)
	}
	var found *models.Family
	for _, f := range fams {
		if f.ID == fam.ID {
			found = &f
			break
		}
	}
	if found == nil {
		t.Fatalf("family %s not found in ListFamilies", fam.ID)
	}
	if found.Notes != "Confidential family note" {
		t.Fatalf("expected family notes %q, got %q", "Confidential family note", found.Notes)
	}
}

func TestDashboardTasks_Handlers(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping postgres: %v", err)
	}

	appStore := store.NewStore(pool)
	server := &Server{
		Store: appStore,
	}

	loc, _ := time.LoadLocation("Europe/Berlin")
	todayStr := time.Now().In(loc).Format("2006-01-02")
	yesterdayStr := time.Now().In(loc).AddDate(0, 0, -1).Format("2006-01-02")

	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM completed_tasks WHERE task_date IN ($1, $2)", todayStr, yesterdayStr)
	}()

	userID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'handler-task-user@example.com', 'handler-task-user@example.com') ON CONFLICT (id) DO NOTHING", userID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	}()

	user := &models.UserWithPermissions{
		ID:    userID,
		Email: "handler-task-user@example.com",
	}

	kioskUser := &models.UserWithPermissions{
		Email:     "kiosk+CN=kiosk-tablet-kitchen@internal",
		IsKiosk:   true,
		KioskName: "kiosk-tablet-kitchen",
	}

	// 1. Mark task as done for yesterday (not today) -> 400 Bad Request
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("taskTypeId", "clean_coffee_machine")
	reqPast := httptest.NewRequest("POST", "/api/dashboard/tasks/clean_coffee_machine/complete?date="+yesterdayStr, nil)
	reqPast = reqPast.WithContext(context.WithValue(context.WithValue(reqPast.Context(), chi.RouteCtxKey, rctx), auth.UserContextKey, user))
	recPast := httptest.NewRecorder()
	server.HandleCompleteTask(recPast, reqPast)
	if recPast.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for completing task on non-today date, got %d (%s)", recPast.Code, recPast.Body.String())
	}

	// 2. Mark enter_allergens as done directly -> 400 Bad Request
	rctxAllergen := chi.NewRouteContext()
	rctxAllergen.URLParams.Add("taskTypeId", "enter_allergens")
	reqAllergen := httptest.NewRequest("POST", "/api/dashboard/tasks/enter_allergens/complete?date="+todayStr, nil)
	reqAllergen = reqAllergen.WithContext(context.WithValue(context.WithValue(reqAllergen.Context(), chi.RouteCtxKey, rctxAllergen), auth.UserContextKey, user))
	recAllergen := httptest.NewRecorder()
	server.HandleCompleteTask(recAllergen, reqAllergen)
	if recAllergen.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for completing enter_allergens directly, got %d (%s)", recAllergen.Code, recAllergen.Body.String())
	}

	// 3. Mark task as done for today by regular user -> 200 OK
	rctxToday := chi.NewRouteContext()
	rctxToday.URLParams.Add("taskTypeId", "clean_coffee_machine")
	reqToday := httptest.NewRequest("POST", "/api/dashboard/tasks/clean_coffee_machine/complete?date="+todayStr, nil)
	reqToday = reqToday.WithContext(context.WithValue(context.WithValue(reqToday.Context(), chi.RouteCtxKey, rctxToday), auth.UserContextKey, user))
	recToday := httptest.NewRecorder()
	server.HandleCompleteTask(recToday, reqToday)
	if recToday.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for completing task today, got %d (%s)", recToday.Code, recToday.Body.String())
	}
	var ctUser models.CompletedTask
	if err := json.Unmarshal(recToday.Body.Bytes(), &ctUser); err != nil {
		t.Fatalf("failed to unmarshal completed task: %v", err)
	}
	if ctUser.TaskTypeID != "clean_coffee_machine" || ctUser.CompletedByEmail != "handler-task-user@example.com" || ctUser.IsKiosk {
		t.Errorf("unexpected completed task metadata: %+v", ctUser)
	}

	// 4. Mark task as done for today by kiosk -> 200 OK
	rctxKiosk := chi.NewRouteContext()
	rctxKiosk.URLParams.Add("taskTypeId", "yellow_bin_put_out")
	reqKiosk := httptest.NewRequest("POST", "/api/dashboard/tasks/yellow_bin_put_out/complete?date="+todayStr, nil)
	reqKiosk = reqKiosk.WithContext(context.WithValue(context.WithValue(reqKiosk.Context(), chi.RouteCtxKey, rctxKiosk), auth.UserContextKey, kioskUser))
	recKiosk := httptest.NewRecorder()
	server.HandleCompleteTask(recKiosk, reqKiosk)
	if recKiosk.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for kiosk completing task, got %d (%s)", recKiosk.Code, recKiosk.Body.String())
	}
	var ctKiosk models.CompletedTask
	if err := json.Unmarshal(recKiosk.Body.Bytes(), &ctKiosk); err != nil {
		t.Fatalf("failed to unmarshal kiosk completed task: %v", err)
	}
	if !ctKiosk.IsKiosk || ctKiosk.KioskName != "kiosk-tablet-kitchen" {
		t.Errorf("unexpected kiosk metadata: %+v", ctKiosk)
	}

	// 5. Uncomplete task for today -> 200 OK
	reqUncomplete := httptest.NewRequest("POST", "/api/dashboard/tasks/clean_coffee_machine/uncomplete?date="+todayStr, nil)
	reqUncomplete = reqUncomplete.WithContext(context.WithValue(context.WithValue(reqUncomplete.Context(), chi.RouteCtxKey, rctxToday), auth.UserContextKey, user))
	recUncomplete := httptest.NewRecorder()
	server.HandleUncompleteTask(recUncomplete, reqUncomplete)
	if recUncomplete.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for uncompleting task, got %d (%s)", recUncomplete.Code, recUncomplete.Body.String())
	}

	// 6. Uncomplete task for yesterday -> 400 Bad Request
	reqUncompletePast := httptest.NewRequest("POST", "/api/dashboard/tasks/clean_coffee_machine/uncomplete?date="+yesterdayStr, nil)
	reqUncompletePast = reqUncompletePast.WithContext(context.WithValue(context.WithValue(reqUncompletePast.Context(), chi.RouteCtxKey, rctxToday), auth.UserContextKey, user))
	recUncompletePast := httptest.NewRecorder()
	server.HandleUncompleteTask(recUncompletePast, reqUncompletePast)
	if recUncompletePast.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for uncompleting task on non-today date, got %d (%s)", recUncompletePast.Code, recUncompletePast.Body.String())
	}
}

func TestHandleFeedback(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping postgres: %v", err)
	}

	appStore := store.NewStore(pool)
	server := &Server{Store: appStore}

	// Clean up feedback before test
	_, _ = pool.Exec(ctx, "DELETE FROM feedback WHERE description LIKE 'Test feedback%'")

	// 1. Invalid payload -> 400 Bad Request
	reqInvalid := httptest.NewRequest("POST", "/api/dashboard/feedback", strings.NewReader("invalid-json"))
	recInvalid := httptest.NewRecorder()
	server.HandleCreateFeedback(recInvalid, reqInvalid)
	if recInvalid.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for invalid JSON, got %d", recInvalid.Code)
	}

	// 2. Missing fields -> 400 Bad Request
	reqMissing := httptest.NewRequest("POST", "/api/dashboard/feedback", strings.NewReader(`{"feedback_type":""}`))
	recMissing := httptest.NewRecorder()
	server.HandleCreateFeedback(recMissing, reqMissing)
	if recMissing.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for missing fields, got %d", recMissing.Code)
	}

	// 3. Create feedback as kiosk user -> 201 Created
	kioskUser := &models.UserWithPermissions{
		Email:     "kiosk@internal",
		IsKiosk:   true,
		KioskName: "tablet-kitchen",
	}
	payloadKiosk := `{"feedback_type":"Verbesserungsvorschlag","description":"Test feedback: mehr Tee","contact_name":"Anna"}`
	reqKiosk := httptest.NewRequest("POST", "/api/dashboard/feedback", strings.NewReader(payloadKiosk))
	reqKiosk = reqKiosk.WithContext(context.WithValue(reqKiosk.Context(), auth.UserContextKey, kioskUser))
	recKiosk := httptest.NewRecorder()
	server.HandleCreateFeedback(recKiosk, reqKiosk)
	if recKiosk.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for feedback, got %d (%s)", recKiosk.Code, recKiosk.Body.String())
	}
	var fb models.Feedback
	if err := json.Unmarshal(recKiosk.Body.Bytes(), &fb); err != nil {
		t.Fatalf("failed to decode feedback response: %v", err)
	}
	if fb.FeedbackType != "Verbesserungsvorschlag" || fb.Description != "Test feedback: mehr Tee" || fb.ContactName != "Anna" || !fb.IsKiosk || fb.KioskName != "tablet-kitchen" {
		t.Errorf("unexpected feedback record: %+v", fb)
	}

	// 4. List feedback
	reqList := httptest.NewRequest("GET", "/api/admin/feedback?limit=10", nil)
	recList := httptest.NewRecorder()
	server.HandleListFeedback(recList, reqList)
	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list feedback, got %d (%s)", recList.Code, recList.Body.String())
	}
	var list []models.Feedback
	if err := json.Unmarshal(recList.Body.Bytes(), &list); err != nil {
		t.Fatalf("failed to decode feedback list: %v", err)
	}
	if len(list) == 0 {
		t.Errorf("expected at least 1 feedback item in list")
	}

	// Clean up
	_, _ = pool.Exec(ctx, "DELETE FROM feedback WHERE description LIKE 'Test feedback%'")
}









