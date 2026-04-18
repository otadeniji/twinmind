import { Download, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

export function TopBar({ onOpenSettings, onExport, hasKey }) {
  return (
    <header className="border-b border-neutral-200 bg-white" data-testid="top-bar">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-900 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="heading text-[1.05rem] tracking-tight text-neutral-900">TwinMind</h1>
            <span className="text-xs text-neutral-500">live meeting copilot</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasKey && (
            <span
              data-testid="no-key-banner"
              className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900 md:inline-flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Add your Groq API key to start
            </span>
          )}
          <Button
            data-testid="export-btn"
            variant="ghost"
            size="sm"
            onClick={onExport}
            className="gap-1.5 text-neutral-700"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button
            data-testid="settings-btn"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="gap-1.5"
          >
            <SettingsIcon className="h-4 w-4" /> Settings
          </Button>
        </div>
      </div>
    </header>
  );
}
