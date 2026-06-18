import { redirect } from "next/navigation";

/** Default settings landing → Equipment (FR-SET-1). */
export default function SettingsIndex() {
  redirect("/settings/equipment");
}
