/** 30-minute time-of-day options for the "time list" mobile booking picker. */
export function generateTimeOptions(stepMinutes = 30) {
  const options: { value: string; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours24).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    const period = hours24 < 12 ? "AM" : "PM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const label = `${hours12}:${String(mins).padStart(2, "0")} ${period}`;
    options.push({ value, label });
  }
  return options;
}
