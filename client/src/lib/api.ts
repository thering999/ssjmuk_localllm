const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...((options?.headers as any) ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && !path.includes('/api/auth/login')) {
      localStorage.removeItem('admin_token');
      // Force reload to trigger redirect to login if we're on a protected route
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message ?? body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
