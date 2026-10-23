import { authClient } from "./auth-client";
let token: string | undefined;
let expires = 0;
let generation = 0;
let pending: Promise<string> | undefined;

export function clearAccessToken() {
  generation++;
  token = undefined;
  expires = 0;
  pending = undefined;
}
export function getAccessToken(): Promise<string> {
  if (token && Date.now() < expires - 30000) return Promise.resolve(token);
  if (pending) return pending;
  const started = generation;
  pending = (async () => {
    const { data, error } = await authClient.token();
    if (error || !data?.token)
      throw new Error("Your session expired. Sign in again.");
    // Expiry is only a client cache hint; the API verifies the signed JWT.
    const claims = JSON.parse(
      atob(data.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    if (!Number.isFinite(claims.exp) || started !== generation)
      throw new Error("Session changed. Sign in again.");
    token = data.token;
    expires = claims.exp! * 1000;
    return token;
  })().finally(() => {
    if (started === generation) pending = undefined;
  });
  return pending;
}
export async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + accessToken);
    return fetch(path, { ...init, headers });
  };
  const rejectedToken = await getAccessToken();
  let response = await send(rejectedToken);
  if (response.status === 401 && !init.signal?.aborted) {
    // A late 401 must not discard another request's renewed token.
    if (token === rejectedToken) {
      token = undefined;
      expires = 0;
    }
    try {
      response = await send(await getAccessToken());
    } catch (error) {
      window.dispatchEvent(new Event("staff-session-expired"));
      throw error;
    }
    if (response.status === 401)
      window.dispatchEvent(new Event("staff-session-expired"));
  }
  return response;
}
