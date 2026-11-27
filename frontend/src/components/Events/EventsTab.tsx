import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { parseDateKey } from '../../utils/mealPlan';
import { type CalendarEvent } from '../../utils/calendarEvents';
import { EventsCalendarView } from './EventsCalendarView';
import { EventFormModal } from './EventFormModal';
import './Events.css';

function parseEventsHashParams(): { date?: string; highlight?: string } {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.replace(/^#/, '');
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return {};
  const params = new URLSearchParams(raw.slice(qIdx + 1));
  return {
    date: params.get('date') || undefined,
    highlight: params.get('highlight') || undefined,
  };
}

export const EventsTab: React.FC = () => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('events.all.write');

  const [anchorDate, setAnchorDate] = useState<Date | undefined>(() => {
    const { date } = parseEventsHashParams();
    if (date) {
      const parsed = parseDateKey(date);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return undefined;
  });
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(() => {
    return parseEventsHashParams().highlight || null;
  });
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const { date, highlight } = parseEventsHashParams();
      if (date) {
        const parsed = parseDateKey(date);
        if (!isNaN(parsed.getTime())) {
          setAnchorDate(parsed);
        }
      }
      if (highlight) {
        setHighlightedEventId(highlight);
      }
      if (
        (date || highlight) &&
        typeof window !== 'undefined' &&
        window.location.hash.startsWith('#events?')
      ) {
        window.history.replaceState(null, '', '#events');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#events?')) {
      window.history.replaceState(null, '', '#events');
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!highlightedEventId) return;
    const timer = setTimeout(() => {
      setHighlightedEventId(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [highlightedEventId]);

  const handleRealtimeMessage = useCallback((msg: RealtimeMessage) => {
    if (msg.type === 'CALENDAR_EVENTS_UPDATED' || msg.type === 'DATA_REFRESH') {
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  useRealtime(handleRealtimeMessage);

  const handleOpenCreateModal = useCallback((defaultDate?: string, anchorEl?: HTMLElement | null) => {
    if (!canWrite) return;
    setEditingEvent(null);
    setFormInitialDate(defaultDate);
    setPopoverAnchorEl(anchorEl || null);
    setFormModalOpen(true);
  }, [canWrite]);

  const handleOpenEventPopover = useCallback((ev: CalendarEvent, anchorEl?: HTMLElement | null) => {
    setEditingEvent(ev);
    setFormInitialDate(ev.start_date);
    setPopoverAnchorEl(anchorEl || null);
    setFormModalOpen(true);
  }, []);

  const handleEventSaved = useCallback(() => {
    setFormModalOpen(false);
    setEditingEvent(null);
    setPopoverAnchorEl(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleEventDeleted = useCallback(() => {
    setFormModalOpen(false);
    setEditingEvent(null);
    setPopoverAnchorEl(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="events-tab" data-testid="events-tab">
      <EventsCalendarView
        initialDate={anchorDate}
        highlightedEventId={highlightedEventId}
        refreshTrigger={refreshTrigger}
        canWrite={canWrite}
        onOpenCreateModal={handleOpenCreateModal}
        onOpenEvent={handleOpenEventPopover}
      />

      <EventFormModal
        isOpen={formModalOpen}
        initialDate={formInitialDate}
        editingEvent={editingEvent}
        canWrite={canWrite}
        anchorEl={popoverAnchorEl}
        onClose={() => {
          setFormModalOpen(false);
          setEditingEvent(null);
          setPopoverAnchorEl(null);
        }}
        onSaved={handleEventSaved}
        onDeleted={handleEventDeleted}
      />
    </div>
  );
};
