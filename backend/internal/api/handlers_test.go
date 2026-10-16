package api

import (
	"context"
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
			name: "user without audit.all.read",
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
			ID:        parentID1,
			FamilyID:  familyID1,
			FirstName: "Alice",
			LastName:  "FamilyOne",
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

	// Add child to family 1 with group change
	childID1 := uuid.New()
	child1 := models.Child{
		ID:        childID1,
		FamilyID:  familyID1,
		FirstName: "Charlie",
		LastName:  "FamilyOne",
		Notes:     "Secret child notes",
	}
	if err := appStore.UpdateChild(ctx, testUserID, childID1, child1); err != nil {
		t.Fatalf("failed to seed child: %v", err)
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
		Roles:                []string{"restricted"},
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
	// Family 1 child Charlie should have group changes
	if !strings.Contains(bodyStr, "Charlie") {
		t.Errorf("expected child Charlie in overview, got: %s", bodyStr)
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



