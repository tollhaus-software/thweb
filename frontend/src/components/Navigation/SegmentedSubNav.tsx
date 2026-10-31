import React from 'react';
import { t } from '../../utils/i18n';
import { getCategoryForTab, type TabId } from '../../utils/navigation';

export interface SegmentedSubNavProps {
  activeTab: TabId | string;
  onSelectTab: (tabId: TabId) => void;
  canReadFamiliesAll: boolean;
  canReadMembers: boolean;
  canReadEmployees: boolean;
  canViewMealPlan: boolean;
  canReadMealAllergens: boolean;
  hasHygieneWrite?: boolean;
}

interface SubTabItem {
  id: TabId;
  label: string;
  accessibleName: string;
  visible: boolean;
}

export const SegmentedSubNav: React.FC<SegmentedSubNavProps> = ({
  activeTab,
  onSelectTab,
  canReadFamiliesAll,
  canReadMembers,
  canReadEmployees,
  canViewMealPlan,
  canReadMealAllergens,
}) => {
  const currentCategory = getCategoryForTab(activeTab);

  let subTabs: SubTabItem[] = [];

  if (currentCategory === 'mga') {
    const items: SubTabItem[] = [
      {
        id: 'families',
        label: t('subtabFamilies') || 'Familien',
        accessibleName: 'Familien(MGA)',
        visible: canReadFamiliesAll,
      },
      {
        id: 'parents',
        label: t('subtabParents') || 'Eltern',
        accessibleName: 'Eltern(MGA)',
        visible: canReadFamiliesAll,
      },
      {
        id: 'children',
        label: t('subtabChildren') || 'Kinder',
        accessibleName: 'Kinder(MGA)',
        visible: canReadFamiliesAll,
      },
      {
        id: 'members',
        label: t('subtabMembers') || 'Vereinsmitglieder',
        accessibleName: 'Vereinsmitglieder',
        visible: canReadMembers,
      },
    ];
    subTabs = items.filter((s) => s.visible);
  } else if (currentCategory === 'kochen') {
    const items: SubTabItem[] = [
      {
        id: 'mealAllergens',
        label: t('subtabAllergens') || 'Allergene',
        accessibleName: 'Essen/Allergene',
        visible: canReadMealAllergens,
      },
      {
        id: 'mealPlan',
        label: t('subtabMealPlan') || 'Wochenplan',
        accessibleName: 'Essen/Wochenplan',
        visible: canViewMealPlan,
      },
    ];
    subTabs = items.filter((s) => s.visible);
  } else if (currentCategory === 'pa') {
    const items: SubTabItem[] = [
      {
        id: 'employees',
        label: t('subtabEmployees') || 'Mitarbeitende',
        accessibleName: 'Mitarbeitende(PA)',
        visible: canReadEmployees,
      },
    ];
    subTabs = items.filter((s) => s.visible);
  }

  // If no subtabs to show, render nothing (saves vertical screen space!)
  if (subTabs.length === 0) {
    return null;
  }

  return (
    <div className="tabs-wrapper subtabs-bar" role="navigation" aria-label="Unter-Navigation">
      <div className="tabs segmented-control">
        {subTabs.map((sub) => {
          const isActive = activeTab === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              aria-label={sub.accessibleName}
              className={`tab-btn segment-btn ${isActive ? 'active' : ''}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectTab(sub.id)}
              title={sub.label}
            >
              {sub.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
