import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Google sign-in only opens accounts an admin already created; it never creates one.
const findByEmail = (email: string) =>
  prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true, active: true },
  })

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string
          password: string
        }

        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.passwordHash || !user.active) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      },
    }),
    // Needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (OAuth web client, redirect URI <app-url>/api/auth/callback/google).
    // Without AUTH_GOOGLE_ID the login page hides the Google button.
    Google,
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true
      if (!profile?.email_verified || !profile.email) return false
      const user = await findByEmail(profile.email)
      return !!user?.active
    },
    async jwt({ token, user, account }) {
      if (user && account?.provider === "google") {
        // Google hands over its own user id; the session must carry ours.
        const dbUser = await findByEmail(user.email!)
        if (!dbUser) return null
        token.id = dbUser.id
        token.role = dbUser.role
        // Activity logs read name and email from the session: keep them as the admin entered them.
        token.name = dbUser.name
        token.email = dbUser.email
        return token
      }
      if (user) {
        token.id = user.id as string
        token.role = (user as any).role
        return token
      }
      // Re-read on every session check, so a role change or a deactivation
      // takes effect at once instead of when the token expires.
      // ponytail: one indexed lookup per check; cache briefly if it shows up in profiles.
      const current = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { role: true, active: true },
      })
      if (!current?.active) return null
      token.role = current.role
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  session: { strategy: "jwt" },
  // Cookies ignore ports, so the default name collides with other Auth.js apps on this host.
  cookies: { sessionToken: { name: "tender-exec.session-token" } },
  // A refused Google sign-in comes back to the login page with ?error=AccessDenied.
  pages: { signIn: "/auth/login", error: "/auth/login" },
  trustHost: true,
})
