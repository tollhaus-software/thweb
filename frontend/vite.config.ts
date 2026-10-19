import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { MOBILE_BREAKPOINT_PX } from './src/constants/breakpoints'

function cssBreakpointPlugin(): Plugin {
  return {
    name: 'css-breakpoint-replace',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.endsWith('.css') || id.includes('.css?')) {
        return {
          code: code.replaceAll('__MOBILE_BREAKPOINT__', MOBILE_BREAKPOINT_PX),
          map: null,
        };
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cssBreakpointPlugin()],
  optimizeDeps: {
    include: ['react-easy-edit', 'prop-types'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
    },
  },
})
