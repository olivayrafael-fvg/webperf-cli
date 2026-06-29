const PROTECTED_ENVS = ['dev', 'qa'];

export async function checkConnectivity(baseUrl, env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(baseUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return { ok: true };
  } catch {
    clearTimeout(timer);
    const vpnRequired = PROTECTED_ENVS.includes(env);
    return {
      ok: false,
      vpnRequired,
      message: vpnRequired
        ? `No se puede acceder a ${baseUrl}. Verificá que tenés VPN activa (entorno: ${env}).`
        : `No se puede acceder a ${baseUrl}.`,
    };
  }
}
