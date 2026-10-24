"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** shadcn-style calendar on react-day-picker v9 (written by hand: the registry isn't reachable from CI). */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames()
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 [--cell:2.25rem]", className)}
      classNames={{
        root: cn("w-fit", d.root),
        months: cn("relative flex flex-col gap-4", d.months),
        month: cn("flex w-full flex-col gap-3", d.month),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", d.nav),
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-(--cell) aria-disabled:opacity-40", d.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-(--cell) aria-disabled:opacity-40", d.button_next),
        month_caption: cn("flex h-(--cell) items-center justify-center", d.month_caption),
        caption_label: cn("text-sm font-medium", d.caption_label),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", d.weekdays),
        weekday: cn("text-muted-foreground w-(--cell) text-[0.8rem] font-normal", d.weekday),
        week: cn("mt-1 flex w-full", d.week),
        day: cn("relative size-(--cell) p-0 text-center text-sm", d.day),
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-(--cell) font-normal tabular-nums aria-selected:opacity-100",
          d.day_button,
        ),
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:ring-ring/60 [&>button]:ring-1",
        outside: "text-muted-foreground/60",
        disabled: "text-muted-foreground opacity-40 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === "left" ? <ChevronLeft className={cn("size-4", c)} aria-hidden /> : <ChevronRight className={cn("size-4", c)} aria-hidden />,
      }}
      {...props}
    />
  )
}

export { Calendar }
