import React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  type NavCategory,
  type UserPermissionsContext,
  type TabId,
  getVisibleSubTabsForCategory,
  getCategoryLabel,
  getCategoryDescription,
  getSubItemLabel,
  getSubItemDescription,
} from '../../utils/navigation';
import './CategoryLandingPage.css';

export interface CategoryLandingPageProps {
  category: NavCategory;
  perms: UserPermissionsContext;
  activeTab: TabId | string;
  onSelectTab: (tabId: TabId) => void;
}

export const CategoryLandingPage: React.FC<CategoryLandingPageProps> = ({
  category,
  perms,
  onSelectTab,
}) => {
  const visibleItems = getVisibleSubTabsForCategory(category.id, perms);
  const CategoryIcon = category.icon;
  const categoryTitle = getCategoryLabel(category);
  const categoryDesc = getCategoryDescription(category);

  return (
    <div className="category-landing-container" data-testid={`category-landing-${category.id}`}>
      {/* Header section with category icon, title and description */}
      <header className="category-landing-header">
        <div className="category-landing-header-icon-box">
          <CategoryIcon size={28} className="category-landing-header-icon" />
        </div>
        <div className="category-landing-header-text">
          <h2 className="category-landing-title">{categoryTitle}</h2>
          {categoryDesc && <p className="category-landing-desc">{categoryDesc}</p>}
        </div>
      </header>

      {/* Sub-categories grid */}
      <div className="category-landing-grid" role="list" aria-label={categoryTitle}>
        {visibleItems.map((item) => {
          const ItemIcon = item.icon;
          const itemTitle = getSubItemLabel(item);
          const itemDesc = getSubItemDescription(item);

          return (
            <button
              key={item.id}
              type="button"
              className="category-landing-card"
              role="listitem"
              aria-label={item.accessibleName || itemTitle}
              onClick={() => onSelectTab(item.id)}
            >
              <div className="category-card-icon-wrap">
                <ItemIcon size={22} className="category-card-icon" />
              </div>
              <div className="category-card-content">
                <div className="category-card-title-row">
                  <span className="category-card-title">{itemTitle}</span>
                  <ChevronRight size={18} className="category-card-arrow" />
                </div>
                {itemDesc && <p className="category-card-desc">{itemDesc}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
