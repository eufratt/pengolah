import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { prisma } from "@/lib/prisma"

const DEFAULTS = {
  EXPENSE: [
    "Makan & Minum",
    "Transport",
    "Belanja",
    "Kos/Tempat Tinggal",
    "Tagihan",
    "Pulsa/Internet",
    "Kesehatan",
    "Hiburan",
    "Pendidikan",
    "Lainnya",
  ],
  INCOME: ["Gaji", "Bonus", "Freelance", "Hadiah", "Dividen", "Lainnya"],
} as const

export async function POST() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const data = [
    ...DEFAULTS.EXPENSE.map((name) => ({ userId, name, type: "EXPENSE" as const })),
    ...DEFAULTS.INCOME.map((name) => ({ userId, name, type: "INCOME" as const })),
  ]

  // skipDuplicates bekerja kalau ada unique constraint (kita punya)
  const result = await prisma.category.createMany({
    data,
    skipDuplicates: true,
  })

  return NextResponse.json({
    message: "Seed selesai",
    createdCount: result.count,
  })
}
