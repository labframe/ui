"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [isMonthOpen, setIsMonthOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(
    props.month || new Date()
  );

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const monthIndex = currentMonth.getMonth();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      month={currentMonth}
      onMonthChange={setCurrentMonth}
      className={cn("p-3", className)}
      components={{
        Caption: ({ displayMonth }: { displayMonth: Date }) => {
          return (
            <div className="flex items-center gap-2 px-1">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded border border-border bg-muted/80 px-0.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => {
                    const newDate = new Date(displayMonth);
                    newDate.setMonth(displayMonth.getMonth() - 1);
                    setCurrentMonth(newDate);
                  }}
                >
                  <ChevronUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded border border-border bg-muted/80 px-0.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => {
                    const newDate = new Date(displayMonth);
                    newDate.setMonth(displayMonth.getMonth() + 1);
                    setCurrentMonth(newDate);
                  }}
                >
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </div>
              <Popover open={isMonthOpen} onOpenChange={setIsMonthOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 items-center justify-center rounded border border-border bg-muted/80 px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {months[displayMonth.getMonth()]} {displayMonth.getFullYear()}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="grid grid-cols-3 gap-1 p-2">
                    {months.map((month, idx) => (
                      <button
                        key={month}
                        type="button"
                        className={cn(
                          "rounded px-2 py-1 text-sm transition-colors hover:bg-muted/60",
                          idx === displayMonth.getMonth() && "bg-muted font-medium"
                        )}
                        onClick={() => {
                          const newDate = new Date(displayMonth);
                          newDate.setMonth(idx);
                          setCurrentMonth(newDate);
                          setIsMonthOpen(false);
                        }}
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          );
        },
      } as any}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex items-center pt-1 relative",
        caption_label: "hidden",
        nav: "hidden",
        nav_button: "hidden",
        nav_button_previous: "hidden",
        nav_button_next: "hidden",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] flex items-center justify-center",
        row: "flex w-full mt-2",
        cell: "h-8 w-8 p-0 relative flex items-center justify-center [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

