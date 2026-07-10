import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginButton } from './components/Auth/LoginButton';
import './App.css';

import { DataTable } from './components/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import EasyEdit, { Types } from './components/InlineEdit';
import { Pencil, Trash, Undo, Redo, Calendar, ClipboardList } from 'lucide-react';
import { MultiValueListEditor } from './components/Table/MultiValueListEditor';
import { NotesEditor } from './components/Table/NotesEditor';
import { ChildcareFeesCalculator } from './components/ChildcareFeesCalculator';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from './utils/i18n';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

interface HygieneBelehrungEvent {
  id: string;
  parent_id: string;
  event_date: string;
  event_type: 'initial' | 'recertify';
  documentation: string;
  created_at: string;
  updated_at: string;
}

interface Parent {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  emails?: string[];
  phones?: string[];
  notes?: string;
  events?: HygieneBelehrungEvent[];
  family_name?: string;
}

interface Child {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  start_date?: string | null;
  exit_date?: string | null;
  start_group?: number | null;
  hort_start_date?: string | null;
  group2_start_date?: string | null;
  notes?: string;
  family_name?: string;
}

interface Family {
  id: string;
  created_at: string;
  parents: Parent[];
  children?: Child[];
}

const LandingPage: React.FC = () => {
  return (
    <div className="landing-container">
      <h1>Kindergarten Management System</h1>
      <p>Please log in to access the system.</p>
      <LoginButton />
    </div>
  );
};

import { useRealtime } from './hooks/useRealtime';

const Dashboard: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [families, setFamilies] = React.useState<Family[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'parents' | 'children' | 'childcareFees' | 'hygieneBelehrung'>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'parents' || hash === 'children' || hash === 'childcareFees' || hash === 'hygieneBelehrung') return hash;
    const saved = localStorage.getItem('thweb_active_tab');
    return (saved === 'parents' || saved === 'children' || saved === 'childcareFees' || saved === 'hygieneBelehrung') ? saved : 'parents';
  });

  // Modal states
  const [addParentOpen, setAddParentOpen] = React.useState(false);
  const [targetFamily, setTargetFamily] = React.useState<{ id: string; name: string } | null>(null);
  const [newParentFirstName, setNewParentFirstName] = React.useState('');
  const [newParentLastName, setNewParentLastName] = React.useState('');

  const [addFamilyOpen, setAddFamilyOpen] = React.useState(false);
  const [p1FirstName, setP1FirstName] = React.useState('');
  const [p1LastName, setP1LastName] = React.useState('');
  const [p2FirstName, setP2FirstName] = React.useState('');
  const [p2LastName, setP2LastName] = React.useState('');
  const [isP2LastNameDirty, setIsP2LastNameDirty] = React.useState(false);

  const [addChildOpen, setAddChildOpen] = React.useState(false);
  const [newChildFirstName, setNewChildFirstName] = React.useState('');
  const [newChildLastName, setNewChildLastName] = React.useState('');
  const [newChildBirthDate, setNewChildBirthDate] = React.useState('');

  // Hygiene Belehrung Event states
  const [manageHygieneOpen, setManageHygieneOpen] = React.useState(false);
  const [targetParent, setTargetParent] = React.useState<Parent | null>(null);
  const [newEventDate, setNewEventDate] = React.useState('');
  const [newEventType, setNewEventType] = React.useState<'initial' | 'recertify'>('recertify');
  const [newEventDocumentation, setNewEventDocumentation] = React.useState('');

  const [confirmDelete, setConfirmDelete] = React.useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });

  const [undoStack, setUndoStack] = React.useState<any[]>(() => {
    const saved = localStorage.getItem('thweb_undo_stack');
    return saved ? JSON.parse(saved) : [];
  });
  const [redoStack, setRedoStack] = React.useState<any[]>(() => {
    const saved = localStorage.getItem('thweb_redo_stack');
    return saved ? JSON.parse(saved) : [];
  });

  const saveStacks = (undo: any[], redo: any[]) => {
    setUndoStack(undo);
    setRedoStack(redo);
    localStorage.setItem('thweb_undo_stack', JSON.stringify(undo));
    localStorage.setItem('thweb_redo_stack', JSON.stringify(redo));
  };

  const pushAction = (action: any) => {
    const newUndo = [...undoStack, action];
    if (newUndo.length > 50) {
      newUndo.shift();
    }
    saveStacks(newUndo, []);
  };

  const executeHistoryAction = async (action: any, isUndo: boolean) => {
    const { type, payload } = action;

    // Switch to target tab if needed
    const targetTab = payload.tab || (type.includes('CHILD') ? 'children' : 'parents');
    if (targetTab) {
      setActiveTab(targetTab);
      window.location.hash = targetTab;
      localStorage.setItem('thweb_active_tab', targetTab);
    }

    try {
      if (type === 'UPDATE_PARENT') {
        const targetParents = isUndo ? payload.beforeParents : payload.afterParents;
        const res = await fetch(`/api/families/${payload.familyId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ parents: targetParents }),
        });
        if (!res.ok) throw new Error();
      } 
      else if (type === 'DELETE_PARENT') {
        if (isUndo) {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ parents: payload.beforeParents }),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/parents/${payload.parentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'UPDATE_CHILD') {
        const targetChild = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/children/${payload.childId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(targetChild),
        });
        if (!res.ok) throw new Error();
      }
      else if (type === 'DELETE_CHILD') {
        if (isUndo) {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload.child),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_FAMILY') {
        if (isUndo) {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ parents: payload.parents }),
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_PARENT') {
        if (isUndo) {
          const res = await fetch(`/api/parents/${payload.parent.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/families/${payload.parent.family_id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ parents: payload.beforeParents }),
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_CHILD') {
        if (isUndo) {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload.child),
          });
          if (!res.ok) throw new Error();
        }
      }

      await fetchFamilies();

      // Scroll and highlight target row
      const targetId = payload.childId || payload.parentId || payload.familyId || payload.child?.id || payload.parent?.id;
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(`row-${targetId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.backgroundColor = 'rgba(234, 179, 8, 0.2)'; // amber flash
            el.style.transition = 'background-color 0.5s ease-out';
            setTimeout(() => {
              el.style.backgroundColor = '';
              el.style.transition = '';
            }, 1000);
          }
        }, 100);
      }
    } catch (e) {
      alert('Failed to sync undo/redo state with backend.');
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const nextUndo = [...undoStack];
    const action = nextUndo.pop()!;
    executeHistoryAction(action, true);
    saveStacks(nextUndo, [action, ...redoStack]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextRedo = [...redoStack];
    const action = nextRedo.shift()!;
    executeHistoryAction(action, false);
    saveStacks([...undoStack, action], nextRedo);
  };

  const undoRef = React.useRef(handleUndo);
  const redoRef = React.useRef(handleRedo);

  React.useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  });

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && !e.shiftKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undoRef.current();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redoRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchFamilies = React.useCallback(() => {
    return fetch('/api/families', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setFamilies(data);
        return data;
      })
      .catch((err) => console.error(err));
  }, [token]);

  React.useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'parents' || hash === 'children' || hash === 'childcareFees') {
        setActiveTab(hash);
        localStorage.setItem('thweb_active_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = activeTab;
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  useRealtime(React.useCallback((message: any) => {
    if (
      message.type === 'FAMILY_CREATED' || 
      message.type === 'FAMILY_UPDATED' || 
      message.type === 'CHILD_UPDATED'
    ) {
      fetchFamilies();
    }
  }, [fetchFamilies]));

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddParentOpen(false);
        setAddFamilyOpen(false);
        setAddChildOpen(false);
      }
    };
    if (addParentOpen || addFamilyOpen || addChildOpen || manageHygieneOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addParentOpen, addFamilyOpen, addChildOpen, manageHygieneOpen]);

  const openAddParent = (familyId: string, familyName: string) => {
    setTargetFamily({ id: familyId, name: familyName });
    setNewParentFirstName('');
    
    const family = families.find(f => f.id === familyId);
    const firstParentLastName = family?.parents?.[0]?.last_name || '';
    setNewParentLastName(firstParentLastName);
    
    setAddParentOpen(true);
  };

  const handleAddParentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFamily) return;
    if (!newParentFirstName.trim() || !newParentLastName.trim()) {
      alert(t('requiredFields'));
      return;
    }

    const family = families.find(f => f.id === targetFamily.id);
    if (!family) return;

    const newParentId = crypto.randomUUID();
    const newParent = {
      id: newParentId,
      family_id: family.id,
      first_name: newParentFirstName.trim(),
      last_name: newParentLastName.trim(),
      emails: [] as string[],
      phones: [] as string[],
    };

    const updatedParents = [...(family.parents || []), newParent];

    fetch(`/api/families/${family.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to add parent');
        pushAction({
          type: 'ADD_PARENT',
          payload: {
            tab: 'parents',
            parent: newParent,
            beforeParents: updatedParents,
          }
        });
        fetchFamilies();
        setAddParentOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const openAddChild = (familyId: string, familyName: string) => {
    setTargetFamily({ id: familyId, name: familyName });
    setNewChildFirstName('');
    
    const family = families.find(f => f.id === familyId);
    const firstParentLastName = family?.parents?.[0]?.last_name || '';
    setNewChildLastName(firstParentLastName);
    const todayISO = new Date().toISOString().split('T')[0];
    setNewChildBirthDate(formatDisplayDate(todayISO));
    setAddChildOpen(true);
  };

  const handleAddChildSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFamily) return;
    const parsedDate = parseInputDate(newChildBirthDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      alert(t('invalidDateFormat'));
      return;
    }

    const newChildId = crypto.randomUUID();
    const newChild = {
      id: newChildId,
      family_id: targetFamily.id,
      first_name: newChildFirstName.trim(),
      last_name: newChildLastName.trim(),
      birth_date: `${parsedDate}T00:00:00Z`,
      start_group: 1,
    };

    fetch(`/api/children/${newChildId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newChild),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to add child');
        pushAction({
          type: 'ADD_CHILD',
          payload: {
            tab: 'children',
            child: newChild,
          }
        });
        fetchFamilies();
        setAddChildOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const openManageHygiene = (parent: Parent) => {
    setTargetParent(parent);
    setNewEventDate(new Date().toISOString().split('T')[0]);
    const hasInitial = (parent.events || []).some(e => e.event_type === 'initial');
    setNewEventType(hasInitial ? 'recertify' : 'initial');
    setNewEventDocumentation('');
    setManageHygieneOpen(true);
  };

  const handleAddHygieneEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetParent) return;
    if (!newEventDate) {
      alert(t('invalidDate'));
      return;
    }

    const payload = {
      parent_id: targetParent.id,
      event_date: `${newEventDate}T00:00:00Z`,
      event_type: newEventType,
      documentation: newEventDocumentation.trim(),
    };

    fetch('/api/hygiene-events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create hygiene event');
        return res.json();
      })
      .then((createdEvent) => {
        fetchFamilies();
        const updatedEvents = [createdEvent, ...(targetParent.events || [])].sort(
          (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
        );
        const updatedParent = { ...targetParent, events: updatedEvents };
        setTargetParent(updatedParent);
        setNewEventDocumentation('');
        const hasInitial = updatedEvents.some(ev => ev.event_type === 'initial');
        setNewEventType(hasInitial ? 'recertify' : 'initial');
      })
      .catch((err) => alert(err.message));
  };

  const handleDeleteHygieneEvent = (eventId: string) => {
    if (!targetParent) return;
    if (!window.confirm(t('eventDeleteConfirm'))) return;

    fetch(`/api/hygiene-events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to delete hygiene event');
        fetchFamilies();
        const updatedEvents = (targetParent.events || []).filter((e) => e.id !== eventId);
        const updatedParent = { ...targetParent, events: updatedEvents };
        setTargetParent(updatedParent);
        const hasInitial = updatedEvents.some(ev => ev.event_type === 'initial');
        setNewEventType(hasInitial ? 'recertify' : 'initial');
      })
      .catch((err) => alert(err.message));
  };

  const openAddFamily = () => {
    setP1FirstName('');
    setP1LastName('');
    setP2FirstName('');
    setP2LastName('');
    setIsP2LastNameDirty(false);
    setAddFamilyOpen(true);
  };

  const handleAddFamilySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1FirstName.trim() || p1LastName.trim() === '') {
      alert(t('parent1Required'));
      return;
    }

    let createdFamilyObj: any = null;
    let finalParents: any[] = [];

    fetch('/api/families', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: p1FirstName.trim(),
        last_name: p1LastName.trim(),
        emails: [],
        phones: [],
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create family');
        return res.json();
      })
      .then((createdFamily) => {
        createdFamilyObj = createdFamily;
        finalParents = createdFamily.parents || [];
        if (p2FirstName.trim() && p2LastName.trim()) {
          const parent2Id = crypto.randomUUID();
          const parent2 = {
            id: parent2Id,
            family_id: createdFamily.id,
            first_name: p2FirstName.trim(),
            last_name: p2LastName.trim(),
            emails: [] as string[],
            phones: [] as string[],
          };
          finalParents = [...finalParents, parent2];
          return fetch(`/api/families/${createdFamily.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ parents: [parent2] }),
          }).then((putRes) => {
            if (!putRes.ok) throw new Error(t('parent2Failed'));
          });
        }
      })
      .then(() => {
        pushAction({
          type: 'ADD_FAMILY',
          payload: {
            tab: 'parents',
            familyId: createdFamilyObj.id,
            parents: finalParents,
          }
        });
        fetchFamilies();
        setAddFamilyOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveParentField = (parent: Parent, fieldName: keyof Parent, newValue: any) => {
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return;

    const originalParents = family.parents || [];
    const updatedParents = originalParents.map(p => 
      p.id === parent.id ? { ...p, [fieldName]: newValue } : p
    );

    fetch(`/api/families/${family.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to update parent');
        pushAction({
          type: 'UPDATE_PARENT',
          payload: {
            tab: 'parents',
            familyId: family.id,
            parentId: parent.id,
            beforeParents: originalParents,
            afterParents: updatedParents,
          }
        });
        fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveChildField = (child: Child, fieldName: keyof Child, newValue: any) => {
    let formattedValue = newValue;
    const isDateField = fieldName === 'birth_date' || fieldName === 'start_date' || fieldName === 'exit_date' || fieldName === 'hort_start_date' || fieldName === 'group2_start_date';
    if (isDateField && newValue && typeof newValue === 'string' && !newValue.includes('T')) {
      formattedValue = `${newValue}T00:00:00Z`;
    }

    const updatedChild = { ...child, [fieldName]: formattedValue };
    
    fetch(`/api/children/${child.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedChild),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to update child');
        pushAction({
          type: 'UPDATE_CHILD',
          payload: {
            tab: 'children',
            childId: child.id,
            before: child,
            after: updatedChild,
          }
        });
        fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleDeleteParent = (parentId: string) => {
    const parent = families.flatMap(f => f.parents || []).find(p => p.id === parentId);
    if (!parent) return;
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return;
    const originalParents = family.parents || [];

    setConfirmDelete({
      isOpen: true,
      message: t('deleteParentConfirm'),
      onConfirm: () => {
        fetch(`/api/parents/${parentId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete parent');
            pushAction({
              type: 'DELETE_PARENT',
              payload: {
                tab: 'parents',
                parentId: parentId,
                familyId: parent.family_id,
                beforeParents: originalParents,
              }
            });
            fetchFamilies();
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          })
          .catch((err) => {
            alert(err.message);
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          });
      }
    });
  };

  const handleDeleteChild = (childId: string) => {
    const child = families.flatMap(f => f.children || []).find(c => c.id === childId);
    if (!child) return;

    setConfirmDelete({
      isOpen: true,
      message: t('deleteChildConfirm'),
      onConfirm: () => {
        fetch(`/api/children/${childId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete child');
            pushAction({
              type: 'DELETE_CHILD',
              payload: {
                tab: 'children',
                childId: child.id,
                child: child,
              }
            });
            fetchFamilies();
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          })
          .catch((err) => {
            alert(err.message);
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          });
      }
    });
  };

  // Structure families with their parent sub-rows for two-layer rendering
  const parentsFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const allParents = (f.parents || []).map(p => ({
        ...p,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter parents
      const filteredParents = allParents.filter(p => {
        if (!query) return true;
        const fnMatch = (p.first_name || '').toLowerCase().includes(query);
        const lnMatch = (p.last_name || '').toLowerCase().includes(query);
        const emailMatch = (p.emails || []).some(e => e.toLowerCase().includes(query));
        const phoneMatch = (p.phones || []).some(ph => ph.toLowerCase().includes(query));
        return fnMatch || lnMatch || emailMatch || phoneMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        parents: filteredParents,
        nameMatch: familyName.toLowerCase().includes(query),
      };
    });

    if (!query) return mapped;
    return mapped.filter(f => f.nameMatch || f.parents.length > 0)
      .map(f => {
        if (f.nameMatch && f.parents.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          return {
            ...f,
            parents: (originalFamily?.parents || []).map(p => ({
              ...p,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter]);

  // Structure families with their children sub-rows for two-layer rendering
  const childrenFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const allChildren = (f.children || []).map(c => ({
        ...c,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter children
      const filteredChildren = allChildren.filter(c => {
        if (!query) return true;
        const fnMatch = (c.first_name || '').toLowerCase().includes(query);
        const lnMatch = (c.last_name || '').toLowerCase().includes(query);
        const groupLabel = c.start_group === 1 ? t('group1') : c.start_group === 2 ? t('group2') : c.start_group === 3 ? t('group3') : '';
        const groupMatch = groupLabel.toLowerCase().includes(query);
        const familyLastNameMatch = lastNames.some(ln => ln.toLowerCase().includes(query));
        return fnMatch || lnMatch || groupMatch || familyLastNameMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        children: filteredChildren,
        nameMatch: familyName.toLowerCase().includes(query),
      };
    });

    if (!query) return mapped;
    return mapped.filter(f => f.nameMatch || f.children.length > 0)
      .map(f => {
        if (f.nameMatch && f.children.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          return {
            ...f,
            children: (originalFamily?.children || []).map(c => ({
              ...c,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter]);

  const hygieneColumns = React.useMemo<ColumnDef<any>[]>(() => {
    return [
      {
        header: t('firstName'),
        accessorKey: 'first_name',
        size: 150,
      },
      {
        header: t('lastName'),
        accessorKey: 'last_name',
        size: 150,
      },
      {
        header: t('initialTraining'),
        id: 'initial_training',
        size: 150,
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const initialEvent = (parent.events || []).find((e: any) => e.event_type === 'initial');
          return <span>{initialEvent ? formatDisplayDate(initialEvent.event_date) : '-'}</span>;
        }
      },
      {
        header: t('lastInstruction'),
        id: 'last_instruction',
        size: 150,
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const events = parent.events || [];
          if (events.length === 0) return <span>-</span>;
          const latestEvent = events[0];
          return <span>{formatDisplayDate(latestEvent.event_date)}</span>;
        }
      },
      {
        header: '',
        id: 'actions',
        size: 160,
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          return (
            <button
              onClick={() => openManageHygiene(parent)}
              className="secondary-button"
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
              }}
              title={t('manageEvents')}
            >
              <ClipboardList size={14} />
              {t('manageEvents')}
            </button>
          );
        }
      }
    ];
  }, [families]);

  const parentColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: t('firstNameEdit'),
        accessorKey: 'first_name',
        size: 200,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={parent.first_name}
              onSave={(val: string) => handleSaveParentField(parent, 'first_name', val)}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editFirstName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('lastNameEdit'),
        accessorKey: 'last_name',
        size: 200,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={parent.last_name}
              onSave={(val: string) => handleSaveParentField(parent, 'last_name', val)}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editLastName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('emailsEdit'),
        accessorKey: 'emails',
        size: 300,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <MultiValueListEditor
              values={parent.emails || []}
              placeholder={t('addEmail')}
              onSave={(newValues) => handleSaveParentField(parent, 'emails', newValues)}
            />
          );
        }
      },
      {
        header: t('phonesEdit'),
        accessorKey: 'phones',
        size: 250,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <MultiValueListEditor
              values={parent.phones || []}
              placeholder={t('addPhone')}
              onSave={(newValues) => handleSaveParentField(parent, 'phones', newValues)}
            />
          );
        }
      },
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 200,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <NotesEditor
              value={parent.notes || ''}
              onSave={(val: string) => handleSaveParentField(parent, 'notes', val)}
            />
          );
        }
      },
      {
        id: 'actions',
        header: '',
        size: 50,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <button
                type="button"
                className="easy-edit-button"
                style={{
                  padding: '0.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  color: '#64748b',
                  background: 'transparent',
                  height: '28px',
                  width: '28px',
                }}
                onClick={() => handleDeleteParent(parent.id)}
                title={t('delete')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#fecaca';
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Trash size={14} />
              </button>
            </div>
          );
        }
      }
    ],
    [families, handleSaveParentField, handleDeleteParent]
  );

  const childColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: t('firstNameEdit'),
        accessorKey: 'first_name',
        size: 150,
        cell: (info) => {
          const child = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={child.first_name}
              onSave={(val: string) => handleSaveChildField(child, 'first_name', val)}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editFirstName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('lastNameEdit'),
        accessorKey: 'last_name',
        size: 150,
        cell: (info) => {
          const child = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={child.last_name}
              onSave={(val: string) => handleSaveChildField(child, 'last_name', val)}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editLastName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('birthDateEdit'),
        accessorKey: 'birth_date',
        size: 120,
        cell: (info) => {
          const child = info.row.original;
          const initialDate = child.birth_date ? child.birth_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                handleSaveChildField(child, 'birth_date', parseInputDate(val));
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editBirthDate')}
              displayComponent={<span>{formatDisplayDate(child.birth_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('startDate'),
        accessorKey: 'start_date',
        size: 150,
        cell: (info) => {
          const child = info.row.original;
          const initialDate = child.start_date ? child.start_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                const parsed = val.trim() === '' ? null : parseInputDate(val);
                handleSaveChildField(child, 'start_date', parsed);
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editStartDate')}
              displayComponent={<span>{formatDisplayDate(child.start_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                if (val.trim() === '') return true;
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('exitDate'),
        accessorKey: 'exit_date',
        size: 150,
        cell: (info) => {
          const child = info.row.original;
          const initialDate = child.exit_date ? child.exit_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                const parsed = val.trim() === '' ? null : parseInputDate(val);
                handleSaveChildField(child, 'exit_date', parsed);
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editExitDate')}
              displayComponent={<span>{formatDisplayDate(child.exit_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                if (val.trim() === '') return true;
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('startGroup'),
        accessorKey: 'start_group',
        size: 140,
        cell: (info) => {
          const child = info.row.original;
          const initialVal = child.start_group ? String(child.start_group) : '1';
          const label = child.start_group === 1 ? t('group1') : child.start_group === 2 ? t('group2') : child.start_group === 3 ? t('group3') : t('group1');
          return (
            <EasyEditComponent
              type={EasyEditTypes.SELECT}
              value={initialVal}
              onSave={(val: string) => {
                const num = val === '' ? 1 : parseInt(val, 10);
                handleSaveChildField(child, 'start_group', num);
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editStartGroup')}
              displayComponent={<span>{label}</span>}
              options={[
                { label: t('group1'), value: '1' },
                { label: t('group2'), value: '2' },
                { label: t('group3'), value: '3' },
              ]}
              viewAttributes={{}}
              onCancel={() => {}}
            />
          );
        }
      },
      {
        header: t('group2StartDate'),
        accessorKey: 'group2_start_date',
        size: 140,
        cell: (info) => {
          const child = info.row.original;
          const initialDate = child.group2_start_date ? child.group2_start_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                const parsed = val.trim() === '' ? null : parseInputDate(val);
                handleSaveChildField(child, 'group2_start_date', parsed);
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editGroup2StartDate')}
              displayComponent={<span>{formatDisplayDate(child.group2_start_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                if (val.trim() === '') return true;
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('hortStartDate'),
        accessorKey: 'hort_start_date',
        size: 140,
        cell: (info) => {
          const child = info.row.original;
          
          // Hort start date, which is non-editable if the start group is Hort (3), and in that case equals start date.
          if (child.start_group === 3) {
            return <span>{formatDisplayDate(child.start_date)}</span>;
          }

          const initialDate = child.hort_start_date ? child.hort_start_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                const parsed = val.trim() === '' ? null : parseInputDate(val);
                handleSaveChildField(child, 'hort_start_date', parsed);
              }}
              editButtonLabel={<Pencil size={14} />}
              instructions={t('editHortStartDate')}
              displayComponent={<span>{formatDisplayDate(child.hort_start_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                if (val.trim() === '') return true;
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 200,
        cell: (info) => {
          const child = info.row.original;
          return (
            <NotesEditor
              value={child.notes || ''}
              onSave={(val: string) => handleSaveChildField(child, 'notes', val)}
            />
          );
        }
      },
      {
        id: 'actions',
        header: '',
        size: 50,
        cell: (info) => {
          const child = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <button
                type="button"
                className="easy-edit-button"
                style={{
                  padding: '0.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  color: '#64748b',
                  background: 'transparent',
                  height: '28px',
                  width: '28px',
                }}
                onClick={() => handleDeleteChild(child.id)}
                title={t('delete')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#fecaca';
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Trash size={14} />
              </button>
            </div>
          );
        }
      }
    ],
    [families, handleSaveChildField, handleDeleteChild]
  );

  return (
    <div className="dashboard-container">
      <header>
        <h1>{t('title')}</h1>
        <div className="user-info">
          <span>{user?.email}</span>
          <button onClick={logout}>{t('logout')}</button>
        </div>
      </header>
      <main>
        {/* Navigation Tabs */}
        <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => { window.location.hash = 'parents'; setGlobalFilter(''); }}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'parents' ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === 'parents' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
          >
            {t('parents')}
          </button>
          <button 
            onClick={() => { window.location.hash = 'children'; setGlobalFilter(''); }}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'children' ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === 'children' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
          >
            {t('children')}
          </button>
          <button 
            onClick={() => { window.location.hash = 'childcareFees'; setGlobalFilter(''); }}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'childcareFees' ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === 'childcareFees' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
          >
            {t('childcareFees')}
          </button>
          <button 
            onClick={() => { window.location.hash = 'hygieneBelehrung'; setGlobalFilter(''); }}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'hygieneBelehrung' ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === 'hygieneBelehrung' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
          >
            {t('hygieneBelehrung')}
          </button>
        </div>

        {activeTab !== 'childcareFees' && (
          <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="search-input"
                placeholder={activeTab === 'children' ? t('searchChildren') : t('searchParents')}
                style={{ marginBottom: 0 }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="easy-edit-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '34px',
                    width: '34px',
                    opacity: undoStack.length === 0 ? 0.4 : 1,
                    cursor: undoStack.length === 0 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: 'var(--text)',
                  }}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo size={16} />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="easy-edit-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '34px',
                    width: '34px',
                    opacity: redoStack.length === 0 ? 0.4 : 1,
                    cursor: redoStack.length === 0 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: 'var(--text)',
                  }}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo size={16} />
                </button>
              </div>
            </div>
            {activeTab === 'parents' && (
              <button
                onClick={openAddFamily}
                className="primary-button"
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  border: 'none'
                }}
              >
                {t('addFamily')}
              </button>
            )}
          </div>
        )}

        {activeTab === 'parents' ? (
          <DataTable
            data={parentsFamilyData}
            columns={parentColumns}
            getSubRows={(row: any) => row.parents}
            onAddRow={openAddParent}
          />
        ) : activeTab === 'children' ? (
          <DataTable
            data={childrenFamilyData}
            columns={childColumns}
            getSubRows={(row: any) => row.children}
            onAddRow={openAddChild}
          />
        ) : activeTab === 'hygieneBelehrung' ? (
          <DataTable
            data={parentsFamilyData}
            columns={hygieneColumns}
            getSubRows={(row: any) => row.parents}
          />
        ) : (
          <ChildcareFeesCalculator
            token={token}
            families={families}
          />
        )}
      </main>

      {/* Add Parent Modal */}
      {addParentOpen && targetFamily && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addParentTo')} {targetFamily.name}</h2>
            <form onSubmit={handleAddParentSubmit}>
              <div className="modal-form-group">
                <label htmlFor="p-first-name">{t('firstName')}</label>
                <input
                  id="p-first-name"
                  type="text"
                  value={newParentFirstName}
                  onChange={(e) => setNewParentFirstName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="modal-form-group">
                <label htmlFor="p-last-name">{t('lastName')}</label>
                <input
                  id="p-last-name"
                  type="text"
                  value={newParentLastName}
                  onChange={(e) => setNewParentLastName(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setAddParentOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addParent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Family Modal */}
      {addFamilyOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addFamily')}</h2>
            <form onSubmit={handleAddFamilySubmit}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{t('parent1')}</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p1-first">{t('firstName')}</label>
                  <input
                    id="f-p1-first"
                    type="text"
                    value={p1FirstName}
                    onChange={(e) => setP1FirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p1-last">{t('lastName')}</label>
                  <input
                    id="f-p1-last"
                    type="text"
                    value={p1LastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setP1LastName(val);
                      if (!isP2LastNameDirty) {
                        setP2LastName(val);
                      }
                    }}
                    required
                  />
                </div>
              </div>

              <div className="modal-divider" style={{ margin: '1rem 0' }}></div>

              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{t('parent2')} ({CURRENT_LOCALE === 'de' ? 'optional' : 'Optional'})</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p2-first">{t('firstName')}</label>
                  <input
                    id="f-p2-first"
                    type="text"
                    value={p2FirstName}
                    onChange={(e) => setP2FirstName(e.target.value)}
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p2-last">{t('lastName')}</label>
                  <input
                    id="f-p2-last"
                    type="text"
                    value={p2LastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setP2LastName(val);
                      if (val !== '') {
                        setIsP2LastNameDirty(true);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setAddFamilyOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addFamily')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Child Modal */}
      {addChildOpen && targetFamily && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addChildTo')} {targetFamily.name}</h2>
            <form onSubmit={handleAddChildSubmit}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="c-first-name">{t('firstName')}</label>
                  <input
                    id="c-first-name"
                    type="text"
                    value={newChildFirstName}
                    onChange={(e) => setNewChildFirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="c-last-name">{t('lastName')}</label>
                  <input
                    id="c-last-name"
                    type="text"
                    value={newChildLastName}
                    onChange={(e) => setNewChildLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-form-group">
                <label htmlFor="c-birth-date">{t('birthDate')}</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="c-birth-date"
                    type="text"
                    value={newChildBirthDate}
                    onChange={(e) => setNewChildBirthDate(e.target.value)}
                    placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                    required
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      color: '#64748b',
                    }}
                    onClick={(e) => {
                      const input = e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
                      if (input) {
                        try {
                          input.showPicker();
                        } catch (err) {
                          input.click();
                        }
                      }
                    }}
                  >
                    <Calendar size={18} />
                  </button>
                  <input
                    type="date"
                    value={parseInputDate(newChildBirthDate)}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      width: '0px',
                      height: '0px',
                      opacity: 0,
                      pointerEvents: 'none',
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setNewChildBirthDate(formatDisplayDate(val));
                      }
                    }}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setAddChildOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addChild')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete.isOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444' }}>{t('delete')}</h2>
            <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              {confirmDelete.message}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setConfirmDelete(prev => ({ ...prev, isOpen: false }))}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="submit-btn"
                style={{ backgroundColor: '#ef4444' }}
                onClick={confirmDelete.onConfirm}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Manage Hygiene Events Modal */}
        {manageHygieneOpen && targetParent && (
          <div className="modal-overlay">
            <div className="modal-container" style={{ maxWidth: '600px' }}>
              <h2>{t('manageHygieneTitle')} {targetParent.first_name} {targetParent.last_name}</h2>
              
              {/* List of existing events */}
              <div style={{ marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('date')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('eventType')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('documentation')}</th>
                      <th style={{ padding: '0.5rem', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(targetParent.events || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                          {t('noEventsRecorded')}
                        </td>
                      </tr>
                    ) : (
                      (targetParent.events || []).map((ev) => (
                        <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.5rem' }}>{formatDisplayDate(ev.event_date)}</td>
                          <td style={{ padding: '0.5rem' }}>
                            {ev.event_type === 'initial' ? t('initialType') : t('recertifyType')}
                          </td>
                          <td style={{ padding: '0.5rem', whiteSpace: 'pre-wrap' }}>{ev.documentation || '-'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteHygieneEvent(ev.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                              title={t('delete')}
                            >
                              <Trash size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add New Event Form */}
              <form onSubmit={handleAddHygieneEvent} style={{ borderTop: '2px dashed var(--border)', paddingTop: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-h)' }}>
                  {t('addEvent')}
                </h3>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  {/* Event Date */}
                  <div className="modal-form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>{t('date')}</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={CURRENT_LOCALE === 'de' ? formatDisplayDate(newEventDate) : newEventDate}
                        readOnly
                        placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
                        style={{ width: '100%', paddingRight: '2.5rem' }}
                      />
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          right: '6px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                          color: '#64748b',
                        }}
                        onClick={(e) => {
                          const input = e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
                          if (input) {
                            try {
                              input.showPicker();
                            } catch (err) {
                              input.click();
                            }
                          }
                        }}
                      >
                        <Calendar size={18} />
                      </button>
                      <input
                        type="date"
                        value={newEventDate}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          width: '0px',
                          height: '0px',
                          opacity: 0,
                          pointerEvents: 'none',
                        }}
                        onChange={(e) => setNewEventDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Event Type */}
                  <div className="modal-form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>{t('eventType')}</label>
                    <select
                      value={newEventType}
                      onChange={(e) => setNewEventType(e.target.value as 'initial' | 'recertify')}
                      style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                      required
                    >
                      <option value="initial">{t('initialType')}</option>
                      <option value="recertify">{t('recertifyType')}</option>
                    </select>
                  </div>
                </div>

                {/* Documentation */}
                <div className="modal-form-group" style={{ marginBottom: '1.25rem' }}>
                  <label>{t('documentation')}</label>
                  <textarea
                    value={newEventDocumentation}
                    onChange={(e) => setNewEventDocumentation(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      minHeight: '60px',
                      fontSize: '0.875rem',
                    }}
                    placeholder={t('newItem')}
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setManageHygieneOpen(false)}>
                    {t('cancel')}
                  </button>
                  <button type="submit" className="submit-btn">
                    {t('addEvent')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>{t('loading')}</div>;
  }

  return user ? <Dashboard /> : <LandingPage />;
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
