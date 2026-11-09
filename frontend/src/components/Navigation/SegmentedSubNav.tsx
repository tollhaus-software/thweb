import React from 'react';
import {
  type TabId,
  type NavigationCategory,
  type UserPermissionsContext,
  getCategoryForTab,
  getVisibleSubTabsForCategory,
  getSubItemLabel,
} from '../../utils/navigation';

export interface SegmentedSubNavProps {
  activeTab: TabId | string;
  onSelectTab: (tabId: TabId) => void;
  perms?: UserPermissionsContext;
  currentCategory?: NavigationCategory | string;
  // Backward compatibility props
  canReadFamiliesAll?: boolean;
  canReadMembers?: boolean;
  canReadJobs?: boolean;
  canReadEmployees?: boolean;
  canViewMealPlan?: boolean;
  canReadMealAllergens?: boolean;
  hasHygieneWrite?: boolean;
  canReadOverview?: boolean;
}

export const SegmentedSubNav: React.FC<SegmentedSubNavProps> = ({
  activeTab,
  onSelectTab,
  perms,
  currentCategory,
  canReadFamiliesAll = false,
  canReadMembers = false,
  canReadJobs = false,
  canReadEmployees = false,
  canViewMealPlan = false,
  canReadMealAllergens = false,
  hasHygieneWrite = false,
  canReadOverview = false,
}) => {
  const effectiveCategory = (currentCategory || getCategoryForTab(activeTab)) as NavigationCategory;

  // Categories that use page-level segmented sub-navigation
  if (
    effectiveCategory !== 'mga' &&
    effectiveCategory !== 'kochen' &&
    effectiveCategory !== 'pa' &&
    effectiveCategory !== 'hygiene'
  ) {
    return null;
  }

  const effectivePerms: UserPermissionsContext = perms || {
    canReadOverview,
    canReadFamiliesAll,
    canReadFees: false,
    canReadMembers,
    canReadJobs,
    canReadEmployees,
    canViewMealPlan,
    canReadMealAllergens,
    hasHygieneWrite,
    canReadAudit: false,
    canManageUsers: false,
    canViewActivity: false,
    canProvisionKiosk: false,
    canUseDashboard: false,
  };

  const visibleItems = getVisibleSubTabsForCategory(effectiveCategory, effectivePerms);

  if (visibleItems.length <= 1) {
    return null;
  }

  return (
    <div className="tabs-wrapper subtabs-bar" role="navigation" aria-label="Unter-Navigation">
      <div className="tabs segmented-control">
        {visibleItems.map((sub) => {
          const isActive = activeTab === sub.id;
          const label = getSubItemLabel(sub);
          const accessibleName = sub.accessibleName || label;

          return (
            <button
              key={sub.id}
              type="button"
              aria-label={accessibleName}
              className={`tab-btn segment-btn ${isActive ? 'active' : ''}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectTab(sub.id)}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
