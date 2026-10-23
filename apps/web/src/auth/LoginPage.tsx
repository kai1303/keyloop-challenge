import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@keyloop-interview/ui/components/button";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import { authClient } from "./auth-client";
import { useStaffAuth } from "./StaffAuth";
import logo from "../assets/keyloop-logo.svg";
export function LoginPage() {
  const { user, loading, error: sessionError } = useStaffAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (user) {
    const destination = location.state?.returnTo;
    return (
      <Navigate
        replace
        to={
          user.role === "admin" &&
          [
            "/admin/bookings",
            "/admin/inventory",
            "/admin/leads",
            "/admin/documents",
          ].includes(destination)
            ? destination
            : "/admin/bookings"
        }
      />
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(fields.get("email")).trim(),
        password: String(fields.get("password")),
      });
      if (result.error)
        setError("Unable to sign in. Check your email and password.");
    } catch {
      setError("Unable to reach sign-in. Please retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="min-h-screen bg-muted/40 px-6 py-16 flex flex-col items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-8 rounded-lg bg-[#14191c] p-5">
          <img
            className="mx-auto brightness-0 invert"
            src={logo}
            alt="Keyloop"
            width="140"
            height="36"
          />
        </div>
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          Dealership workspace
        </p>
        <h1 className="font-heading text-2xl font-semibold">Staff sign in</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          Sign in with your Admin or Technician account.
        </p>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="staff-password">Password</Label>
            <Input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {(error || sessionError) && (
            <p role="alert" className="text-sm text-destructive">
              {error || sessionError}
            </p>
          )}
          <Button type="submit" disabled={pending || loading}>
            {pending
              ? "Signing in…"
              : loading
                ? "Checking session…"
                : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Need an account? Contact your administrator.
        </p>
        <Link
          className="mt-6 inline-block text-sm underline underline-offset-4"
          to="/appointments"
        >
          Book a service as a guest
        </Link>
      </div>
    </main>
  );
}
