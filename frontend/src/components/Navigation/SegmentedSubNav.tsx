import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  sidebarCollapsed?: boolean;
  // Backward compatibility props
  canReadFamiliesAll?: boolean;
  canReadMembers?: boolean;
  canReadJobs?: boolean;
  canReadEmployees?: boolean;
  canReadVolunteerAbsences?: boolean;
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
  sidebarCollapsed = false,
  canReadFamiliesAll = false,
  canReadMembers = false,
  canReadJobs = false,
  canReadEmployees = false,
  canReadVolunteerAbsences = false,
  canViewMealPlan = false,
  canReadMealAllergens = false,
  hasHygieneWrite = false,
  canReadOverview = false,
}) => {
  const isMobile = useIsMobile();

  // When the sidebar navigation list is showing (e.g. expanded on desktop),
  // it already displays sub-tabs, so do not duplicate them at the top of the page.
  if (!isMobile && !sidebarCollapsed) {
    return null;
  }

  const effectiveCategory = (currentCategory || getCategoryForTab(activeTab)) as NavigationCategory;

  // Categories that use page-level segmented sub-navigation
  if (
    effectiveCategory !== 'mga' &&
    effectiveCategory !== 'kochen' &&
    effectiveCategory !== 'pa' &&
    effectiveCategory !== 'hygiene' &&
    effectiveCategory !== 'fees'
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
    canReadVolunteerAbsences,
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
