import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authClient } from "./auth-client";
import { authenticatedFetch, clearAccessToken } from "./authenticated-fetch";
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "technician";
}
interface StaffState {
  user: StaffUser | null;
  loading: boolean;
  error: string;
  signOut: () => Promise<void>;
}
export const StaffContext = createContext<StaffState>({
  user: null,
  loading: false,
  error: "",
  signOut: async () => {},
});
export const useStaffAuth = () => useContext(StaffContext);
export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const client = useQueryClient();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    clearAccessToken();
    client.clear();
    setUser(null);
    setError("");
    if (session.isPending) {
      setLoading(true);
      return () => abort.abort();
    }
    if (!session.data) {
      setLoading(false);
      return () => abort.abort();
    }
    setLoading(true);
    void authenticatedFetch("/api/staff/me", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Unable to verify staff access. Sign in again.");
        const profile = (await response.json()) as StaffUser;
        if (!["admin", "technician"].includes(profile.role))
          throw new Error("This account has no staff role.");
        if (!abort.signal.aborted) setUser(profile);
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to verify staff access.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [
    session.isPending,
    session.data?.session.id,
    session.data?.user.id,
    session.data?.user.role,
    client,
  ]);
  useEffect(() => {
    const expired = () => {
      clearAccessToken();
      client.clear();
      setUser(null);
      setLoading(false);
      setError("Your session expired. Sign in again.");
    };
    window.addEventListener("staff-session-expired", expired);
    return () => window.removeEventListener("staff-session-expired", expired);
  }, [client]);
  const signOut = async () => {
    const result = await authClient.signOut();
    if (result.error) throw new Error("Unable to sign out. Please retry.");
    clearAccessToken();
    client.clear();
    setUser(null);
  };
  return (
    <StaffContext.Provider value={{ user, loading, error, signOut }}>
      {children}
    </StaffContext.Provider>
  );
}
export function StaffGate() {
  const { user, loading } = useStaffAuth();
  const location = useLocation();
  if (loading)
    return (
      <p role="status" className="p-6">
        Checking staff session…
      </p>
    );
  if (!user)
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname }} />
    );
  if (
    user.role === "technician" &&
    location.pathname.replace(/\/$/, "") !== "/admin/bookings"
  )
    return <Navigate to="/admin/bookings" replace />;
  return <Outlet key={user.id + user.role} />;
}
