import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { internal } from "./_generated/api";
import { ActionCtx } from "./_generated/server";

/**
 * Six digits, not a magic link.
 *
 * A link opened on the front desk computer signs *that* browser in, which is the
 * wrong one when the person who forgot their password is standing at the counter
 * holding their phone. A code can be carried between devices, read out loud, and
 * typed into the page they already have open.
 */
const PasswordReset = Email({
  id: "password-reset",
  maxAge: 60 * 60,
  async generateVerificationToken() {
    // Six digits from the platform's CSPRNG, taken modulo-free so every code is
    // equally likely — a reset code is a password for the length of an hour.
    const bytes = new Uint32Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => String(value % 10)).join("");
  },
  // Convex Auth passes its action context as a second argument, but the type
  // it inherits from @auth/core only describes the first. The cast is narrow
  // and local rather than loosening the provider's whole options object.
  sendVerificationRequest: (async (
    { identifier, token }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) => {
    await ctx.runAction(internal.email.sendPasswordReset, {
      to: identifier,
      code: token,
    });
  }) as unknown as (params: { identifier: string; token: string }) => Promise<void>,
});

// Email + password only. Front desks and coaches sign in on shared or personal
// devices without an email round-trip, and there is no third-party auth bill.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: PasswordReset,
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string | undefined) ?? "",
        };
      },
    }),
  ],
});
