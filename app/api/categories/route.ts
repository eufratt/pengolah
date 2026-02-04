import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { prisma } from "@/lib/prisma"

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(["INCOME", "EXPENSE"]),
})

const categoryQuerySchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
})

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ message, ...(extra ? extra : {}) }, { status })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return jsonError("Unauthorized", 401)

  const { searchParams } = new URL(req.url)
  const parsed = categoryQuerySchema.safeParse({
    type: searchParams.get("type") ?? undefined,
  })
  if (!parsed.success) {
    return jsonError("Validasi query gagal", 422, { issues: parsed.error.issues })
  }

  const categories = await prisma.category.findMany({
    where: {
      userId,
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  })

  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => null)
  if (!body) return jsonError("Body harus JSON", 400)

  const parsed = categoryCreateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError("Validasi gagal", 422, { issues: parsed.error.issues })
  }

  const { name, type } = parsed.data

  try {
    const created = await prisma.category.create({
      data: { userId, name, type },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    // karena schema kita pakai @@unique([userId, name, type])
    return jsonError("Kategori sudah ada", 409)
  }
}
