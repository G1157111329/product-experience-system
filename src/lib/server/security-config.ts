export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required in production`);
  }
  return value;
}

export function requireProductionEnv(name: string) {
  if (!isProductionRuntime()) return process.env[name] || '';
  return requireEnv(name);
}

export function getDevFallback(name: string, fallback: string) {
  const value = process.env[name];
  if (value && value.trim()) return value;
  if (isProductionRuntime()) throw new Error(`${name} is required in production`);
  return fallback;
}
