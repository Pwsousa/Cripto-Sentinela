const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---------- Identity ----------

export const api = {
  identity: {
    create: (id_unidade: string) =>
      request<{ id_unidade: string; rsa_public_b64: string; ecdsa_public_b64: string }>(
        "POST", "/identity", { id_unidade }
      ),
    get: () =>
      request<{ id_unidade: string; rsa_public_b64: string; ecdsa_public_b64: string }>(
        "GET", "/identity"
      ),
    publishIff: () => request<{ ok: boolean }>("POST", "/identity/publish-iff"),
    delete: () => request<{ ok: boolean }>("DELETE", "/identity"),
  },

  messages: {
    send: (dest: string, plaintext: string) =>
      request<{ ok: boolean }>("POST", "/messages/send", { dest, plaintext }),
  },

  trusted: {
    list: () => request<Record<string, { id_unidade: string; chave_publica_rsa: string; chave_publica_ecdsa: string; ultima_atualizacao: string }>>(
      "GET", "/trusted"
    ),
    forget: (unit_id: string) => request<{ ok: boolean }>("DELETE", `/trusted/${unit_id}`),
  },

  revocation: {
    revoke: (unit_id: string) => request<{ ok: boolean }>("POST", "/revocation", { unit_id }),
    list: () => request<Record<string, { by: string; timestamp: string }>>("GET", "/revocation"),
  },

  status: () => request<{ mqtt: string; identity: string | null }>("GET", "/status"),
};
