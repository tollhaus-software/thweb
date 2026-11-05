import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  ExternalLink,
  RefreshCw,
  Search,
  Server,
  Layers,
  Clock,
  Tablet,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { t } from '../../utils/i18n';

export interface SiteSummary {
  host: string;
  active_24h: number;
  active_7d: number;
  active_30d: number;
  requests_7d: number;
}

export interface FeatureSummary {
  host: string;
  feature: string;
  client_mode: string;
  unique_users: number;
  request_count: number;
}

export interface UserActivityDetail {
  host: string;
  auth_method: string;
  client_mode: string;
  forwarded_email: string;
  forwarded_user: string;
  preferred_username: string;
  forwarded_groups: string;
  client_dn: string;
  kiosk_mode: string;
  features_used: string;
  total_requests: number;
  last_active_hour_utc: string;
}

export interface ActivityStatsResponse {
  available: boolean;
  days: number;
  sites: SiteSummary[];
  features: FeatureSummary[];
  users: UserActivityDetail[];
}

interface ActivityDashboardProps {
  token: string | null;
}

export const ActivityDashboard: React.FC<ActivityDashboardProps> = ({ token }) => {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<ActivityStatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'users' | 'features'>('users');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchStats = useCallback(
    async (selectedDays: number) => {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (token && token !== 'null' && token !== 'undefined') {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`/api/admin/activity?days=${selectedDays}&limit=500`, { headers });
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        const json: ActivityStatsResponse = await res.json();
        setData(json);
      } catch (err: any) {
        console.error('Failed to load activity statistics:', err);
        setError(err.message || 'Error fetching activity');
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchStats(days);
  }, [days, fetchStats]);

  // Filter users by search term
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u) => {
      return (
        u.forwarded_email?.toLowerCase().includes(q) ||
        u.forwarded_user?.toLowerCase().includes(q) ||
        u.preferred_username?.toLowerCase().includes(q) ||
        u.client_dn?.toLowerCase().includes(q) ||
        u.host?.toLowerCase().includes(q) ||
        u.client_mode?.toLowerCase().includes(q) ||
        u.features_used?.toLowerCase().includes(q)
      );
    });
  }, [data?.users, searchQuery]);

  // Filter features by search term
  const filteredFeatures = useMemo(() => {
    if (!data?.features) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.features;
    return data.features.filter((f) => {
      return (
        f.feature?.toLowerCase().includes(q) ||
        f.host?.toLowerCase().includes(q) ||
        f.client_mode?.toLowerCase().includes(q)
      );
    });
  }, [data?.features, searchQuery]);

  // Compute maximum request count in features for proportional visual bar
  const maxFeatureRequests = useMemo(() => {
    if (!data?.features || data.features.length === 0) return 1;
    return Math.max(...data.features.map((f) => f.request_count), 1);
  }, [data?.features]);

  const formatTimestamp = (isoStr: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div data-testid="activity-dashboard" style={{ width: '100%' }}>
      {/* Top Header & Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              margin: '0 0 0.25rem 0',
            }}
          >
            <Activity size={24} style={{ color: 'var(--primary)' }} />
            {t('activity')}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('subtabDescActivity')}
          </p>
        </div>

        {/* Action Controls & External Perses Link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Time range selector */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-subtle)',
              padding: '2px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
            }}
          >
            {[
              { label: '24h', value: 1 },
              { label: '7d', value: 7 },
              { label: '30d', value: 30 },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setDays(option.value)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: days === option.value ? 'var(--primary)' : 'transparent',
                  color:
                    days === option.value
                      ? 'var(--primary-contrast, white)'
                      : 'var(--text-secondary)',
                  transition: 'background 0.15s ease',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchStats(days)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.85rem',
              background: 'var(--bg-subtle)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
            }}
            title="Aktualisieren"
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
            <span>Aktualisieren</span>
          </button>

          {/* Link to Perses Monitoring Dashboard */}
          <a
            href="https://monitoring.tollhaus.online"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.9rem',
              background: 'var(--bg-subtle)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}
            title="Zu Perses Monitoring öffnen"
          >
            <ExternalLink size={15} />
            <span>{t('persesMonitoring')}</span>
          </a>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#ef4444',
            marginBottom: '1.25rem',
          }}
        >
          <AlertCircle size={18} />
          <span>Fehler beim Laden der Aktivitätsdaten: {error}</span>
        </div>
      )}

      {/* Database Availability Notice */}
      {data && !data.available && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            color: 'var(--text-secondary)',
          }}
        >
          <AlertCircle size={20} />
          <div>
            <strong>SQL-Monitoring nicht verbunden</strong>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
              Die Umgebungsvariable <code>ACTIVITY_DATABASE_URL</code> ist auf diesem Backend nicht
              konfiguriert oder die Tabelle <code>user_activity</code> ist noch nicht initialisiert.
            </p>
          </div>
        </div>
      )}

      {/* Site Summaries (Cards) */}
      {data?.sites && data.sites.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              margin: '0 0 0.75rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Server size={18} />
            <span>Aktive Identitäten nach Host</span>
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {data.sites.map((site) => (
              <div
                key={site.host}
                style={{
                  background: 'var(--bg-card, var(--bg-subtle))',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    marginBottom: '0.75rem',
                    wordBreak: 'break-all',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#10b981',
                      display: 'inline-block',
                    }}
                  />
                  {site.host}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.5rem',
                    textAlign: 'center',
                    background: 'var(--bg-subtle)',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>24h</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {site.active_24h}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>7d</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {site.active_7d}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>30d</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {site.active_30d}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'right',
                  }}
                >
                  7d Anfragen: <strong>{site.requests_7d.toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs & Search Filter Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveSection('users')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              background: activeSection === 'users' ? 'var(--primary)' : 'var(--bg-subtle)',
              color:
                activeSection === 'users'
                  ? 'var(--primary-contrast, white)'
                  : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            <CheckCircle2 size={16} />
            <span>Authentifizierte Benutzer ({data?.users?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveSection('features')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              background: activeSection === 'features' ? 'var(--primary)' : 'var(--bg-subtle)',
              color:
                activeSection === 'features'
                  ? 'var(--primary-contrast, white)'
                  : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            <Layers size={16} />
            <span>Feature-Nutzung ({data?.features?.length || 0})</span>
          </button>
        </div>

        {/* Search Filter Input */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder={
              activeSection === 'users' ? 'Benutzer/Host filtern...' : 'Feature/Host filtern...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              boxSizing: 'border-box',
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Main Table: Authenticated Users */}
      {activeSection === 'users' && (
        <div
          style={{
            overflowX: 'auto',
            background: 'var(--bg-card, var(--bg-subtle))',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <table
            className="data-table"
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <th style={{ padding: '0.75rem 1rem' }}>Identität (Email / Kiosk DN)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Host</th>
                <th style={{ padding: '0.75rem 1rem' }}>Modus / Auth</th>
                <th style={{ padding: '0.75rem 1rem' }}>Genutzte Features</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Anfragen</th>
                <th style={{ padding: '0.75rem 1rem' }}>Zuletzt aktiv</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {loading ? 'Lade Daten...' : 'Keine passenden Einträge gefunden.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const identifier =
                    u.forwarded_email || u.forwarded_user || u.client_dn || 'Anonym / Unbekannt';
                  const isKiosk = u.client_mode === 'kiosk' || Boolean(u.client_dn);

                  return (
                    <tr
                      key={`${u.host}-${identifier}-${u.client_mode}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isKiosk ? (
                            <Tablet size={16} style={{ color: '#0ea5e9', flexShrink: 0 }} />
                          ) : (
                            <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {identifier}
                            </div>
                            {u.preferred_username && u.preferred_username !== identifier && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {u.preferred_username}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {u.host}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: 'var(--bg-subtle)',
                              border: '1px solid var(--border)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--text-main)',
                            }}
                          >
                            {u.client_mode}
                          </span>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: 'var(--bg-subtle)',
                              border: '1px solid var(--border)',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {u.auth_method}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {u.features_used ? (
                            u.features_used.split(',').map((f) => (
                              <span
                                key={f.trim()}
                                style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  color: '#3b82f6',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                }}
                              >
                                {f.trim()}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              -
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: 'var(--text-main)',
                        }}
                      >
                        {u.total_requests.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={14} />
                          <span>{formatTimestamp(u.last_active_hour_utc)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Main Table: Features Breakdown */}
      {activeSection === 'features' && (
        <div
          style={{
            overflowX: 'auto',
            background: 'var(--bg-card, var(--bg-subtle))',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <table
            className="data-table"
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <th style={{ padding: '0.75rem 1rem' }}>Feature</th>
                <th style={{ padding: '0.75rem 1rem' }}>Client-Modus</th>
                <th style={{ padding: '0.75rem 1rem' }}>Host</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Eindeutige Nutzer ({days}d)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Anfragen ({days}d)</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Anteil</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeatures.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {loading ? 'Lade Daten...' : 'Keine passenden Einträge gefunden.'}
                  </td>
                </tr>
              ) : (
                filteredFeatures.map((f, idx) => {
                  const percent = Math.min(
                    100,
                    Math.round((f.request_count / maxFeatureRequests) * 100)
                  );
                  return (
                    <tr
                      key={`${f.host}-${f.feature}-${f.client_mode}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#3b82f6',
                            fontWeight: 600,
                          }}
                        >
                          {f.feature}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {f.client_mode}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {f.host}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: 'var(--text-main)',
                        }}
                      >
                        {f.unique_users.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: 'var(--text-main)',
                        }}
                      >
                        {f.request_count.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div
                          style={{
                            background: 'var(--bg-subtle)',
                            borderRadius: '4px',
                            height: '8px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: 'var(--primary)',
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
