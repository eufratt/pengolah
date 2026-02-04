import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { prisma } from "@/lib/prisma"

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
})

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ message, ...(extra ? extra : {}) }, { status })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return jsonError("Unauthorized", 401)

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({ month: searchParams.get("month") })
  if (!parsed.success) {
    return jsonError("Validasi query gagal", 422, { issues: parsed.error.issues })
  }

  const [yearStr, monthStr] = parsed.data.month.split("-")
  const year = Number(yearStr)
  const m = Number(monthStr) // 1-12

  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, m, 1, 0, 0, 0))

  // total income & expense
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME", date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE", date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ])

  const totalIncome = incomeAgg._sum.amount ?? 0
  const totalExpense = expenseAgg._sum.amount ?? 0
  const balance = totalIncome - totalExpense

  // top expense categories
  const topExpenseCategories = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type: "EXPENSE", date: { gte: start, lt: end } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  })

  // ambil nama kategori untuk hasil groupBy
  const catIds = topExpenseCategories.map((x) => x.categoryId)
  const cats = await prisma.category.findMany({
    where: { userId, id: { in: catIds } },
    select: { id: true, name: true },
  })
  const catMap = new Map(cats.map((c) => [c.id, c.name]))

  const topCategories = topExpenseCategories.map((x) => ({
    categoryId: x.categoryId,
    name: catMap.get(x.categoryId) ?? "(Unknown)",
    total: x._sum.amount ?? 0,
  }))

  return NextResponse.json({
    month: parsed.data.month,
    range: { start, end },
    totalIncome,
    totalExpense,
    balance,
    topCategories,
  })
}
