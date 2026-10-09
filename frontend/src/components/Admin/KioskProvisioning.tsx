import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, Download, Key, Tablet, CheckCircle } from 'lucide-react';
import { t } from '../../utils/i18n';

interface KioskProvisioningProps {
  token: string | null;
}

export const KioskProvisioning: React.FC<KioskProvisioningProps> = ({ token }) => {
  const [caReady, setCaReady] = useState<boolean | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [deviceName, setDeviceName] = useState('');
  const [password, setPassword] = useState('');
  const [days, setDays] = useState(730);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDevice, setSuccessDevice] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const fetchStatus = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/admin/kiosk-certs/status', { headers });
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setCaReady(Boolean(data.ca_initialized));
          }
        }
      } catch (e) {
        console.error('Failed to fetch kiosk CA status:', e);
      } finally {
        if (!ignore) setStatusLoading(false);
      }
    };

    fetchStatus();
    return () => {
      ignore = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = deviceName.trim().toLowerCase();
    if (!cleanName) {
      setError(t('requiredFields'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessDevice(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/kiosk-certs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          device_name: cleanName,
          password: password,
          days: Number(days) || 730,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to issue kiosk certificate');
      }

      // Trigger browser file download
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${cleanName}.p12`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      setSuccessDevice(cleanName);
      setDeviceName('');
      setPassword('');
    } catch (err: unknown) {
      console.error('Error issuing kiosk certificate:', err);
      const msg = err instanceof Error ? err.message : 'Error generating certificate';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="kiosk-provisioning-card"
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        padding: '1.75rem',
        boxShadow: 'var(--shadow)',
        maxWidth: '720px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
        <div
          style={{
            background: 'rgba(37, 99, 235, 0.1)',
            color: 'var(--primary)',
            padding: '0.75rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Tablet size={32} />
        </div>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem' }}>{t('kioskProvisioningTitle')}</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            {t('kioskProvisioningDesc')}
          </p>
        </div>
      </div>

      {/* CA Status Banner */}
      {!statusLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            background: caReady ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: caReady ? '#15803d' : '#b91c1c',
            border: `1px solid ${caReady ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {caReady ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
          <span>{caReady ? t('kioskCaReady') : t('kioskCaNotReady')}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#b91c1c',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Success banner with instructions */}
      {successDevice && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#15803d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            <CheckCircle size={20} />
            <span>{t('kioskCertSuccess')} ({successDevice}.p12)</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#166534' }}>
            {t('kioskInstallInstructions')}
          </p>
        </div>
      )}

      {/* Provisioning Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label
            htmlFor="kiosk-device-name"
            style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}
          >
            {t('deviceNameLabel')} <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="kiosk-device-name"
            type="text"
            required
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder={t('deviceNamePlaceholder')}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-main)',
              color: 'var(--text)',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="kiosk-password"
            style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}
          >
            {t('kioskPasswordLabel')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="kiosk-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('kioskPasswordPlaceholder')}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text)',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="kiosk-days"
            style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}
          >
            {t('validityDaysLabel')}
          </label>
          <input
            id="kiosk-days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 730)}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-main)',
              color: 'var(--text)',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || caReady === false}
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: submitting || caReady === false ? 'not-allowed' : 'pointer',
            opacity: submitting || caReady === false ? 0.6 : 1,
            transition: 'background 0.2s',
          }}
        >
          {submitting ? (
            <>
              <Key size={18} className="animate-spin" />
              <span>{t('generatingCert')}</span>
            </>
          ) : (
            <>
              <Download size={18} />
              <span>{t('generateCertBtn')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
