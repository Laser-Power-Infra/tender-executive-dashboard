"use server"

import { signIn } from "@/auth"

export async function authenticate(_prev: string | undefined, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const redirectTo = formData.get("redirectTo") as string

  try {
    const url = await signIn("credentials", {
      email,
      password,
      redirectTo,
      redirect: false,
    })

    if (typeof url === "string" && url.includes("error")) {
      return "Invalid email or password"
    }

    return url
  } catch (error) {
    return "Something went wrong"
  }
}
