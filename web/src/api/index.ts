import type { ApiClient } from './apiClient';
import { AppsScriptBridgeClient } from './appsScriptBridge';
import { MockApiClient } from './mockApi';

const url = import.meta.env.VITE_APPS_SCRIPT_URL?.trim();
const useMock = import.meta.env.VITE_USE_MOCK === 'true' || !url || url.includes('DEPLOYMENT_ID');

export const api: ApiClient = useMock ? new MockApiClient() : new AppsScriptBridgeClient(url);
export const apiMode = useMock ? 'mock' : 'apps-script';

