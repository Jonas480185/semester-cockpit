// Server-side opt-in. Disabled deployments never query the new table.
export function timetableEnabled() {
  return process.env.COCKPIT_TIMETABLE_ENABLED === "1";
}
