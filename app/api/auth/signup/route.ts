import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/dal"
import { MOBILE_ERROR, normalizeMobile } from "@/lib/mobile"

export async function POST(req: Request) {
  // Only admins create accounts; open signup would hand out edit rights.
  const forbidden = await requireAdminApi()
  if (forbidden) return forbidden

  try {
    const { name, email, password, mobile: rawMobile } = await req.json()

    if (!email || !password || !rawMobile) {
      return NextResponse.json(
        { error: "Email, mobile and password are required" },
        { status: 400 }
      )
    }

    const mobile = normalizeMobile(String(rawMobile))
    if (!mobile) {
      return NextResponse.json({ error: MOBILE_ERROR }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        name: name || null,
        email,
        mobile,
        passwordHash,
        role: "user",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
