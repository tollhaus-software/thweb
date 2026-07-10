import { useEffect, useRef } from 'react';

export const useRealtime = (onMessage: (message: any) => void) => {
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      onMessage(message);
    };

    socket.onclose = () => {
      console.log('WS connection closed');
    };

    ws.current = socket;

    return () => {
      socket.close();
    };
  }, [onMessage]);

  return ws.current;
};
