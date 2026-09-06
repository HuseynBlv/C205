import { fromZonedTime } from "date-fns-tz";
import { ROOM_TIMEZONE } from "@/lib/config";

/** Combines a local date + time-of-day, interpreted in the room's own
 * timezone, into a UTC ISO string suitable for a `timestamptz` RPC arg. */
export function roomLocalToUtcIso(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, ROOM_TIMEZONE).toISOString();
}
