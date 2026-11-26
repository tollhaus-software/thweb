import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  perms?: UserPermissionsContext;
  canReadOverview: boolean;
  canReadEvents?: boolean;
  canImportEvents?: boolean;
  canReadFamiliesAll: boolean;
  canReadFees: boolean;
  canReadFeesAll?: boolean;
  hasFamily?: boolean;
  canReadMembers: boolean;
  canReadJobs?: boolean;
  canReadEmployees: boolean;
  canReadVolunteerAbsences?: boolean;
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
  canManageDashboardTodos?: boolean;
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
  perms: permsProp,
  canReadOverview,
  canReadEvents = false,
  canImportEvents = false,
  canReadFamiliesAll,
  canReadFees,
  canReadFeesAll = false,
  hasFamily,
  canReadMembers,
  canReadJobs = false,
  canReadEmployees,
  canReadVolunteerAbsences = false,
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
  canManageDashboardTodos = false,
  canViewMainPage = false,
  appTitle = 'TH Portal',
  appLogoUrl,
}) => {
  const isMobile = useIsMobile();
  const currentCategory = getCategoryForTab(activeTab);

  const perms: UserPermissionsContext = permsProp || {
    canReadOverview,
    canReadEvents,
    canImportEvents,
    canReadFamiliesAll,
    canReadFees,
    canReadFeesAll,
    hasFamily,
    canReadMembers,
    canReadJobs,
    canReadEmployees,
    canReadVolunteerAbsences,
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
    canManageDashboardTodos,
    canViewMainPage,
  };

  const visibleCategories = getVisibleNavigationCategories(perms);

  // Expanded categories overrides state: catId -> boolean
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({
    more: true,
  });

  const prevCategoryRef = useRef(currentCategory);

  // Automatically expand active category when it changes (Requirement 1: A)
  useEffect(() => {
    if (prevCategoryRef.current !== currentCategory) {
      prevCategoryRef.current = currentCategory;
      if (currentCategory) {
        setExpandedOverrides((prev) => {
          if (prev[currentCategory] === false) {
            const next = { ...prev };
            delete next[currentCategory];
            return next;
          }
          return prev;
        });
      }
    }
  }, [currentCategory]);

  const isCategoryExpanded = (catId: string, isCatActive: boolean): boolean => {
    if (expandedOverrides[catId] !== undefined) {
      return expandedOverrides[catId];
    }
    // Accordion default: the active category and 'more' are expanded
    return isCatActive || catId === 'more';
  };

  const toggleCategory = (catId: string, isCatActive: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentlyExpanded = isCategoryExpanded(catId, isCatActive);
    setExpandedOverrides((prev) => ({ ...prev, [catId]: !currentlyExpanded }));
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
        setExpandedOverrides((prev) => ({ ...prev, more: true }));
      } else {
        setExpandedOverrides((prev) => {
          const current = prev.more !== undefined ? prev.more : true;
          return { ...prev, more: !current };
        });
      }
      return;
    }

    // Ensure category is expanded on click
    setExpandedOverrides((prev) => {
      if (prev[catId] === false) {
        const next = { ...prev };
        delete next[catId];
        return next;
      }
      return prev;
    });

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
          const isCollapsible = Boolean(cat.collapsibleInSidebar || cat.visibleItems.length > 1);
          const isExpanded = isCategoryExpanded(cat.id, isCatActive);
          const shouldRenderSubTree =
            !isEffectiveCollapsed &&
            isExpanded &&
            (!isMobile || isMobileOpen || isMoreCategory);

          return (
            <React.Fragment key={cat.id}>
              {/* Divider before More */}
              {isMoreCategory && idx > 0 && <div className="sidebar-divider" />}

              <div className="sidebar-nav-group">
                {isCollapsible ? (
                  <>
                    <div
                      className={`sidebar-nav-item category-header tab-btn ${isCatActive ? 'active' : ''}`}
                      onClick={() => handleCategoryClick(cat.id)}
                      title={catLabel}
                      aria-label={cat.accessibleName || catLabel}
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
                      {isEffectiveCollapsed && cat.id === 'mga' ? (
                        <MgaLinkIcon hideArrow className="nav-icon mga-collapsed-icon" />
                      ) : (
                        <CatIcon size={18} className="nav-icon" />
                      )}
                      <span className="nav-label">{catLabel}</span>
                      {!isEffectiveCollapsed && (
                        <button
                          type="button"
                          className="accordion-toggle-btn"
                          onClick={(e) => toggleCategory(cat.id, isCatActive, e)}
                          aria-label={`Toggle ${catLabel} subtabs`}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>

                    {shouldRenderSubTree && (
                      <div className="sidebar-sub-tree" data-testid={`sidebar-subtree-${cat.id}`}>
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
                              data-testid={`sidebar-subtab-${sub.id}`}
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
