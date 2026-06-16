import { Moon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/section";

/** Appearance (SCR-028). v1 is dark-only; the theme switch lands when light mode is themed. */
export default function AppearancePage() {
  return (
    <SettingsSection title="Appearance" description="How Agent CAD looks.">
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <Moon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-medium">Dark theme</div>
          <div className="text-xs text-muted-foreground">
            Agent CAD is dark-only for now. Light mode arrives once the palette is fully themed.
          </div>
        </div>
      </Card>
    </SettingsSection>
  );
}
