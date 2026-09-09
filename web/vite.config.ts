import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (
    env.VITE_USE_MOCK === 'false' &&
    (!env.VITE_APPS_SCRIPT_URL || env.VITE_APPS_SCRIPT_URL.includes('DEPLOYMENT_ID'))
  ) {
    throw new Error('VITE_APPS_SCRIPT_URL must be set for a production server build.');
  }
  return {
    plugins: [react()],
    base: './',
    server: { port: 4173 },
    build: { outDir: 'dist', sourcemap: false },
  };
});
