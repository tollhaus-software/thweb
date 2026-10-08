import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginButton } from './components/Auth/LoginButton';
import './App.css';

import { DataTable } from './components/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import EasyEdit, { Types } from './components/InlineEdit';
import { Pencil, Trash, Undo, Redo, Calendar, ClipboardList, Lock, Unlock, ArrowLeft, ArrowRight, X, Clock, AlertCircle } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { MultiValueListEditor } from './components/Table/MultiValueListEditor';
import { NotesEditor } from './components/Table/NotesEditor';
import { GroupChangesPopover } from './components/Table/GroupChangesPopover';
import { VaccinationStatusEditor, type VaccinationCheck } from './components/Table/VaccinationStatusEditor';
import { ChildcareFeesCalculator } from './components/ChildcareFeesCalculator';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate, calculateYearsAndMonths } from './utils/i18n';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

interface THMembership {
  id: string;
  parent_id: string;
  start_date: string;
  end_date: string | null;
  membership_type: 'full_member' | 'supporting_member';
  created_at: string;
  updated_at: string;
}

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
  vaccination_checks?: VaccinationCheck[];
  events?: HygieneBelehrungEvent[];
  memberships?: THMembership[];
  family_name?: string;
}

interface ChildGroupChange {
  id: string;
  child: string;
  change_date: string;
  target_group: number; // 0: exit, 1: Kleine Gruppe, 2: Grosse Gruppe, 3: Hort
  created_at: string;
  updated_at: string;
}

interface Child {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  notes?: string;
  vaccination_checks?: VaccinationCheck[];
  family_name?: string;
  group_changes?: ChildGroupChange[];
}

const getGroupShortLabel = (targetGroup: number): string => {
  switch (targetGroup) {
    case 1:
      return 'Kleine Gr.';
    case 2:
      return 'Grosse Gr.';
    case 3:
      return 'Hort';
    default:
      return String(targetGroup);
  }
};

interface ChildGroupInfo {
  currentGroup: number | null;
  groupLabel: string;
  startDate: string | null;
  exitDate: string | null;
  isExited: boolean;
  isFuture: boolean;
  groupName?: string;
  sinceText?: string;
  futureDateText?: string;
  durationStr?: string;
}

const getChildGroupInfo = (changes: ChildGroupChange[] | undefined): ChildGroupInfo => {
  if (!changes || changes.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate: null,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const sorted = [...changes].sort((a, b) => a.change_date.localeCompare(b.change_date));
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const firstEnroll = sorted.find((c) => c.target_group > 0);
  const startDate = firstEnroll ? firstEnroll.change_date : null;

  // Case 1: If child has not started yet (the earliest group change with target group != 0 is in the future),
  // it formats as <group> and <clock symbol> ab <date>.
  if (firstEnroll && firstEnroll.change_date.split('T')[0] > todayStr) {
    const groupName = getGroupShortLabel(firstEnroll.target_group);
    const dateStr = formatDisplayDate(firstEnroll.change_date);
    const abWord = CURRENT_LOCALE === 'de' ? 'ab' : 'from';
    const futureDateText = `${abWord} ${dateStr}`;
    const groupLabel = `→ ${groupName} ${futureDateText}`;
    return {
      currentGroup: firstEnroll.target_group,
      groupLabel,
      groupName,
      futureDateText,
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: true,
    };
  }

  const effectiveSoFar = sorted.filter((c) => c.change_date.split('T')[0] <= todayStr);
  if (effectiveSoFar.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const latest = effectiveSoFar[effectiveSoFar.length - 1];

  // Case 2: If the child has left the group (the most recent group change, as of today, has target group = 0),
  // it should say "left <last group name> on <end date>" (en) / "Betreuungsende <end date>, davor <last group name>" (de).
  // If no previous group was recorded, it simply says "Betreuungsende <end date>" (de) / "left on <end date>" (en).
  if (latest.target_group === 0) {
    const prevEnroll = [...sorted].filter((c) => c.target_group > 0 && c.change_date.split('T')[0] <= latest.change_date.split('T')[0]).pop()
      || [...sorted].reverse().find((c) => c.target_group > 0);
    const lastGroupName = prevEnroll ? getGroupShortLabel(prevEnroll.target_group) : '';
    const endDateStr = formatDisplayDate(latest.change_date);
    const groupLabel = CURRENT_LOCALE === 'de'
      ? (lastGroupName ? `Betreuungsende ${endDateStr}, davor ${lastGroupName}` : `Betreuungsende ${endDateStr}`)
      : (lastGroupName ? `left ${lastGroupName} on ${endDateStr}` : `left on ${endDateStr}`);
    return {
      currentGroup: 0,
      groupLabel,
      startDate,
      exitDate: latest.change_date,
      isExited: true,
      isFuture: false,
    };
  }

  // Case 3: Otherwise (the child is currently in a group), it should contain the group name,
  // suffixed with "since <date> (<duration>)".
  const groupName = getGroupShortLabel(latest.target_group);
  const changeDateStr = formatDisplayDate(latest.change_date);
  const { years, months } = calculateYearsAndMonths(latest.change_date, now);
  const durationStr = CURRENT_LOCALE === 'de' ? `(${years}J ${months}M)` : `(${years}y ${months}m)`;
  const sinceWord = CURRENT_LOCALE === 'de' ? 'seit' : 'since';
  const sinceText = `${sinceWord} ${changeDateStr}`;

  return {
    currentGroup: latest.target_group,
    groupLabel: `${groupName} ${sinceText} ${durationStr}`,
    groupName,
    sinceText,
    durationStr,
    startDate,
    exitDate: null,
    isExited: false,
    isFuture: false,
  };
};

interface ChildGroupCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
}

const ChildGroupCell: React.FC<ChildGroupCellProps> = ({
  child,
  isActive,
  onOpenManage,
}) => {
  const groupInfo = getChildGroupInfo(child.group_changes);
  const cellId = `cell-group-${child.id}`;

  return (
    <div
      id={cellId}
      onClick={(e) => {
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: '0.25rem',
        cursor: 'pointer',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'var(--accent-bg)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      title={t('manageGroupChanges')}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
          fontWeight: 'normal',
          color: groupInfo.isExited ? 'var(--text-muted)' : 'inherit',
        }}
      >
        {groupInfo.isFuture && groupInfo.groupName ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                width: '100px',
                minWidth: '100px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                color: 'var(--text-muted)',
              }}
            >
              <ArrowRight size={13} style={{ flexShrink: 0 }} />
              <span>{groupInfo.groupName}</span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                width: '135px',
                minWidth: '135px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <Clock size={14} style={{ flexShrink: 0 }} />
              <span>{groupInfo.futureDateText}</span>
            </span>
          </span>
        ) : groupInfo.groupName && groupInfo.sinceText ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span
              style={{
                display: 'inline-block',
                width: '100px',
                minWidth: '100px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {groupInfo.groupName}
            </span>
            <span
              style={{
                display: 'inline-block',
                width: '135px',
                minWidth: '135px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {groupInfo.sinceText}
            </span>
            <span
              style={{
                display: 'inline-block',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {groupInfo.durationStr}
            </span>
          </span>
        ) : (
          <span>{groupInfo.groupLabel}</span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const cellEl = document.getElementById(cellId) || e.currentTarget;
          onOpenManage(child, cellEl);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--primary)',
          cursor: 'pointer',
          padding: '2px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          flexShrink: 0,
          marginLeft: '4px',
        }}
        title={t('manageGroupChanges')}
      >
        <Pencil size={12} />
      </button>
    </div>
  );
};

interface Family {
  id: string;
  created_at: string;
  parents: Parent[];
  children?: Child[];
}

const getMembershipStatus = (memberships: THMembership[] | undefined) => {
  if (!memberships || memberships.length === 0) return { text: '', color: 'inherit' };
  
  const today = new Date().toISOString().split('T')[0];

  const active = memberships.find(m => {
    const start = m.start_date.split('T')[0];
    const end = m.end_date ? m.end_date.split('T')[0] : null;
    return start <= today && (!end || end >= today);
  });

  if (active) {
    if (active.membership_type === 'full_member') {
      return { text: t('full_member'), color: 'var(--text-h)', fontWeight: '600' };
    } else {
      return { text: t('supporting_member'), color: 'var(--text-h)', fontWeight: '600' };
    }
  }

  const expired = memberships.some(m => {
    const end = m.end_date ? m.end_date.split('T')[0] : null;
    return end && end < today;
  });

  if (expired) {
    return { text: t('expired'), color: '#94a3b8', fontStyle: 'italic' };
  }

  return { text: '', color: 'inherit' };
};

interface AuditLog {
  id: string;
  transaction_id: string;
  family_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  before_snapshot: any;
  after_snapshot: any;
  changed_by: string | null;
  changed_by_email: string;
  created_at: string;
}

const formatSnapshotDetails = (log: AuditLog) => {
  const data = log.after_snapshot || log.before_snapshot;
  if (!data) return '-';

  const parts: string[] = [];
  
  if (log.entity_type === 'family') {
    if (data.parents && data.parents.length > 0) {
      const names = data.parents.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ');
      parts.push(`${t('family')}: ${names}`);
    } else {
      parts.push(`Family ID: ${log.entity_id}`);
    }
  }

  if (log.entity_type === 'parent') {
    parts.push(`${data.first_name || ''} ${data.last_name || ''}`);
    if (data.emails && data.emails.length > 0) {
      parts.push(`Emails: ${data.emails.join(', ')}`);
    }
    if (data.phones && data.phones.length > 0) {
      parts.push(`Phones: ${data.phones.join(', ')}`);
    }
    if (data.notes) {
      parts.push(`Notes: ${data.notes}`);
    }
  }

  if (log.entity_type === 'child') {
    parts.push(`${data.first_name || ''} ${data.last_name || ''}`);
    if (data.birth_date) {
      parts.push(`${t('birthDate')}: ${formatDisplayDate(data.birth_date)}`);
    }
  }

  if (log.entity_type === 'child_group_change') {
    const groupLabels: Record<number, string> = {
      0: t('exit'),
      1: t('group1'),
      2: t('group2'),
      3: t('group3'),
    };
    const groupName = groupLabels[data.target_group] || `${t('targetGroup')}: ${data.target_group}`;
    parts.push(`${t('groupChange')}: ${groupName}`);
    if (data.change_date) {
      parts.push(`${t('date')}: ${formatDisplayDate(data.change_date)}`);
    }
  }

  if (log.entity_type === 'hygiene_event') {
    const typeLabel = data.event_type === 'initial' ? t('initialType') : t('recertifyType');
    parts.push(`${typeLabel}`);
    if (data.event_date) {
      parts.push(`Datum: ${formatDisplayDate(data.event_date)}`);
    }
    if (data.documentation) {
      parts.push(`Info: ${data.documentation}`);
    }
  }

  if (log.entity_type === 'th_membership') {
    const typeLabel = data.membership_type === 'full_member' ? t('full_member') : t('supporting_member');
    parts.push(`${typeLabel}`);
    if (data.start_date) {
      parts.push(`${t('startDateLabel')}: ${formatDisplayDate(data.start_date)}`);
    }
    if (data.end_date) {
      parts.push(`${t('endDateLabel')}: ${formatDisplayDate(data.end_date)}`);
    }
  }

  return parts.join(' | ');
};

const AuditLogView: React.FC<{ logs: AuditLog[]; loading: boolean }> = ({ logs, loading }) => {
  if (loading) {
    return <div style={{ color: '#64748b', padding: '1rem' }}>{t('loading')}</div>;
  }

  const getOperationBadgeStyle = (op: string) => {
    const baseStyle = {
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 'bold' as const,
      textTransform: 'uppercase' as const,
      display: 'inline-block',
    };
    if (op === 'INSERT' || op === 'CREATE') {
      return { ...baseStyle, backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' };
    }
    if (op === 'UPDATE') {
      return { ...baseStyle, backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' };
    }
    if (op === 'DELETE') {
      return { ...baseStyle, backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)' };
    }
    return { ...baseStyle, backgroundColor: '#f1f5f9', color: '#475569' };
  };

  const getEntityTypeLabel = (etype: string) => {
    switch (etype) {
      case 'family':
        return t('family');
      case 'parent':
        return t('parent1');
      case 'child':
        return t('children');
      case 'hygiene_event':
        return t('hygieneBelehrung');
      case 'th_membership':
        return t('th_membership');
      default:
        return etype;
    }
  };

  const safeLogs = Array.isArray(logs) ? logs : [];

  return (
    <div className="table-container" style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '0.75rem 0.5rem', width: '160px' }}>{t('timestamp')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '180px' }}>{t('userLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '100px' }}>{t('operationLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '150px' }}>{t('entityTypeLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>{t('detailsLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {safeLogs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {CURRENT_LOCALE === 'de' ? 'Keine Einträge vorhanden' : 'No entries found'}
              </td>
            </tr>
          ) : (
            safeLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                  {new Date(log.created_at).toLocaleString(CURRENT_LOCALE === 'de' ? 'de-DE' : 'en-US')}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500, color: 'var(--text-h)', fontSize: '0.85rem' }}>
                  {log.changed_by_email || '-'}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  <span style={getOperationBadgeStyle(log.operation)}>
                    {log.operation === 'CREATE' ? 'INSERT' : log.operation}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: '#475569', fontSize: '0.85rem', fontWeight: 500 }}>
                  {getEntityTypeLabel(log.entity_type)}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {formatSnapshotDetails(log)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const LandingPage: React.FC = () => {
  const { authError } = useAuth();

  if (authError) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', padding: '20px' }}>
        <h1 style={{ color: 'var(--text-h)' }}>Access Restricted</h1>
        <p style={{ color: 'var(--danger-text)', fontSize: '1.1rem', margin: '20px 0', fontWeight: 500 }}>
          {authError.email
            ? `The user ${authError.email} does not have access to the application.`
            : `Access Denied: ${authError.message}`}
        </p>
        <a
          href="/oauth2/start"
          className="primary-button"
          style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}
        >
          Sign in with a different account
        </a>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Kindergarten Management System</h1>
      <p>Please log in to access the system.</p>
      <LoginButton />
    </div>
  );
};

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  effective_permissions: string[];
  last_login?: string;
  created_at: string;
}

interface AdminRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

const ALL_AVAILABLE_PERMISSIONS = [
  '*',
  'families.all.read',
  'families.all.write',
  'children.all.write',
  'fees.all.read',
  'fees.self.read',
  'hygiene.all.write',
  'memberships.all.write',
  'audit.all.read',
  'users.all.manage',
  'vaccination.status.manage'
];

const AdminView: React.FC = () => {
  const { token, refreshUser } = useAuth();
  const [subTab, setSubTab] = React.useState<'users' | 'roles'>('users');
  
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [loading, setLoading] = React.useState(true);

  // User modal states
  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null);
  const [userEmail, setUserEmail] = React.useState('');
  const [selectedUserRoles, setSelectedUserRoles] = React.useState<string[]>([]);
  const [selectedUserPerms, setSelectedUserPerms] = React.useState<string[]>([]);

  // Role modal states
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<AdminRole | null>(null);
  const [roleId, setRoleId] = React.useState('');
  const [roleName, setRoleName] = React.useState('');
  const [roleDesc, setRoleDesc] = React.useState('');
  const [selectedRolePerms, setSelectedRolePerms] = React.useState<string[]>([]);

  const fetchUsers = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchRoles = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setRoles(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const refreshData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchRoles()]);
    setLoading(false);
  }, [fetchUsers, fetchRoles]);

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Handle User Submit
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) return;

    if (editingUser) {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roles: selectedUserRoles, permissions: selectedUserPerms })
      });
      if (res.ok) {
        setUserModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to update user');
      }
    } else {
      const normalizedEmail = userEmail.trim().toLowerCase();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: normalizedEmail, roles: selectedUserRoles, permissions: selectedUserPerms })
      });
      if (res.ok) {
        setUserModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to create user');
      }
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm(t('deleteUserConfirm'))) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      refreshData();
      await refreshUser();
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setUserEmail('');
    setSelectedUserRoles([]);
    setSelectedUserPerms([]);
    setUserModalOpen(true);
  };

  const openEditUserModal = (u: AdminUser) => {
    setEditingUser(u);
    setUserEmail(u.email);
    setSelectedUserRoles(u.roles || []);
    setSelectedUserPerms(u.permissions || []);
    setUserModalOpen(true);
  };

  // Handle Role Submit
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId || !roleName) return;

    if (editingRole) {
      const res = await fetch(`/api/admin/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: roleName, description: roleDesc, permissions: selectedRolePerms })
      });
      if (res.ok) {
        setRoleModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to update role');
      }
    } else {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: roleId.toLowerCase().trim(), name: roleName, description: roleDesc, permissions: selectedRolePerms })
      });
      if (res.ok) {
        setRoleModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to create role');
      }
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!window.confirm(t('deleteRoleConfirm'))) return;
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      refreshData();
      await refreshUser();
    }
  };

  const openAddRoleModal = () => {
    setEditingRole(null);
    setRoleId('');
    setRoleName('');
    setRoleDesc('');
    setSelectedRolePerms([]);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (r: AdminRole) => {
    setEditingRole(r);
    setRoleId(r.id);
    setRoleName(r.name);
    setRoleDesc(r.description || '');
    setSelectedRolePerms(r.permissions || []);
    setRoleModalOpen(true);
  };

  const toggleUserRole = (rId: string) => {
    setSelectedUserRoles(prev => prev.includes(rId) ? prev.filter(x => x !== rId) : [...prev, rId]);
  };

  const toggleUserPerm = (pStr: string) => {
    setSelectedUserPerms(prev => prev.includes(pStr) ? prev.filter(x => x !== pStr) : [...prev, pStr]);
  };

  const toggleRolePerm = (pStr: string) => {
    setSelectedRolePerms(prev => prev.includes(pStr) ? prev.filter(x => x !== pStr) : [...prev, pStr]);
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#64748b' }}>{t('loading')}</div>;
  }

  return (
    <div className="admin-container" style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
      {/* Sub Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setSubTab('users')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'users' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'users' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {t('users')} ({users.length})
          </button>
          <button
            onClick={() => setSubTab('roles')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'roles' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'roles' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {t('roles')} ({roles.length})
          </button>
        </div>
        {subTab === 'users' ? (
          <button onClick={openAddUserModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + {t('addUser')}
          </button>
        ) : (
          <button onClick={openAddRoleModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + {t('addRole')}
          </button>
        )}
      </div>

      {/* Users Section */}
      {subTab === 'users' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('userLabel')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('assignedRoles')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('customPermissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('effectivePermissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.roles && u.roles.length > 0 ? u.roles.map(rId => (
                        <span key={rId} style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {rId}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.permissions && u.permissions.length > 0 ? u.permissions.map(p => (
                        <span key={p} style={{ background: '#fef3c7', color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.effective_permissions && u.effective_permissions.length > 0 ? u.effective_permissions.map(p => (
                        <span key={p} style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button onClick={() => openEditUserModal(u)} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem', fontSize: '0.8rem' }}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles Section */}
      {subTab === 'roles' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 0.5rem', width: '120px' }}>{t('roleId')}</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '160px' }}>{t('roleName')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Beschreibung</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('permissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{r.id}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>{r.description || '-'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {r.permissions && r.permissions.length > 0 ? r.permissions.map(p => (
                        <span key={p} style={{ background: '#f3e8ff', color: '#7e22ce', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button onClick={() => openEditRoleModal(r)} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem', fontSize: '0.8rem' }}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDeleteRole(r.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Modal */}
      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--text-h)' }}>{editingUser ? t('editUser') : t('addUser')}</h3>
            <form onSubmit={handleUserSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>E-Mail Address</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  disabled={!!editingUser}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('assignedRoles')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {roles.map(r => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserRoles.includes(r.id)}
                        onChange={() => toggleUserRole(r.id)}
                      />
                      <span><strong>{r.name}</strong> ({r.id})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('customPermissions')} (Direct Overrides)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserPerms.includes(p)}
                        onChange={() => toggleUserPerm(p)}
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setUserModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {roleModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--text-h)' }}>{editingRole ? t('editRole') : t('addRole')}</h3>
            <form onSubmit={handleRoleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('roleId')}</label>
                <input
                  type="text"
                  value={roleId}
                  onChange={e => setRoleId(e.target.value)}
                  disabled={!!editingRole}
                  placeholder="e.g. manager"
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('roleName')}</label>
                <input
                  type="text"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  placeholder="e.g. Manager"
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Beschreibung</label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  placeholder="Kurze Beschreibung der Rolle"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('permissions')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      <input
                        type="checkbox"
                        checked={selectedRolePerms.includes(p)}
                        onChange={() => toggleRolePerm(p)}
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setRoleModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import { useRealtime } from './hooks/useRealtime';

const Dashboard: React.FC = () => {
  const { user, token, logout, hasPermission } = useAuth();

  // KMS Step-up Auth state
  const [kmsAccessToken, setKmsAccessToken] = React.useState<string | null>(() => {
    return sessionStorage.getItem('kms_access_token');
  });
  const [kmsError, setKmsError] = React.useState<string | null>(null);

  const isVaccinationUnlocked = Boolean(kmsAccessToken);

  const getAuthHeaders = React.useCallback((extraHeaders: Record<string, string> = {}, explicitKmsToken?: string) => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    };
    const kToken = explicitKmsToken !== undefined ? explicitKmsToken : kmsAccessToken;
    if (kToken) {
      h['X-KMS-Access-Token'] = kToken;
    }
    return h;
  }, [token, kmsAccessToken]);

  const canReadAudit = hasPermission('audit.all.read');
  const canManageUsers = hasPermission('users.all.manage') || hasPermission('*');

  const [families, setFamilies] = React.useState<Family[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'families' | 'parents' | 'children' | 'childcareFees' | 'hygieneBelehrung' | 'audit' | 'admin'>(() => {
    const rawHash = window.location.hash.replace('#', '');
    const hash = rawHash.split('?')[0];
    if (
      hash === 'families' ||
      hash === 'parents' ||
      hash === 'children' ||
      hash === 'childcareFees' ||
      hash === 'hygieneBelehrung' ||
      (hash === 'audit' && canReadAudit) ||
      (hash === 'admin' && canManageUsers)
    ) {
      return hash as any;
    }
    const saved = localStorage.getItem('thweb_active_tab');
    if (
      saved === 'families' ||
      saved === 'parents' ||
      saved === 'children' ||
      saved === 'childcareFees' ||
      saved === 'hygieneBelehrung' ||
      (saved === 'audit' && canReadAudit) ||
      (saved === 'admin' && canManageUsers)
    ) {
      return saved as any;
    }
    return 'families';
  });

  // Navigation & Highlighting state (Patterns 2 & 3)
  const [highlightTarget, setHighlightTarget] = React.useState<{ id: string; key: number } | null>(null);
  const highlightedRowId = highlightTarget?.id ?? null;
  const [returnNav, setReturnNav] = React.useState<{
    familyId: string;
    familyName: string;
    type: 'parent' | 'child';
  } | null>(null);

  const handleJumpToParent = React.useCallback((parentId: string, familyId: string, familyName: string) => {
    setGlobalFilter('');
    setActiveTab('parents');
    setHighlightTarget({ id: parentId, key: Date.now() });
    setReturnNav({ familyId, familyName, type: 'parent' });
    const params = new URLSearchParams({
      fromFamily: familyId,
      familyName,
      highlight: parentId,
      type: 'parent',
    });
    window.location.hash = `parents?${params.toString()}`;
  }, []);

  const handleJumpToChild = React.useCallback((childId: string, familyId: string, familyName: string) => {
    setGlobalFilter('');
    setActiveTab('children');
    setHighlightTarget({ id: childId, key: Date.now() });
    setReturnNav({ familyId, familyName, type: 'child' });
    const params = new URLSearchParams({
      fromFamily: familyId,
      familyName,
      highlight: childId,
      type: 'child',
    });
    window.location.hash = `children?${params.toString()}`;
  }, []);

  const handleReturnToFamilies = React.useCallback(() => {
    const famId = returnNav?.familyId;
    setActiveTab('families');
    if (famId) {
      setHighlightTarget({ id: famId, key: Date.now() });
      window.location.hash = `families?highlight=${famId}`;
    } else {
      window.location.hash = 'families';
    }
    setReturnNav(null);
    setGlobalFilter('');
  }, [returnNav]);

  const handleDismissReturnNav = React.useCallback(() => {
    setReturnNav(null);
    setHighlightTarget(null);
    const currentTab = window.location.hash.replace('#', '').split('?')[0] || activeTab;
    window.history.replaceState(null, '', `#${currentTab}`);
  }, [activeTab]);

  const handleTabClick = React.useCallback((tab: typeof activeTab) => {
    setGlobalFilter('');
    setReturnNav(null);
    setHighlightTarget(null);
    window.location.hash = tab;
  }, []);

  // Audit states
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

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

  // Membership states
  const [manageMembershipsOpen, setManageMembershipsOpen] = React.useState(false);
  const [targetParentMemberships, setTargetParentMemberships] = React.useState<Parent | null>(null);
  const [newMembershipStartDate, setNewMembershipStartDate] = React.useState('');
  const [newMembershipEndDate, setNewMembershipEndDate] = React.useState('');
  const [newMembershipType, setNewMembershipType] = React.useState<'full_member' | 'supporting_member'>('full_member');

  // Group Change popover state
  const [targetChildGroupChanges, setTargetChildGroupChanges] = React.useState<Child | null>(null);
  const [groupPopoverAnchor, setGroupPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

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
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ parents: targetParents }),
        });
        if (!res.ok) throw new Error();
      } 
      else if (type === 'DELETE_PARENT') {
        if (isUndo) {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(targetChild),
        });
        if (!res.ok) throw new Error();
      }
      else if (type === 'DELETE_CHILD') {
        if (isUndo) {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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

  const fetchFamilies = React.useCallback((explicitKmsToken?: string) => {
    return fetch('/api/families', {
      headers: getAuthHeaders({}, explicitKmsToken),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              // Fetch families in locked state
              return fetch('/api/families', {
                headers: getAuthHeaders({}, ''),
              })
                .then((r) => r.json())
                .then((data) => {
                  if (Array.isArray(data)) setFamilies(data);
                  return data;
                });
            }
          }
          throw new Error('Failed to fetch families');
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setFamilies(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [getAuthHeaders]);

  React.useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  const applyKmsToken = React.useCallback(async (tokenToApply: string) => {
    try {
      const res = await fetch('/api/families', {
        headers: getAuthHeaders({}, tokenToApply),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          sessionStorage.setItem('kms_access_token', tokenToApply);
          setKmsAccessToken(tokenToApply);
          setKmsError(null);
          setFamilies(data);
          return true;
        }
      }
      // KMS rejected (e.g. 403 Forbidden with kms_access_denied)
      sessionStorage.removeItem('kms_access_token');
      setKmsAccessToken(null);
      const errMsg = t('kmsAccessDenied');
      setKmsError(errMsg);
      alert(errMsg);
      fetchFamilies('');
      return false;
    } catch (err) {
      console.error('Failed to apply KMS token:', err);
      sessionStorage.removeItem('kms_access_token');
      setKmsAccessToken(null);
      const errMsg = t('kmsAccessDenied');
      setKmsError(errMsg);
      alert(errMsg);
      fetchFamilies('');
      return false;
    }
  }, [getAuthHeaders, fetchFamilies]);

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/cloudkms',
    onSuccess: (tokenResponse) => {
      applyKmsToken(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google KMS OAuth error:', error);
      alert('Google Authorization failed: ' + (error.error_description || error.error || 'Unknown error'));
    },
    onNonOAuthError: (nonOAuthError) => {
      console.log('Google KMS OAuth event:', nonOAuthError);
    },
  });

  const handleRequestKmsAuth = React.useCallback(() => {
    setKmsError(null);
    const protectedDataClientId =
      window.ENV?.GOOGLE_PROTECTED_DATA_CLIENT_ID ||
      import.meta.env.VITE_GOOGLE_PROTECTED_DATA_CLIENT_ID ||
      'mock-protected-data';
    const isMock = !protectedDataClientId || protectedDataClientId === 'mock-protected-data' || protectedDataClientId === 'mock';
    if (isMock) {
      applyKmsToken('mock-kms-token');
      return;
    }
    googleLogin();
  }, [googleLogin, applyKmsToken]);

  const handleLockKmsAuth = React.useCallback(() => {
    sessionStorage.removeItem('kms_access_token');
    setKmsAccessToken(null);
    setKmsError(null);
    fetchFamilies('');
  }, [fetchFamilies]);

  const fetchAuditLogs = React.useCallback(() => {
    setAuditLoading(true);
    fetch('/api/audit-logs', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        return res.json();
      })
      .then((data) => {
        setAuditLogs(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(err))
      .finally(() => setAuditLoading(false));
  }, [token]);

  React.useEffect(() => {
    if (activeTab === 'audit') {
      if (canReadAudit) {
        fetchAuditLogs();
      } else {
        setActiveTab('parents');
        localStorage.setItem('thweb_active_tab', 'parents');
        window.location.hash = 'parents';
      }
    }
  }, [activeTab, fetchAuditLogs, canReadAudit]);

  // Scroll to and highlight targeted row
  React.useEffect(() => {
    if (!highlightTarget) return;
    const targetId = highlightTarget.id;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById(`row-${targetId}`);
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        // Force CSS animation replay in case the class was already applied
        el.classList.remove('highlighted-row');
        void el.offsetWidth;
        el.classList.add('highlighted-row');
      } else if (attempts >= 25) {
        clearInterval(interval);
      }
    }, 40);

    const clearTimer = setTimeout(() => {
      setHighlightTarget(null);
    }, 1800);

    return () => {
      clearInterval(interval);
      clearTimeout(clearTimer);
    };
  }, [activeTab, highlightTarget]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '');
      const [hash, queryString] = rawHash.split('?');
      const searchParams = new URLSearchParams(queryString || '');
      const highlight = searchParams.get('highlight');
      const fromFamily = searchParams.get('fromFamily');
      const familyName = searchParams.get('familyName');
      const type = searchParams.get('type') as 'parent' | 'child' | null;

      if (
        hash === 'parents' ||
        hash === 'children' ||
        hash === 'families' ||
        hash === 'childcareFees' ||
        hash === 'hygieneBelehrung' ||
        (hash === 'audit' && canReadAudit) ||
        (hash === 'admin' && canManageUsers)
      ) {
        setActiveTab(hash as any);
        localStorage.setItem('thweb_active_tab', hash);

        if (highlight) {
          setHighlightTarget({ id: highlight, key: Date.now() });
        } else {
          setHighlightTarget(null);
        }

        if (fromFamily && familyName && type) {
          setReturnNav({ familyId: fromFamily, familyName, type });
        } else {
          setReturnNav(null);
        }
      } else if (hash === 'audit' || hash === 'admin') {
        setActiveTab('parents');
        localStorage.setItem('thweb_active_tab', 'parents');
        window.location.hash = 'parents';
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = activeTab;
    } else if (window.location.hash.includes('?')) {
      handleHashChange();
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [canReadAudit, canManageUsers]);

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
    if (addParentOpen || addFamilyOpen || addChildOpen || manageHygieneOpen || manageMembershipsOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addParentOpen, addFamilyOpen, addChildOpen, manageHygieneOpen, manageMembershipsOpen]);

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
    const newChild: any = {
      id: newChildId,
      family_id: targetFamily.id,
      first_name: newChildFirstName.trim(),
      last_name: newChildLastName.trim(),
      birth_date: `${parsedDate}T00:00:00Z`,
    };

    fetch(`/api/children/${newChildId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newChild),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Failed to add child: ${errText || res.statusText}`);
        }
        pushAction({
          type: 'ADD_CHILD',
          payload: {
            tab: activeTab === 'families' ? 'families' : 'children',
            child: newChild,
          }
        });
        fetchFamilies();
        setAddChildOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const openManageMemberships = (parent: Parent) => {
    setTargetParentMemberships(parent);
    setNewMembershipStartDate(new Date().toISOString().split('T')[0]);
    setNewMembershipEndDate('');
    setNewMembershipType('full_member');
    setManageMembershipsOpen(true);
  };

  const handleAddMembership = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetParentMemberships) return;
    if (!newMembershipStartDate) {
      alert(t('invalidDate'));
      return;
    }

    const payload = {
      parent_id: targetParentMemberships.id,
      start_date: `${newMembershipStartDate}T00:00:00Z`,
      end_date: newMembershipEndDate ? `${newMembershipEndDate}T00:00:00Z` : null,
      membership_type: newMembershipType,
    };

    fetch('/api/memberships', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create membership');
        return res.json();
      })
      .then((created) => {
        fetchFamilies();
        const updatedMemberships = [created, ...(targetParentMemberships.memberships || [])].sort(
          (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        );
        setTargetParentMemberships({ ...targetParentMemberships, memberships: updatedMemberships });
        setNewMembershipEndDate('');
      })
      .catch((err) => alert(err.message));
  };

  const handleDeleteMembership = (membershipId: string) => {
    if (!targetParentMemberships) return;
    if (!window.confirm(t('membershipDeleteConfirm'))) return;

    fetch(`/api/memberships/${membershipId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to delete membership');
        fetchFamilies();
        const updatedMemberships = (targetParentMemberships.memberships || []).filter((m) => m.id !== membershipId);
        setTargetParentMemberships({ ...targetParentMemberships, memberships: updatedMemberships });
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

  const openManageGroupChanges = (child: Child, anchor: HTMLElement | string) => {
    setTargetChildGroupChanges(child);
    setGroupPopoverAnchor(anchor);
  };

  const closeManageGroupChanges = () => {
    setGroupPopoverAnchor(null);
    setTargetChildGroupChanges(null);
  };

  const handleAddGroupChange = async (childId: string, changeDate: string, targetGroup: number) => {
    const payload = {
      child_id: childId,
      change_date: changeDate,
      target_group: targetGroup,
    };

    const res = await fetch(`/api/children/${childId}/group_changes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to create group change: ${err || res.statusText}`);
    }
    const created = await res.json();
    fetchFamilies();
    if (targetChildGroupChanges && targetChildGroupChanges.id === childId) {
      const existing = targetChildGroupChanges.group_changes || [];
      const filtered = existing.filter((c) => c.change_date !== created.change_date);
      const updatedChanges = [created, ...filtered].sort(
        (a, b) => a.change_date.localeCompare(b.change_date)
      );
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const handleDeleteGroupChange = async (changeId: string) => {
    const res = await fetch(`/api/children_group_changes/${changeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to delete group change: ${err || res.statusText}`);
    }
    fetchFamilies();
    if (targetChildGroupChanges) {
      const updatedChanges = (targetChildGroupChanges.group_changes || []).filter((c) => c.id !== changeId);
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const handleUpdateGroupChange = async (changeId: string, changeDate: string, targetGroup: number) => {
    const res = await fetch(`/api/children_group_changes/${changeId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        change_date: changeDate,
        target_group: targetGroup,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to update group change: ${err || res.statusText}`);
    }
    const updated = await res.json();
    fetchFamilies();
    if (targetChildGroupChanges) {
      const existing = targetChildGroupChanges.group_changes || [];
      const updatedChanges = existing
        .map((c) => (c.id === changeId ? updated : c))
        .sort((a, b) => a.change_date.localeCompare(b.change_date));
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const activeChildForGroupChanges = React.useMemo(() => {
    if (!targetChildGroupChanges) return null;
    for (const f of families) {
      const found = (f.children || []).find((c) => c.id === targetChildGroupChanges.id);
      if (found) return found;
    }
    return targetChildGroupChanges;
  }, [families, targetChildGroupChanges]);

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

    const parentsToCreate = [
      {
        first_name: p1FirstName.trim(),
        last_name: p1LastName.trim(),
        emails: [] as string[],
        phones: [] as string[],
      },
    ];

    if (p2FirstName.trim() && p2LastName.trim()) {
      parentsToCreate.push({
        first_name: p2FirstName.trim(),
        last_name: p2LastName.trim(),
        emails: [] as string[],
        phones: [] as string[],
      });
    }

    fetch('/api/families', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parents: parentsToCreate,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create family');
        return res.json();
      })
      .then((createdFamily) => {
        pushAction({
          type: 'ADD_FAMILY',
          payload: {
            tab: activeTab === 'children' ? 'children' : activeTab === 'families' ? 'families' : 'parents',
            familyId: createdFamily.id,
            parents: createdFamily.parents || [],
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
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              const errMsg = t('kmsAccessDenied');
              setKmsError(errMsg);
              throw new Error(errMsg);
            }
          }
          throw new Error('Failed to update parent');
        }
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
    const isDateField = fieldName === 'birth_date';
    if (isDateField && newValue && typeof newValue === 'string' && !newValue.includes('T')) {
      formattedValue = `${newValue}T00:00:00Z`;
    }

    const updatedChild = { ...child, [fieldName]: formattedValue };
    
    fetch(`/api/children/${child.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updatedChild),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              const errMsg = t('kmsAccessDenied');
              setKmsError(errMsg);
              throw new Error(errMsg);
            }
          }
          throw new Error('Failed to update child');
        }
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
        const groupInfo = getChildGroupInfo(c.group_changes);
        const groupMatch = groupInfo.groupLabel.toLowerCase().includes(query);
        const startMatch = groupInfo.startDate ? formatDisplayDate(groupInfo.startDate).toLowerCase().includes(query) : false;
        const familyLastNameMatch = lastNames.some(ln => ln.toLowerCase().includes(query));
        return fnMatch || lnMatch || groupMatch || startMatch || familyLastNameMatch;
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

  // Structure families with their children sub-rows for the families tab
  const familiesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const parentNames = (f.parents || [])
        .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const allChildren = (f.children || []).map(c => ({
        ...c,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter children
      const filteredChildren = allChildren.filter(c => {
        if (!query) return true;
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
        const fnMatch = (c.first_name || '').toLowerCase().includes(query);
        const lnMatch = (c.last_name || '').toLowerCase().includes(query);
        const bdFormatted = formatDisplayDate(c.birth_date).toLowerCase();
        const bdRaw = (c.birth_date || '').split('T')[0];
        const bdMatch = bdFormatted.includes(query) || bdRaw.includes(query);
        const groupInfo = getChildGroupInfo(c.group_changes);
        const groupMatch = groupInfo.groupLabel.toLowerCase().includes(query);
        const familyNameMatch = familyName.toLowerCase().includes(query);
        const parentMatch = parentNames.toLowerCase().includes(query);
        const notesMatch = (c.notes || '').toLowerCase().includes(query);
        return fnMatch || lnMatch || fullName.includes(query) || bdMatch || groupMatch || familyNameMatch || parentMatch || notesMatch;
      });

      const familyMatch = familyName.toLowerCase().includes(query) || parentNames.toLowerCase().includes(query);

      const subHeader = (f.parents && f.parents.length > 0) ? (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
          {f.parents.map((p, idx) => {
            const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent';
            return (
              <React.Fragment key={p.id}>
                {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>,</span>}
                <button
                  type="button"
                  className="family-parent-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToParent(p.id, f.id, familyName);
                  }}
                  title={t('jumpToParent')}
                >
                  {pName}
                </button>
              </React.Fragment>
            );
          })}
        </span>
      ) : null;

      return {
        id: f.id,
        family_name: familyName,
        sub_header: subHeader,
        children: filteredChildren,
        nameMatch: familyMatch,
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
  }, [families, globalFilter, handleJumpToParent]);

  const hygieneColumns = React.useMemo<ColumnDef<any>[]>(() => {
    return [
      {
        header: t('firstName'),
        accessorKey: 'first_name',
        size: 200,
        minSize: 200,
      },
      {
        header: t('lastName'),
        accessorKey: 'last_name',
        size: 220,
      },
      {
        header: t('initialTraining'),
        id: 'initial_training',
        size: 320,
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
        size: 320,
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
        size: 220,
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
        minSize: 200,
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
        size: 260,
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
        header: t('th_membership'),
        id: 'th_membership',
        size: 180,
        cell: (info) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const status = getMembershipStatus(parent.memberships);
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{
                color: status.color,
                fontWeight: (status as any).fontWeight || 'normal',
                fontStyle: (status as any).fontStyle || 'normal',
              }}>
                {status.text}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openManageMemberships(parent);
                }}
                className="easy-edit-button"
                style={{
                  padding: '2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--primary)',
                }}
                title={t('manageMemberships')}
              >
                <Pencil size={14} />
              </button>
            </div>
          );
        }
      },
      ...(hasPermission('vaccination.status.manage') ? [
        {
          id: 'vaccination_status',
          header: t('vaccinationStatus'),
          accessorKey: 'vaccination_checks',
          size: 180,
          cell: (info: any) => {
            const parent = info.row.original;
            return (
              <VaccinationStatusEditor
                checks={parent.vaccination_checks}
                currentUserEmail={user?.email || ''}
                onSave={(newChecks) => handleSaveParentField(parent, 'vaccination_checks', newChecks)}
                isUnlocked={isVaccinationUnlocked}
                onUnlock={handleRequestKmsAuth}
              />
            );
          }
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 60,
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
    [families, handleSaveParentField, handleDeleteParent, isVaccinationUnlocked, handleRequestKmsAuth, hasPermission, user?.email]
  );

  const childGroupColumn = React.useMemo<ColumnDef<any>>(
    () => ({
      header: t('group'),
      id: 'group',
      size: 340,
      minSize: 320,
      cell: (info) => {
        const child = info.row.original;
        const isCurrentActive = Boolean(groupPopoverAnchor && targetChildGroupChanges?.id === child.id);
        return (
          <ChildGroupCell
            child={child}
            isActive={isCurrentActive}
            onOpenManage={openManageGroupChanges}
          />
        );
      },
    }),
    [groupPopoverAnchor, targetChildGroupChanges, openManageGroupChanges]
  );

  const childColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: t('firstNameEdit'),
        accessorKey: 'first_name',
        size: 200,
        minSize: 200,
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
        header: t('startdatum'),
        id: 'start_date',
        size: 130,
        cell: (info) => {
          const child = info.row.original;
          const groupInfo = getChildGroupInfo(child.group_changes);
          const cellId = `cell-start_date-${child.id}`;
          return (
            <div
              id={cellId}
              onDoubleClick={(e) => {
                e.stopPropagation();
                window.getSelection()?.removeAllRanges();
                const cellEl = document.getElementById(cellId) || e.currentTarget;
                openManageGroupChanges(child, cellEl);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
              title={t('manageGroupChanges')}
            >
              <span>{groupInfo.startDate ? formatDisplayDate(groupInfo.startDate) : '-'}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const cellEl = document.getElementById(cellId) || e.currentTarget;
                  openManageGroupChanges(child, cellEl);
                }}
                className="easy-edit-button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '2px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  flexShrink: 0,
                  marginLeft: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={t('manageGroupChanges')}
              >
                <Pencil size={12} />
              </button>
            </div>
          );
        }
      },
      childGroupColumn,
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
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
      ...(hasPermission('vaccination.status.manage') ? [
        {
          id: 'vaccination_status',
          header: t('vaccinationStatus'),
          accessorKey: 'vaccination_checks',
          size: 180,
          cell: (info: any) => {
            const child = info.row.original;
            return (
              <VaccinationStatusEditor
                checks={child.vaccination_checks}
                currentUserEmail={user?.email || ''}
                onSave={(newChecks) => handleSaveChildField(child, 'vaccination_checks', newChecks)}
                isUnlocked={isVaccinationUnlocked}
                onUnlock={handleRequestKmsAuth}
              />
            );
          }
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 60,
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
    [families, handleSaveChildField, handleDeleteChild, openManageGroupChanges, childGroupColumn, isVaccinationUnlocked, handleRequestKmsAuth, hasPermission, user?.email]
  );

  const familyChildColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'child_name',
        accessorFn: (child: any) => `${child.first_name || ''} ${child.last_name || ''}`.trim(),
        header: t('firstNameEdit'),
        size: 200,
        minSize: 200,
        cell: (info) => {
          const child = info.row.original;
          const fullName = `${child.first_name || ''} ${child.last_name || ''}`.trim() || '-';
          if (!child.first_name && !child.last_name) {
            return <span>-</span>;
          }
          return (
            <button
              type="button"
              className="family-child-link"
              onClick={(e) => {
                e.stopPropagation();
                handleJumpToChild(child.id, child.family_id, child.family_name || '');
              }}
              title={t('jumpToChild')}
            >
              {fullName}
            </button>
          );
        }
      },
      {
        id: 'birth_date',
        accessorKey: 'birth_date',
        header: t('birthDateEdit'),
        size: 160,
        minSize: 120,
        cell: (info) => {
          const child = info.row.original;
          return <span>{formatDisplayDate(child.birth_date) || '-'}</span>;
        }
      },
      childGroupColumn,
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
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
    ],
    [childGroupColumn, handleJumpToChild, handleSaveChildField]
  );

  const isTableTab = activeTab === 'parents' || activeTab === 'children' || activeTab === 'families' || activeTab === 'hygieneBelehrung';

  return (
    <div className={`dashboard-container ${isTableTab ? 'table-view-active' : ''}`}>
      <header>
        <h1>{t('title')}</h1>
        <div className="user-info">
          <span>{user?.email}</span>
          <button onClick={logout}>{t('logout')}</button>
        </div>
      </header>
      <main className={isTableTab ? 'main-table-view' : ''}>
        {/* Navigation Tabs */}
        <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => handleTabClick('families')}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'families' ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === 'families' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
          >
            {t('families')}
          </button>
          <button 
            onClick={() => handleTabClick('parents')}
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
            onClick={() => handleTabClick('children')}
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
            onClick={() => handleTabClick('childcareFees')}
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
            onClick={() => handleTabClick('hygieneBelehrung')}
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
          {canReadAudit && (
            <button 
              onClick={() => handleTabClick('audit')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'audit' ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === 'audit' ? 'var(--primary)' : 'var(--text)',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
            >
              {t('audit')}
            </button>
          )}
          {(hasPermission('users.all.manage') || hasPermission('*')) && (
            <button 
              onClick={() => handleTabClick('admin')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'admin' ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === 'admin' ? 'var(--primary)' : 'var(--text)',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
            >
              {t('admin')}
            </button>
          )}
        </div>

        {/* Navigation Context Banner (Pattern 2) */}
        {returnNav && (activeTab === 'parents' || activeTab === 'children') && (
          <div className="context-return-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="context-return-text">
                {returnNav.type === 'parent'
                  ? `${t('viewingParentFromFamily')} „${returnNav.familyName}“`
                  : `${t('viewingChildFromFamily')} „${returnNav.familyName}“`}
              </span>
              <button
                type="button"
                className="context-return-button"
                onClick={handleReturnToFamilies}
              >
                <ArrowLeft size={14} />
                <span>{t('backToFamilies')}</span>
              </button>
            </div>
            <button
              type="button"
              className="context-return-dismiss"
              onClick={handleDismissReturnNav}
              title={t('dismiss')}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {activeTab !== 'childcareFees' && activeTab !== 'audit' && activeTab !== 'admin' && (
          <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="search-input"
                placeholder={activeTab === 'families' ? t('searchFamilies') : activeTab === 'children' ? t('searchChildren') : t('searchParents')}
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

              {(activeTab === 'parents' || activeTab === 'children') && hasPermission('vaccination.status.manage') && (
                isVaccinationUnlocked ? (
                  <button
                    type="button"
                    onClick={handleLockKmsAuth}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="Klicken zum Sperren"
                  >
                    <Unlock size={15} color="var(--primary)" />
                    <span>{t('vaccinationStatusUnlocked')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestKmsAuth}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                    }}
                    title={t('showVaccinationStatus')}
                  >
                    <Lock size={15} color="var(--text-muted)" />
                    <span>{t('showVaccinationStatus')}</span>
                  </button>
                )
              )}
            </div>
            {(activeTab === 'parents' || activeTab === 'children' || activeTab === 'families') && (
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

        {kmsError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              borderRadius: '6px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#b91c1c',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} color="#dc2626" />
              <span>{kmsError}</span>
            </div>
            <button
              type="button"
              onClick={() => setKmsError(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                padding: '0.2rem',
              }}
              title={t('dismiss')}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {activeTab === 'parents' ? (
          <DataTable
            data={parentsFamilyData}
            columns={parentColumns}
            getSubRows={(row: any) => row.parents}
            onAddRow={openAddParent}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'children' ? (
          <DataTable
            data={childrenFamilyData}
            columns={childColumns}
            getSubRows={(row: any) => row.children}
            onAddRow={openAddChild}
            emptySubRowsText={t('noChildrenYet')}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'families' ? (
          <DataTable
            data={familiesTabData}
            columns={familyChildColumns}
            getSubRows={(row: any) => row.children}
            onAddRow={openAddChild}
            emptySubRowsText={t('noChildrenYet')}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'hygieneBelehrung' ? (
          <DataTable
            data={parentsFamilyData}
            columns={hygieneColumns}
            getSubRows={(row: any) => row.parents}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'audit' && canReadAudit ? (
          <AuditLogView logs={auditLogs} loading={auditLoading} />
        ) : activeTab === 'admin' && canManageUsers ? (
          <AdminView />
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
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
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

        {/* Manage Memberships Modal */}
        {manageMembershipsOpen && targetParentMemberships && (
          <div className="modal-overlay">
            <div className="modal-container" style={{ maxWidth: '600px' }}>
              <h2>{t('manageMemberships')} - {targetParentMemberships.first_name} {targetParentMemberships.last_name}</h2>
              
              {/* List of existing memberships */}
              <div style={{ marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('membershipType')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('startDateLabel')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('endDateLabel')}</th>
                      <th style={{ padding: '0.5rem', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(targetParentMemberships.memberships || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                          {t('noMembershipsRecorded')}
                        </td>
                      </tr>
                    ) : (
                      (targetParentMemberships.memberships || []).map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                            {m.membership_type === 'full_member' ? t('full_member') : t('supporting_member')}
                          </td>
                          <td style={{ padding: '0.5rem' }}>{formatDisplayDate(m.start_date)}</td>
                          <td style={{ padding: '0.5rem' }}>{m.end_date ? formatDisplayDate(m.end_date) : '-'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteMembership(m.id)}
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

              {/* Add New Membership Form */}
              <form onSubmit={handleAddMembership} style={{ borderTop: '2px dashed var(--border)', paddingTop: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-h)' }}>
                  {t('addMembership')}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                  {/* Membership Type */}
                  <div className="modal-form-group" style={{ marginBottom: 0 }}>
                    <label>{t('membershipType')}</label>
                    <select
                      value={newMembershipType}
                      onChange={(e) => setNewMembershipType(e.target.value as 'full_member' | 'supporting_member')}
                      style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                      required
                    >
                      <option value="full_member">{t('full_member')}</option>
                      <option value="supporting_member">{t('supporting_member')}</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    {/* Start Date */}
                    <div className="modal-form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>{t('startDateLabel')}</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={CURRENT_LOCALE === 'de' ? formatDisplayDate(newMembershipStartDate) : newMembershipStartDate}
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
                          value={newMembershipStartDate}
                          style={{
                            position: 'absolute',
                            right: '4px',
                            width: '0px',
                            height: '0px',
                            opacity: 0,
                            pointerEvents: 'none',
                          }}
                          onChange={(e) => setNewMembershipStartDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* End Date */}
                    <div className="modal-form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>{t('endDateLabel')} ({CURRENT_LOCALE === 'de' ? 'optional' : 'Optional'})</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={newMembershipEndDate ? (CURRENT_LOCALE === 'de' ? formatDisplayDate(newMembershipEndDate) : newMembershipEndDate) : ''}
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
                          value={newMembershipEndDate}
                          style={{
                            position: 'absolute',
                            right: '4px',
                            width: '0px',
                            height: '0px',
                            opacity: 0,
                            pointerEvents: 'none',
                          }}
                          onChange={(e) => setNewMembershipEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setManageMembershipsOpen(false)}>
                    {t('cancel')}
                  </button>
                  <button type="submit" className="submit-btn">
                    {t('addMembership')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage Group Changes Popover */}
        <GroupChangesPopover
          key={activeChildForGroupChanges?.id || 'group-popover'}
          isOpen={Boolean(groupPopoverAnchor && activeChildForGroupChanges)}
          anchorEl={groupPopoverAnchor}
          onClose={closeManageGroupChanges}
          child={activeChildForGroupChanges}
          onAddGroupChange={handleAddGroupChange}
          onUpdateGroupChange={handleUpdateGroupChange}
          onDeleteGroupChange={handleDeleteGroupChange}
        />
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
