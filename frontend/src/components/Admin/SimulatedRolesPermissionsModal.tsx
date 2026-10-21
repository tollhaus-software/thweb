import React from 'react';
import { X, Shield, User as UserIcon, Key } from 'lucide-react';
import { t } from '../../utils/i18n';
import type { SimulationInfo } from '../../context/AuthContext';

interface SimulatedRolesPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  simulation?: SimulationInfo;
  effectivePermissions?: string[];
}

export const SimulatedRolesPermissionsModal: React.FC<SimulatedRolesPermissionsModalProps> = ({
  isOpen,
  onClose,
  simulation,
  effectivePermissions = [],
}) => {
  if (!isOpen || !simulation) return null;

  const roles = simulation.simulated_roles || [];
  const perms = effectivePermissions.length > 0
    ? effectivePermissions
    : simulation.simulated_permissions || [];

  return (
    <div className="modal-overlay" data-testid="simulated-roles-modal-overlay">
      <div
        className="modal-container simulated-roles-modal"
        role="dialog"
        aria-modal="true"
        data-testid="simulated-roles-modal"
      >
        <div className="simulator-modal-header">
          <div className="simulator-modal-title">
            <Shield size={20} className="simulator-modal-icon" />
            <h2>{t('simulatedRolesAndPermissionsTitle')}</h2>
          </div>
          <button
            type="button"
            className="simulator-close-btn"
            onClick={onClose}
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="simulated-roles-content">
          {simulation.mode === 'user' && simulation.simulated_user && (
            <div className="simulated-roles-section">
              <div className="simulated-roles-section-label">
                <UserIcon size={15} />
                <span>{t('simulatedUser')}</span>
              </div>
              <div className="simulated-roles-user-box" data-testid="simulated-user-display">
                {simulation.simulated_user}
              </div>
            </div>
          )}

          <div className="simulated-roles-section">
            <div className="simulated-roles-section-label">
              <Shield size={15} />
              <span>{t('simulatedRoles')}</span>
            </div>
            <div className="simulated-roles-badges" data-testid="simulated-roles-list">
              {roles.length === 0 ? (
                <span className="simulated-roles-empty">{t('noRoles')}</span>
              ) : (
                roles.map((r) => (
                  <span key={r} className="simulated-role-badge">
                    {r}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="simulated-roles-section">
            <div className="simulated-roles-section-label">
              <Key size={15} />
              <span>{t('simulatedPermissions')}</span>
            </div>
            <div className="simulated-perms-container" data-testid="simulated-permissions-list">
              {perms.length === 0 ? (
                <span className="simulated-roles-empty">Keine Berechtigungen</span>
              ) : (
                perms.map((p) => (
                  <span key={p} className="simulator-perm-tag">
                    {p}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="simulator-actions">
          <button
            type="button"
            className="cancel-btn"
            data-testid="close-simulated-roles-modal"
            onClick={onClose}
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
