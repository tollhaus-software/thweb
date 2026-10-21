import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, Shield, User as UserIcon, AlertTriangle, Sliders } from 'lucide-react';
import { t } from '../../utils/i18n';
import { useAuth } from '../../context/AuthContext';

export interface SimulationCandidate {
  email: string;
  source: 'user' | 'identifier_email' | 'both';
  roles: string[];
  permissions: string[];
  effective_permissions: string[];
  family_id?: string;
}

export interface RoleOption {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

interface PermissionsSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionsSimulatorModal: React.FC<PermissionsSimulatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, token, refreshUser } = useAuth();
  const [mode, setMode] = useState<'user' | 'custom'>(() => {
    return user?.simulation?.mode || 'user';
  });

  const [candidates, setCandidates] = useState<SimulationCandidate[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // User mode state
  const [selectedEmail, setSelectedEmail] = useState<string>(() => {
    return user?.simulation?.simulated_user || '';
  });
  const [userSearch, setUserSearch] = useState<string>('');

  // Custom mode state
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    return user?.simulation?.simulated_roles || [];
  });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(() => {
    return user?.simulation?.simulated_permissions || [];
  });

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/simulation/options', { headers });
      if (!res.ok) {
        throw new Error(`Failed to load options: ${res.statusText}`);
      }
      const data = await res.json();
      setCandidates(data.users || []);
      setAvailableRoles(data.roles || []);
      setAvailablePermissions(data.permissions || []);
      if (!selectedEmail && data.users && data.users.length > 0) {
        // Pre-select first candidate if not already selected
        setSelectedEmail(data.users[0].email);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching options';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, selectedEmail]);

  useEffect(() => {
    if (isOpen) {
      fetchOptions();
      if (user?.simulation) {
        setMode(user.simulation.mode);
        if (user.simulation.simulated_user) {
          setSelectedEmail(user.simulation.simulated_user);
        }
        if (user.simulation.simulated_roles) {
          setSelectedRoles(user.simulation.simulated_roles);
        }
        if (user.simulation.simulated_permissions) {
          setSelectedPermissions(user.simulation.simulated_permissions);
        }
      }
    }
  }, [isOpen, fetchOptions, user]);

  const filteredCandidates = useMemo(() => {
    if (!userSearch.trim()) return candidates;
    const q = userSearch.toLowerCase();
    return candidates.filter((c) => c.email.toLowerCase().includes(q));
  }, [candidates, userSearch]);

  const selectedCandidate = useMemo(() => {
    return candidates.find((c) => c.email === selectedEmail) || null;
  }, [candidates, selectedEmail]);

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const handlePermissionToggle = (perm: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload =
      mode === 'user'
        ? { mode: 'user', user_email: selectedEmail }
        : { mode: 'custom', roles: selectedRoles, permissions: selectedPermissions };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await refreshUser();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start simulation';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="simulator-modal-overlay">
      <div className="modal-container simulator-modal" role="dialog" aria-modal="true" data-testid="simulator-modal">
        <div className="simulator-modal-header">
          <div className="simulator-modal-title">
            <Sliders size={20} className="simulator-modal-icon" />
            <h2>{t('simulationModalTitle')}</h2>
          </div>
          <button
            type="button"
            className="simulator-close-btn"
            onClick={onClose}
            aria-label={t('cancel')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="simulator-notice">
          <AlertTriangle size={16} className="simulator-notice-icon" />
          <span>{t('simulationNotice')}</span>
        </div>

        {error && <div className="simulator-error-banner">{error}</div>}

        <div className="simulator-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'user'}
            className={`simulator-tab ${mode === 'user' ? 'active' : ''}`}
            data-testid="simulator-tab-user"
            onClick={() => setMode('user')}
          >
            <UserIcon size={16} />
            <span>{t('simulationModeUser')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'custom'}
            className={`simulator-tab ${mode === 'custom' ? 'active' : ''}`}
            data-testid="simulator-tab-custom"
            onClick={() => setMode('custom')}
          >
            <Shield size={16} />
            <span>{t('simulationModeCustom')}</span>
          </button>
        </div>

        {loading ? (
          <div className="simulator-loading">Laden...</div>
        ) : (
          <form onSubmit={handleSubmit} className="simulator-form">
            {mode === 'user' ? (
              <div className="simulator-user-mode">
                <div className="simulator-field-group">
                  <label htmlFor="simulator-user-search">{t('selectUserToSimulate')}</label>
                  <div className="simulator-search-box">
                    <Search size={16} className="simulator-search-icon" />
                    <input
                      id="simulator-user-search"
                      type="text"
                      placeholder="E-Mail suchen..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="simulator-search-input"
                    />
                  </div>
                </div>

                <div className="simulator-candidates-list" data-testid="simulator-candidates-list">
                  {filteredCandidates.length === 0 ? (
                    <div className="simulator-empty">{t('noCandidatesFound')}</div>
                  ) : (
                    filteredCandidates.map((c) => {
                      const isSelected = c.email === selectedEmail;
                      return (
                        <div
                          key={c.email}
                          className={`simulator-candidate-item ${isSelected ? 'selected' : ''}`}
                          data-testid={`simulator-candidate-${c.email}`}
                          onClick={() => setSelectedEmail(c.email)}
                        >
                          <div className="simulator-candidate-radio">
                            <input
                              type="radio"
                              id={`cand-${c.email}`}
                              name="simulatedEmail"
                              checked={isSelected}
                              onChange={() => setSelectedEmail(c.email)}
                            />
                          </div>
                          <div className="simulator-candidate-info">
                            <div className="simulator-candidate-email-row">
                              <span className="simulator-candidate-email">{c.email}</span>
                              <span className={`simulator-candidate-badge source-${c.source}`}>
                                {c.source === 'both'
                                  ? t('sourceBoth')
                                  : c.source === 'identifier_email'
                                  ? t('sourceIdentifierEmail')
                                  : t('sourceUser')}
                              </span>
                            </div>
                            <div className="simulator-candidate-meta">
                              {c.roles.length > 0 && (
                                <span className="simulator-candidate-roles">
                                  Rollen: {c.roles.join(', ')}
                                </span>
                              )}
                              {c.family_id && (
                                <span className="simulator-candidate-family">
                                  Familie verknüpft
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedCandidate && (
                  <div className="simulator-preview-box">
                    <div className="simulator-preview-title">Effektive Berechtigungen des ausgewählten Benutzers:</div>
                    <div className="simulator-perms-tags">
                      {selectedCandidate.effective_permissions.map((p) => (
                        <span key={p} className="simulator-perm-tag">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="simulator-custom-mode">
                <div className="simulator-field-group">
                  <label>{t('selectRolesToSimulate')}</label>
                  <div className="simulator-roles-grid">
                    {availableRoles.map((role) => {
                      const isChecked = selectedRoles.includes(role.id);
                      return (
                        <label
                          key={role.id}
                          className={`simulator-checkbox-card ${isChecked ? 'checked' : ''}`}
                          data-testid={`role-card-${role.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleRoleToggle(role.id)}
                          />
                          <div className="simulator-role-card-content">
                            <span className="simulator-role-name">{role.name || role.id}</span>
                            {role.description && (
                              <span className="simulator-role-desc">{role.description}</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="simulator-field-group">
                  <label>{t('selectPermissionsToSimulate')}</label>
                  <div className="simulator-perms-grid">
                    {availablePermissions.map((perm) => {
                      const isChecked = selectedPermissions.includes(perm);
                      return (
                        <label
                          key={perm}
                          className={`simulator-perm-checkbox ${isChecked ? 'checked' : ''}`}
                          data-testid={`perm-checkbox-${perm}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handlePermissionToggle(perm)}
                          />
                          <span className="simulator-perm-code">{perm}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="simulator-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={onClose}
                disabled={submitting}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="submit-btn"
                data-testid="start-simulation-button"
                disabled={submitting || (mode === 'user' && !selectedEmail)}
              >
                {submitting ? 'Starten...' : t('startSimulation')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
