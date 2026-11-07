/**
 * Experiments & Feature Flags Configuration for thweb.
 *
 * All experiments and their toggle logic are defined in this file.
 * Currently uses URL query parameter targeting without localStorage.
 * Structured so that backend user/permission targeting or gradual rollout
 * can be plugged in without changing the calling interfaces.
 */

export type ExperimentId = 'main_page';

export interface ExperimentUserContext {
  email?: string;
  roles?: string[];
  permissions?: string[];
  effective_permissions?: string[];
}

export interface ExperimentCheckOptions {
  /** Optional custom URL query string to inspect (defaults to window.location.search). */
  search?: string;
  /** Optional user context for future backend/role-based targeting. */
  user?: ExperimentUserContext | null;
}

export interface ExperimentDefinition {
  id: ExperimentId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  /** Direct query parameter aliases (e.g., 'exp_main', 'main_page') */
  paramAliases?: string[];
}

export const EXPERIMENTS: Record<ExperimentId, ExperimentDefinition> = {
  main_page: {
    id: 'main_page',
    name: 'Main Page',
    description: 'Daily overview of cooking, food/allergens, and kitas-related information',
    defaultEnabled: false,
    paramAliases: ['exp_main', 'main_page', 'main'],
  },
};

/**
 * Checks whether an experiment is active.
 *
 * Supported URL query parameters:
 *   - Specific alias:
 *       ?exp_main=1, ?exp_main=true  -> active
 *       ?exp_main=0, ?exp_main=false -> inactive (explicit opt-out)
 *   - Generic query parameters:
 *       ?experiment=main_page (or ?experiment=main)
 *       ?exp=main_page
 *       ?experiments=main_page,other_flag
 *
 * Returns false by default if no matching query parameter is found.
 */
export function isExperimentActive(
  id: ExperimentId,
  options?: ExperimentCheckOptions
): boolean {
  const exp = EXPERIMENTS[id];
  if (!exp) return false;

  let search = options?.search;
  if (search === undefined && typeof window !== 'undefined') {
    search = window.location.search;
  }

  if (search) {
    const params = new URLSearchParams(search);

    // 1. Direct param aliases (e.g. ?exp_main=1 or ?exp_main=false)
    const directKeys = exp.paramAliases || [id];
    for (const key of directKeys) {
      const val = params.get(key);
      if (val !== null) {
        const lower = val.trim().toLowerCase();
        if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on') {
          return true;
        }
        if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') {
          return false;
        }
      }
    }

    // 2. Generic param: ?experiment=main or ?exp=main or ?experiments=main,foo
    const genericKeys = ['experiment', 'exp', 'experiments'];
    const matchTargets = [id.toLowerCase(), ...(exp.paramAliases || []).map((a) => a.toLowerCase())];

    for (const gKey of genericKeys) {
      const val = params.get(gKey);
      if (val) {
        const tokens = val.split(',').map((t) => t.trim().toLowerCase());
        if (tokens.some((token) => matchTargets.includes(token))) {
          return true;
        }
      }
    }
  }

  // 3. Optional user context for future backend permission / rollout integration
  // Can be plugged in here when backend targeting or percentage-based rollouts are introduced:
  if (options?.user) {
    // Reserved for future backend targeting (e.g. options.user.effective_permissions?.includes(`experiment.${id}`))
  }

  return exp.defaultEnabled;
}
