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
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

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
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", testUserID, testUserEmail)
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
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
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
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
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
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", testUserID, testUserEmail)
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

	// 1. No group changes -> nil, false
	cg, isFormer := computeChildOverviewGroupStatus(nil, now)
	if cg != nil || isFormer {
		t.Errorf("expected nil, false for empty changes; got %v, %v", cg, isFormer)
	}

	// 2. Future enrollment only -> nil, false
	cg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
	}, now)
	if cg != nil || isFormer {
		t.Errorf("expected nil, false for future-only change; got %v, %v", cg, isFormer)
	}

	// 3. Active enrollment -> *int(2), false
	cg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
		{ChangeDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 2},
		{ChangeDate: time.Date(2027, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
	}, now)
	if cg == nil || *cg != 2 || isFormer {
		t.Errorf("expected 2, false for active enrollment; got %v, %v", cg, isFormer)
	}

	// 4. Exited on or before today -> nil, true
	cg, isFormer = computeChildOverviewGroupStatus([]models.ChildGroupChange{
		{ChangeDate: time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC), TargetGroup: 1},
		{ChangeDate: time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC), TargetGroup: 0},
	}, now)
	if cg != nil || !isFormer {
		t.Errorf("expected nil, true for former child; got %v, %v", cg, isFormer)
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
	if _, err := pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", uWrite.ID, uWrite.Email); err != nil {
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



