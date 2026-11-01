import React, { useState } from 'react';
import {
  Users,
  CircleDollarSign,
  Briefcase,
  Utensils,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  X,
  History,
  Shield,
  Key,
  LayoutDashboard,
  MoreHorizontal,
  Sparkles,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import { getCategoryForTab, type TabId } from '../../utils/navigation';
import { MgaLinkIcon } from '../MgaLinkIcon';

export interface SidebarProps {
  activeTab: TabId | string;
  onSelectTab: (tabId: TabId) => void;
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
  canReadAudit?: boolean;
  canManageUsers?: boolean;
  canProvisionKiosk?: boolean;
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
  canReadAudit = false,
  canManageUsers = false,
  canProvisionKiosk = false,
  appTitle = 'TH Portal',
  appLogoUrl,
}) => {
  const currentCategory = getCategoryForTab(activeTab);

  // Expanded categories state (for More dropdown)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    more: true,
  });

  const toggleCategory = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleTabClick = (tabId: TabId) => {
    onSelectTab(tabId);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  // First permitted MGA tab
  const getFirstMgaTab = (): TabId => {
    if (canReadFamiliesAll) return 'families';
    if (canReadMembers) return 'members';
    if (canReadJobs) return 'jobs';
    return 'families';
  };

  // First permitted Kochen tab
  const getFirstKochenTab = (): TabId => {
    if (canReadMealAllergens) return 'mealAllergens';
    if (canViewMealPlan) return 'mealPlan';
    return 'mealPlan';
  };

  const isEffectiveCollapsed = collapsed && !isMobileOpen;

  const handleCategoryClick = (catId: string) => {
    switch (catId) {
      case 'families':
        handleTabClick('familiesOverview');
        break;
      case 'mga':
        handleTabClick(getFirstMgaTab());
        break;
      case 'fees':
        handleTabClick('childcareFees');
        break;
      case 'pa':
        handleTabClick('employees');
        break;
      case 'kochen':
        handleTabClick(getFirstKochenTab());
        break;
      case 'hygiene':
        handleTabClick('hygieneBelehrung');
        break;
      case 'more':
        if (isEffectiveCollapsed) {
          onToggleCollapse();
          setExpandedCategories((prev) => ({ ...prev, more: true }));
        } else {
          setExpandedCategories((prev) => ({ ...prev, more: !prev.more }));
        }
        break;
      default:
        break;
    }
  };

  const canShowMga = canReadFamiliesAll || canReadMembers || canReadJobs;
  const canShowHygiene = canReadFamiliesAll || hasHygieneWrite;
  const canShowKochen = canReadMealAllergens || canViewMealPlan;
  const canShowMore = true; // Dashboard is accessible to all

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
        {/* Families Category */}
        {canReadOverview && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'families' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('families')}
              aria-label={t('familiesOverview') || 'Familien'}
              data-active={currentCategory === 'families' ? 'true' : 'false'}
              title={t('navFamilies') || 'Familien'}
            >
              <Users size={18} className="nav-icon" />
              <span className="nav-label">{t('navFamilies') || 'Familien'}</span>
            </button>
          </div>
        )}

        {/* MGA Category */}
        {canShowMga && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'mga' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('mga')}
              aria-label={t('navMga') || 'MGA'}
              data-active={currentCategory === 'mga' ? 'true' : 'false'}
              title={t('navMga') || 'MGA'}
            >
              {isEffectiveCollapsed ? (
                <MgaLinkIcon hideArrow className="nav-icon mga-collapsed-icon" />
              ) : (
                <Users size={18} className="nav-icon" />
              )}
              <span className="nav-label">{t('navMga') || 'MGA'}</span>
            </button>
          </div>
        )}

        {/* Gebühren Category */}
        {canReadFees && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'fees' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('fees')}
              aria-label={t('childcareFees') || 'Betreuungsgebühren'}
              data-active={currentCategory === 'fees' ? 'true' : 'false'}
              title={t('navFees') || 'Gebühren'}
            >
              <CircleDollarSign size={18} className="nav-icon" />
              <span className="nav-label">{t('navFees') || 'Gebühren'}</span>
            </button>
          </div>
        )}

        {/* PA Category */}
        {canReadEmployees && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'pa' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('pa')}
              aria-label={t('navPa') || 'PA'}
              data-active={currentCategory === 'pa' ? 'true' : 'false'}
              title={t('navPa') || 'PA'}
            >
              <Briefcase size={18} className="nav-icon" />
              <span className="nav-label">{t('navPa') || 'PA'}</span>
            </button>
          </div>
        )}

        {/* Kochen Category */}
        {canShowKochen && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'kochen' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('kochen')}
              aria-label={t('navKochen') || 'Kochen'}
              data-active={currentCategory === 'kochen' ? 'true' : 'false'}
              title={t('navKochen') || 'Kochen'}
            >
              <Utensils size={18} className="nav-icon" />
              <span className="nav-label">{t('navKochen') || 'Kochen'}</span>
            </button>
          </div>
        )}

        {/* Hygiene Category */}
        {canShowHygiene && (
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-nav-item category-item tab-btn ${currentCategory === 'hygiene' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('hygiene')}
              aria-label={t('navHygiene') || 'Hygiene'}
              data-active={currentCategory === 'hygiene' ? 'true' : 'false'}
              title={t('navHygiene') || 'Hygiene'}
            >
              <Sparkles size={18} className="nav-icon" />
              <span className="nav-label">{t('navHygiene') || 'Hygiene'}</span>
            </button>
          </div>
        )}

        {/* Divider before More */}
        <div className="sidebar-divider" />

        {/* Mehr (...) Category */}
        {canShowMore && (
          <div className="sidebar-nav-group">
            <div
              className={`sidebar-nav-item category-header tab-btn ${currentCategory === 'more' ? 'active' : ''}`}
              onClick={() => handleCategoryClick('more')}
              title={t('navMore') || 'Mehr'}
              data-active={currentCategory === 'more' ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCategoryClick('more');
                }
              }}
            >
              <MoreHorizontal size={18} className="nav-icon" />
              <span className="nav-label">{t('navMore') || 'Mehr'}</span>
              {!isEffectiveCollapsed && (
                <button
                  type="button"
                  className="accordion-toggle-btn"
                  onClick={(e) => toggleCategory('more', e)}
                  aria-label="Toggle More subtabs"
                >
                  {expandedCategories.more ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              )}
            </div>

            {!isEffectiveCollapsed && expandedCategories.more && (
              <div className="sidebar-sub-tree">
                <button
                  type="button"
                  className={`sidebar-sub-item tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => handleTabClick('dashboard')}
                  aria-label={t('dashboard') || 'Dashboard'}
                  data-active={activeTab === 'dashboard' ? 'true' : 'false'}
                  title={t('dashboard') || 'Dashboard'}
                >
                  <LayoutDashboard size={14} className="sub-icon" />
                  <span className="sub-label">{t('dashboard') || 'Dashboard'}</span>
                </button>

                {canReadAudit && (
                  <button
                    type="button"
                    className={`sidebar-sub-item tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => handleTabClick('audit')}
                    aria-label={t('audit') || 'Historie'}
                    data-active={activeTab === 'audit' ? 'true' : 'false'}
                    title={t('audit') || 'Historie'}
                  >
                    <History size={14} className="sub-icon" />
                    <span className="sub-label">{t('audit') || 'Historie'}</span>
                  </button>
                )}

                {canManageUsers && (
                  <button
                    type="button"
                    className={`sidebar-sub-item tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
                    onClick={() => handleTabClick('admin')}
                    aria-label={t('admin') || 'Admin'}
                    data-active={activeTab === 'admin' ? 'true' : 'false'}
                    title={t('admin') || 'Admin'}
                  >
                    <Shield size={14} className="sub-icon" />
                    <span className="sub-label">{t('admin') || 'Admin'}</span>
                  </button>
                )}

                {canProvisionKiosk && (
                  <button
                    type="button"
                    className={`sidebar-sub-item tab-btn ${activeTab === 'kiosk' ? 'active' : ''}`}
                    onClick={() => handleTabClick('kiosk')}
                    aria-label={t('kioskCertificates') || 'Kiosk-Zertifikate'}
                    data-active={activeTab === 'kiosk' ? 'true' : 'false'}
                    title={t('kioskCertificates') || 'Kiosk-Zertifikate'}
                  >
                    <Key size={14} className="sub-icon" />
                    <span className="sub-label">{t('kioskCertificates') || 'Kiosk-Zertifikate'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
};
