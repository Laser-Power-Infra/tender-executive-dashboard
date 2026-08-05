import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function ordinalSuffix(n: number): string {
  if (n > 3 && n < 21) return "th"
  switch (n % 10) {
    case 1: return "st"
    case 2: return "nd"
    case 3: return "rd"
    default: return "th"
  }
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr + "T00:00:00")
  if (isNaN(date.getTime())) return dateStr
  const day = date.getDate()
  const month = date.toLocaleDateString("en-GB", { month: "short" })
  const year = date.getFullYear()
  return `${day}${ordinalSuffix(day)} ${month}, ${year}`
}
