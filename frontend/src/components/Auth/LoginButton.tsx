import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const LoginButton: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('developer@example.com');

  const clientId = window.ENV?.GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || 'mock';
  const isMock = !clientId || clientId === 'mock';

  if (isMock) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email) {
            login(email);
          }
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '320px',
          margin: '0 auto',
          padding: '20px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#888' }}>
          Mock Mode: Login with any email registered in database.
        </div>
        <input
          type="email"
          placeholder="developer@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid #444',
            background: '#222',
            color: '#fff',
            fontSize: '1rem'
          }}
        />
        <button
          type="submit"
          className="primary-button"
          style={{
            padding: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}
        >
          Developer Login
        </button>
      </form>
    );
  }

  return (
    <a
      href="/oauth2/start"
      className="primary-button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '12px 24px',
        fontSize: '1rem',
        fontWeight: 'bold',
        textDecoration: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        marginTop: '15px'
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      Sign in with Google
    </a>
  );
};
