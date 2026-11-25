import React, { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { parseDateKey } from '../../utils/mealPlan';
import { type CalendarEvent } from '../../utils/calendarEvents';
import { EventsCalendarView } from './EventsCalendarView';
import { EventsDayView } from './EventsDayView';
import { EventFormModal } from './EventFormModal';
import { EventsImportModal } from './EventsImportModal';
import './Events.css';

export const EventsTab: React.FC = () => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('events.all.write');

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);

  const handleRealtimeMessage = useCallback((msg: RealtimeMessage) => {
    if (msg.type === 'CALENDAR_EVENTS_UPDATED' || msg.type === 'DATA_REFRESH') {
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  useRealtime(handleRealtimeMessage);

  const handleSelectDate = useCallback((dateKey: string) => {
    setAnchorDate(parseDateKey(dateKey));
    setSelectedDateKey(dateKey);
  }, []);

  const handleBackToCalendar = useCallback(() => {
    setSelectedDateKey(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleOpenCreateModal = useCallback((defaultDate?: string) => {
    setEditingEvent(null);
    setFormInitialDate(defaultDate);
    setFormModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((ev: CalendarEvent) => {
    setEditingEvent(ev);
    setFormInitialDate(ev.start_date);
    setFormModalOpen(true);
  }, []);

  const handleEventSaved = useCallback(() => {
    setFormModalOpen(false);
    setEditingEvent(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleImported = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="events-tab" data-testid="events-tab">
      {selectedDateKey ? (
        <EventsDayView
          dateKey={selectedDateKey}
          canWrite={canWrite}
          refreshTrigger={refreshTrigger}
          onBack={handleBackToCalendar}
          onChangeDate={handleSelectDate}
          onOpenCreateForDate={handleOpenCreateModal}
          onOpenEditEvent={handleOpenEditModal}
          onEventDeleted={() => setRefreshTrigger((prev) => prev + 1)}
        />
      ) : (
        <EventsCalendarView
          initialDate={anchorDate}
          refreshTrigger={refreshTrigger}
          canWrite={canWrite}
          onSelectDate={handleSelectDate}
          onOpenCreateModal={handleOpenCreateModal}
          onOpenImportModal={() => setImportModalOpen(true)}
        />
      )}

      <EventFormModal
        isOpen={formModalOpen}
        initialDate={formInitialDate}
        editingEvent={editingEvent}
        onClose={() => {
          setFormModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={handleEventSaved}
      />

      <EventsImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleImported}
      />
    </div>
  );
};
