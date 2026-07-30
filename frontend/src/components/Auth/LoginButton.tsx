import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
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
    <GoogleLogin
      onSuccess={(credentialResponse) => {
        if (credentialResponse.credential) {
          login(credentialResponse.credential);
        }
      }}
      onError={() => {
        console.error('Login Failed');
      }}
    />
  );
};
