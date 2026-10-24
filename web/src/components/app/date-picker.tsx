"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayLabel, isoDate, joinLocal, parseIsoDate, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Common = { id?: string; invalid?: boolean; "aria-label"?: string; className?: string };

/** A calendar in a popover for a "YYYY-MM-DD" value. Keyboard: arrows move, Enter picks, Esc closes. */
export function DatePicker({ value, onChange, min, max, placeholder = "Pick a date", id, invalid, className, ...rest }: Common & {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value) ?? undefined;
  const from = min ? parseIsoDate(min) : null;
  const to = max ? parseIsoDate(max) : null;
  const disabled = [...(from ? [{ before: from }] : []), ...(to ? [{ after: to }] : [])];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          aria-label={rest["aria-label"] ? `${rest["aria-label"]}: ${selected ? dayLabel(selected) : "not set"}` : undefined}
          className={cn("w-full justify-start font-normal", !selected && "text-muted-foreground", className)}
          data-value={value}
        >
          <CalendarDays data-icon="inline-start" aria-hidden />
          {selected ? dayLabel(selected) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="top" avoidCollisions>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? from ?? undefined}
          disabled={disabled}
          onSelect={(d) => {
            if (d) onChange(isoDate(d));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Date plus time for a "YYYY-MM-DDTHH:mm" value (the format datetime-local used). */
export function DateTimePicker({ value, onChange, min, id, invalid, ...rest }: Common & { value: string; onChange: (v: string) => void; min?: string }) {
  const { date, time } = splitLocal(value);
  const minDate = min ? splitLocal(min).date : undefined;
  const label = rest["aria-label"] ?? "Date";
  return (
    <div className="flex gap-2">
      <DatePicker
        id={id}
        value={date}
        min={minDate}
        onChange={(d) => onChange(joinLocal(d, time))}
        invalid={invalid}
        aria-label={label}
        placeholder="Pick a day"
        className="w-auto min-w-0 flex-1"
      />
      <Input
        type="time"
        step={300}
        className="w-32 shrink-0"
        aria-label={`${label}, time`}
        value={time}
        disabled={!date}
        onChange={(e) => onChange(joinLocal(date, e.target.value))}
        aria-invalid={invalid}
      />
    </div>
  );
}
