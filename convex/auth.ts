import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

// Email + password only. Front desks and coaches sign in on shared or personal
// devices without an email round-trip, and there is no third-party auth bill.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string | undefined) ?? "",
        };
      },
    }),
  ],
});
