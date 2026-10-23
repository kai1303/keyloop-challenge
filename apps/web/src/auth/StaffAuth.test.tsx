// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaffAuthProvider, useStaffAuth } from "./StaffAuth";
const auth = vi.hoisted(() => ({
  session: {
    isPending: false,
    data: {
      user: { id: "user-1", role: "admin" },
      session: { id: "session-1" },
    },
  },
  fetch: vi.fn(),
}));
vi.mock("./auth-client", () => ({
  authClient: { useSession: () => auth.session },
}));
vi.mock("./authenticated-fetch", () => ({
  authenticatedFetch: auth.fetch,
  clearAccessToken: vi.fn(),
}));
function Profile() {
  const { user } = useStaffAuth();
  return <p>{user?.name ?? "Signed out"}</p>;
}
afterEach(cleanup);
it("verifies a new session after the same user signs back in following expiry", async () => {
  auth.fetch.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ id: "user-1", name: "Admin", role: "admin" }),
      ),
  );
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <StaffAuthProvider>
        <Profile />
      </StaffAuthProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  await screen.findByText("Admin");
  act(() => window.dispatchEvent(new Event("staff-session-expired")));
  expect(screen.getByText("Signed out")).toBeTruthy();
  auth.session = {
    ...auth.session,
    data: { ...auth.session.data, session: { id: "session-2" } },
  };
  view.rerender(tree());
  await screen.findByText("Admin");
  expect(auth.fetch).toHaveBeenCalledTimes(2);
});
