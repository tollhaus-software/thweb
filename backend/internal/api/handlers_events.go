package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func isValidationErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "invalid") ||
		strings.Contains(msg, "must be") ||
		strings.Contains(msg, "required") ||
		strings.Contains(msg, "cannot be set") ||
		strings.Contains(msg, "cannot be multi-day")
}

func (s *Server) broadcastCalendarEventsUpdated(action string, id string) {
	if s.Hub == nil {
		return
	}
	payload := map[string]string{"action": action}
	if id != "" {
		payload["id"] = id
	}
	s.Hub.Broadcast(WSMessage{
		Type:    "CALENDAR_EVENTS_UPDATED",
		Payload: payload,
	})
}

func (s *Server) HandleListCalendarEvents(w http.ResponseWriter, r *http.Request) {
	startDate := strings.TrimSpace(r.URL.Query().Get("start_date"))
	endDate := strings.TrimSpace(r.URL.Query().Get("end_date"))

	events, err := s.Store.ListCalendarEvents(r.Context(), startDate, endDate)
	if err != nil {
		if isValidationErr(err) {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		httpErrorLog(w, r, "Failed to list calendar events", http.StatusInternalServerError, err)
		return
	}
	jsonResponse(w, events)
}

func (s *Server) HandleCreateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var ev models.CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		httpErrorLog(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	created, err := s.Store.CreateCalendarEvent(r.Context(), user.ID, ev, getActorEmail(r))
	if err != nil {
		if isValidationErr(err) {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		httpErrorLog(w, r, "Failed to create calendar event", http.StatusInternalServerError, err)
		return
	}

	s.broadcastCalendarEventsUpdated("created", created.ID.String())
	w.WriteHeader(http.StatusCreated)
	jsonResponse(w, created)
}

func (s *Server) HandleUpdateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid calendar event ID", http.StatusBadRequest, err)
		return
	}

	var ev models.CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		httpErrorLog(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	ev.ID = id

	updated, err := s.Store.UpdateCalendarEvent(r.Context(), user.ID, ev, getActorEmail(r))
	if err != nil {
		if errors.Is(err, store.ErrCalendarEventNotFound) {
			httpErrorLog(w, r, "Calendar event not found", http.StatusNotFound, err)
			return
		}
		if isValidationErr(err) {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		httpErrorLog(w, r, "Failed to update calendar event", http.StatusInternalServerError, err)
		return
	}

	s.broadcastCalendarEventsUpdated("updated", updated.ID.String())
	jsonResponse(w, updated)
}

func (s *Server) HandleDeleteCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid calendar event ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteCalendarEvent(r.Context(), user.ID, id, getActorEmail(r)); err != nil {
		if errors.Is(err, store.ErrCalendarEventNotFound) {
			httpErrorLog(w, r, "Calendar event not found", http.StatusNotFound, err)
			return
		}
		httpErrorLog(w, r, "Failed to delete calendar event", http.StatusInternalServerError, err)
		return
	}

	s.broadcastCalendarEventsUpdated("deleted", id.String())
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleImportCalendarEvents(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var req models.ImportCalendarEventsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	resp, err := s.Store.ImportCalendarEvents(r.Context(), user.ID, req, getActorEmail(r))
	if err != nil {
		if isValidationErr(err) {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		httpErrorLog(w, r, "Failed to import calendar events", http.StatusInternalServerError, err)
		return
	}

	if resp.CreatedCount > 0 || resp.DeletedCount > 0 {
		s.broadcastCalendarEventsUpdated("imported", "")
	}
	jsonResponse(w, resp)
}
