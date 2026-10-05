export function supportedEnvironment(value) {
  return value === 'staging' || value === 'production';
}

export function runtimeEnvironment() {
  const value = process.env.NC_DEPLOYMENT_ENV || 'staging';
  if (!supportedEnvironment(value)) throw new Error('deployment_environment_invalid');
  return value;
}

export function permittedCloud(environment, origin) {
  try {
    if (!supportedEnvironment(environment)) return false;
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
    if (environment === 'production') return url.origin === 'https://www.neurocheckout.com';
    return url.origin === 'https://community-api-staging.neurocheckout.com' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  } catch { return false; }
}
