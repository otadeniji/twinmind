import { useEffect, useState } from "react";
import { ExternalLink, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Separator } from "./ui/separator";
import { defaultSettings } from "../lib/prompts";

export function SettingsDialog({ open, onOpenChange, apiKey, settings, onSave }) {
  const [localKey, setLocalKey] = useState(apiKey);
  const [local, setLocal] = useState(settings);
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalKey(apiKey);
      setLocal(settings);
      setRevealKey(false);
    }
  }, [open, apiKey, settings]);

  const resetPrompts = () => setLocal(defaultSettings());

  const save = () => {
    onSave({ apiKey: localKey.trim(), settings: local });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle className="heading">Settings</DialogTitle>
          <DialogDescription>
            Your Groq API key is stored only in this browser and sent per request. Prompts and
            context windows are editable — defaults are the ones we found most useful.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="api" data-testid="tab-api">API key</TabsTrigger>
            <TabsTrigger value="prompts" data-testid="tab-prompts">Prompts</TabsTrigger>
            <TabsTrigger value="context" data-testid="tab-context">Context & timing</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="groq-key">Groq API key</Label>
              <div className="flex gap-2">
                <Input
                  id="groq-key"
                  data-testid="groq-key-input"
                  type={revealKey ? "text" : "password"}
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="gsk_…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  data-testid="toggle-key-visibility-btn"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setRevealKey((v) => !v)}
                >
                  {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                Stored in <span className="mono">localStorage</span>. Never logged, never sent anywhere
                except to the Groq API via this app's backend.
              </p>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
              >
                Get a free Groq API key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <Separator />
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
              <div><span className="mono font-medium">Transcription:</span> whisper-large-v3</div>
              <div><span className="mono font-medium">Suggestions + chat:</span> openai/gpt-oss-120b</div>
            </div>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                Edit any of these. Reset returns to the tuned defaults.
              </p>
              <Button
                data-testid="reset-prompts-btn"
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetPrompts}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sugg-prompt">Live-suggestions system prompt</Label>
              <Textarea
                id="sugg-prompt"
                data-testid="sugg-prompt-textarea"
                value={local.suggestionPrompt}
                onChange={(e) => setLocal({ ...local, suggestionPrompt: e.target.value })}
                className="min-h-[160px] font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expand-prompt">On-click expanded-answer prompt</Label>
              <Textarea
                id="expand-prompt"
                data-testid="expand-prompt-textarea"
                value={local.expandPrompt}
                onChange={(e) => setLocal({ ...local, expandPrompt: e.target.value })}
                className="min-h-[140px] font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chat-prompt">Chat system prompt</Label>
              <Textarea
                id="chat-prompt"
                data-testid="chat-prompt-textarea"
                value={local.chatPrompt}
                onChange={(e) => setLocal({ ...local, chatPrompt: e.target.value })}
                className="min-h-[120px] font-mono text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="context" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ctx-live">Context window — live suggestions (chars)</Label>
                <Input
                  id="ctx-live"
                  data-testid="ctx-live-input"
                  type="number"
                  min={500}
                  max={40000}
                  value={local.contextLive}
                  onChange={(e) => setLocal({ ...local, contextLive: Number(e.target.value) || 0 })}
                />
                <p className="text-[11px] text-neutral-500">
                  How much of the trailing transcript we feed to the suggestions model each refresh.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctx-expand">Context window — expanded answers (chars)</Label>
                <Input
                  id="ctx-expand"
                  data-testid="ctx-expand-input"
                  type="number"
                  min={500}
                  max={80000}
                  value={local.contextExpand}
                  onChange={(e) => setLocal({ ...local, contextExpand: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctx-chat">Context window — chat (chars)</Label>
                <Input
                  id="ctx-chat"
                  data-testid="ctx-chat-input"
                  type="number"
                  min={500}
                  max={80000}
                  value={local.contextChat}
                  onChange={(e) => setLocal({ ...local, contextChat: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refresh-sec">Auto-refresh interval (seconds)</Label>
                <Input
                  id="refresh-sec"
                  data-testid="refresh-sec-input"
                  type="number"
                  min={10}
                  max={300}
                  value={local.refreshSeconds}
                  onChange={(e) => setLocal({ ...local, refreshSeconds: Number(e.target.value) || 30 })}
                />
                <p className="text-[11px] text-neutral-500">
                  How often live suggestions refresh automatically.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button
            data-testid="settings-cancel-btn"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            data-testid="settings-save-btn"
            onClick={save}
            className="bg-neutral-900 text-white hover:bg-neutral-800"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
