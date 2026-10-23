import { createAuthClient } from "better-auth/react";
import { adminClient, jwtClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient(), jwtClient()],
});
