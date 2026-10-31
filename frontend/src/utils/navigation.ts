export type TabId =
  | 'familiesOverview'
  | 'families'
  | 'parents'
  | 'children'
  | 'members'
  | 'employees'
  | 'childcareFees'
  | 'hygieneBelehrung'
  | 'mealPlan'
  | 'mealAllergens'
  | 'audit'
  | 'admin'
  | 'kiosk'
  | 'dashboard';

export type NavigationCategory = 'families' | 'mga' | 'fees' | 'pa' | 'kochen' | 'hygiene' | 'more';

export const getCategoryForTab = (tab: TabId | string): NavigationCategory | '' => {
  switch (tab) {
    case 'familiesOverview':
      return 'families';
    case 'families':
    case 'parents':
    case 'children':
    case 'members':
      return 'mga';
    case 'childcareFees':
      return 'fees';
    case 'employees':
      return 'pa';
    case 'mealAllergens':
    case 'mealPlan':
      return 'kochen';
    case 'hygieneBelehrung':
      return 'hygiene';
    case 'dashboard':
    case 'audit':
    case 'admin':
    case 'kiosk':
      return 'more';
    default:
      return '';
  }
};
