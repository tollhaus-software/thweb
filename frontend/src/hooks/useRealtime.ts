import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export interface RealtimeMessage {
  type: string;
  payload?: unknown;
}

export const useRealtime = (
  onMessage: (message: RealtimeMessage) => void,
  explicitToken?: string | null
): void => {
  const { token: authContextToken } = useAuth();
  const token = explicitToken !== undefined ? explicitToken : authContextToken;
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    if (token) {
      params.set('token', token);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws${query}`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onMessage(message);
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    socket.onerror = (err) => {
      console.warn('WS error:', err);
    };

    socket.onclose = () => {
      console.log('WS connection closed');
    };

    ws.current = socket;

    return () => {
      socket.close();
    };
  }, [onMessage, token]);
};

