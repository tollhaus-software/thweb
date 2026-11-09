import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import {
  getCategoryForTab,
  getVisibleNavigationCategories,
  categoryHasLandingPage,
  getFirstPermittedTabForCategory,
  getCategoryLabel,
  getSubItemLabel,
  type TabId,
  type NavigationCategory,
  type UserPermissionsContext,
} from '../../utils/navigation';
import { MgaLinkIcon } from '../MgaLinkIcon';

export interface SidebarProps {
  activeTab: TabId | string;
  onSelectTab: (tabId: TabId | string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  canReadOverview: boolean;
  canReadFamiliesAll: boolean;
  canReadFees: boolean;
  canReadMembers: boolean;
  canReadJobs?: boolean;
  canReadEmployees: boolean;
  canViewMealPlan: boolean;
  canReadMealAllergens: boolean;
  hasHygieneWrite: boolean;
  canManageHygiene?: boolean;
  canAccessPersonalHygiene?: boolean;
  canReadAudit?: boolean;
  canManageUsers?: boolean;
  canViewActivity?: boolean;
  canProvisionKiosk?: boolean;
  canUseDashboard?: boolean;
  canViewMainPage?: boolean;
  appTitle?: string;
  appLogoUrl?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  canReadOverview,
  canReadFamiliesAll,
  canReadFees,
  canReadMembers,
  canReadJobs = false,
  canReadEmployees,
  canViewMealPlan,
  canReadMealAllergens,
  hasHygieneWrite,
  canManageHygiene = false,
  canAccessPersonalHygiene = false,
  canReadAudit = false,
  canManageUsers = false,
  canViewActivity = false,
  canProvisionKiosk = false,
  canUseDashboard = false,
  canViewMainPage = false,
  appTitle = 'TH Portal',
  appLogoUrl,
}) => {
  const currentCategory = getCategoryForTab(activeTab);

  const perms: UserPermissionsContext = {
    canReadOverview,
    canReadFamiliesAll,
    canReadFees,
    canReadMembers,
    canReadJobs,
    canReadEmployees,
    canViewMealPlan,
    canReadMealAllergens,
    hasHygieneWrite,
    canManageHygiene,
    canAccessPersonalHygiene,
    canReadAudit,
    canManageUsers,
    canViewActivity: canViewActivity || canManageUsers,
    canProvisionKiosk,
    canUseDashboard,
    canViewMainPage,
  };

  const visibleCategories = getVisibleNavigationCategories(perms);

  // Expanded categories state (for More dropdown)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    more: true,
  });

  const toggleCategory = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleTabClick = (tabId: TabId | string) => {
    onSelectTab(tabId);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  const isEffectiveCollapsed = collapsed && !isMobileOpen;

  const handleCategoryClick = (catId: NavigationCategory) => {
    if (catId === 'more') {
      if (isEffectiveCollapsed) {
        onToggleCollapse();
        setExpandedCategories((prev) => ({ ...prev, more: true }));
      } else {
        setExpandedCategories((prev) => ({ ...prev, more: !prev.more }));
      }
      return;
    }

    if (categoryHasLandingPage(catId, perms)) {
      handleTabClick(catId);
    } else {
      handleTabClick(getFirstPermittedTabForCategory(catId, perms));
    }
  };

  return (
    <aside
      className={`app-sidebar ${isEffectiveCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
      aria-label="Sidebar navigation"
    >
      {/* Sidebar Header with Brand and Toggle */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          {appLogoUrl ? (
            <img src={appLogoUrl} alt={appTitle} className="sidebar-logo" />
          ) : (
            <span className="sidebar-brand-text">{appTitle}</span>
          )}
        </div>

        {/* Mobile Close Button */}
        <button
          type="button"
          className="sidebar-close-btn mobile-only"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
        >
          <X size={20} />
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          className="sidebar-collapse-btn desktop-only"
          onClick={onToggleCollapse}
          aria-label={t('toggleSidebar') || 'Toggle sidebar'}
          title={isEffectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isEffectiveCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Main Navigation Items */}
      <nav className="sidebar-nav tabs">
        {visibleCategories.map((cat, idx) => {
          const isMoreCategory = cat.id === 'more';
          const CatIcon = cat.icon;
          const catLabel = getCategoryLabel(cat);
          const isCatActive = currentCategory === cat.id;

          return (
            <React.Fragment key={cat.id}>
              {/* Divider before More */}
              {isMoreCategory && idx > 0 && <div className="sidebar-divider" />}

              <div className="sidebar-nav-group">
                {cat.collapsibleInSidebar ? (
                  <>
                    <div
                      className={`sidebar-nav-item category-header tab-btn ${isCatActive ? 'active' : ''}`}
                      onClick={() => handleCategoryClick(cat.id)}
                      title={catLabel}
                      data-active={isCatActive ? 'true' : 'false'}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleCategoryClick(cat.id);
                        }
                      }}
                    >
                      <CatIcon size={18} className="nav-icon" />
                      <span className="nav-label">{catLabel}</span>
                      {!isEffectiveCollapsed && (
                        <button
                          type="button"
                          className="accordion-toggle-btn"
                          onClick={(e) => toggleCategory(cat.id, e)}
                          aria-label={`Toggle ${catLabel} subtabs`}
                        >
                          {expandedCategories[cat.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>

                    {!isEffectiveCollapsed && expandedCategories[cat.id] && (
                      <div className="sidebar-sub-tree">
                        {cat.visibleItems.map((sub) => {
                          const SubIcon = sub.icon;
                          const subLabel = getSubItemLabel(sub);
                          const isSubActive = activeTab === sub.id;

                          return (
                            <button
                              key={sub.id}
                              type="button"
                              className={`sidebar-sub-item tab-btn ${isSubActive ? 'active' : ''}`}
                              onClick={() => handleTabClick(sub.id)}
                              aria-label={sub.accessibleName || subLabel}
                              data-active={isSubActive ? 'true' : 'false'}
                              title={subLabel}
                            >
                              <SubIcon size={14} className="sub-icon" />
                              <span className="sub-label">{subLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className={`sidebar-nav-item category-item tab-btn ${isCatActive ? 'active' : ''}`}
                    onClick={() => handleCategoryClick(cat.id)}
                    aria-label={cat.accessibleName || catLabel}
                    data-active={isCatActive ? 'true' : 'false'}
                    title={catLabel}
                  >
                    {isEffectiveCollapsed && cat.id === 'mga' ? (
                      <MgaLinkIcon hideArrow className="nav-icon mga-collapsed-icon" />
                    ) : (
                      <CatIcon size={18} className="nav-icon" />
                    )}
                    <span className="nav-label">{catLabel}</span>
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </nav>
    </aside>
  );
};
