import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { prisma } from "@/lib/prisma"

const txCreateSchema = z.object({
  amount: z.coerce.number().int().positive(), // rupiah integer
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.coerce.date(), // terima "2026-02-04" atau ISO string
  categoryId: z.string().min(1),
  note: z.string().max(200).optional(),
})

const txQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/), // YYYY-MM
})

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => null)
  if (!body) return jsonError("Body harus JSON", 400)

  const parsed = txCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validasi gagal", issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const { amount, type, date, categoryId, note } = parsed.data

  // pastikan category itu milik user (anti akses data orang)
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, type: true },
  })
  if (!cat) return jsonError("Category tidak ditemukan", 404)
  if (cat.type !== type) return jsonError("type transaksi harus sesuai type category", 400)

  const tx = await prisma.transaction.create({
    data: {
      userId,
      categoryId,
      type,
      amount,
      date,
      note: note ?? null,
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
  })

  return NextResponse.json(tx, { status: 201 })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return jsonError("Unauthorized", 401)

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")

  const parsed = txQuerySchema.safeParse({ month })
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validasi query gagal", issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const [yearStr, monthStr] = parsed.data.month.split("-")
  const year = Number(yearStr)
  const m = Number(monthStr) // 1-12

  // range UTC biar konsisten
  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, m, 1, 0, 0, 0))

  const data = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: { date: "desc" },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
  })

  return NextResponse.json(data)
}
