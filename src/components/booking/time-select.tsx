"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateTimeOptions } from "@/lib/time-options";

const timeOptions = generateTimeOptions(30);

/** The "time list" mobile-friendly picker for a start or end time. */
export function TimeSelect({
  value,
  onChange,
  placeholder = "Select time",
  disabled,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {timeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
