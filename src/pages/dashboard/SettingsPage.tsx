import { Settings, Palette, RotateCcw } from "lucide-react";
import { usePalette, presets, defaultPaletteColors, type CustomColors } from "@/components/providers/PaletteProvider";
import { useState } from "react";

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="relative w-10 h-10 rounded-lg border border-border overflow-hidden cursor-pointer shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
        />
        <div className="w-full h-full" style={{ backgroundColor: value }} />
      </label>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground font-mono uppercase">{value}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { colors, setColors } = usePalette();
  const [draft, setDraft] = useState<CustomColors>(colors);

  const updateDraft = (key: keyof CustomColors, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setColors(next);
  };

  const applyPreset = (preset: CustomColors) => {
    setDraft(preset);
    setColors(preset);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Card Palette Section */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Card Palette</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Customize the colors for your dashboard cards. Pick a preset or choose your own.
        </p>

        {/* Preset quick picks */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Presets</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p.colors)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 transition-colors text-xs font-medium text-foreground"
              >
                <div className="flex -space-x-1">
                  <div className="w-4 h-4 rounded-full border border-background" style={{ backgroundColor: p.colors.cardBg }} />
                  <div className="w-4 h-4 rounded-full border border-background" style={{ backgroundColor: p.colors.cardBorder }} />
                </div>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom color pickers */}
        <div className="grid sm:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4 rounded-xl border border-border bg-secondary p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Card Colors</p>
            <ColorField label="Background" value={draft.cardBg} onChange={(v) => updateDraft("cardBg", v)} />
            <ColorField label="Hover Background" value={draft.cardHoverBg} onChange={(v) => updateDraft("cardHoverBg", v)} />
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-secondary p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Accent Colors</p>
            <ColorField label="Border" value={draft.cardBorder} onChange={(v) => updateDraft("cardBorder", v)} />
            <ColorField label="Glow / Shadow" value={draft.cardGlow} onChange={(v) => updateDraft("cardGlow", v)} />
          </div>
        </div>

        {/* Live preview */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Preview</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {["Card Preview 1", "Card Preview 2", "Card Preview 3"].map((label) => (
              <div
                key={label}
                className="rounded-xl p-5 transition-all duration-300 cursor-default group"
                style={{
                  backgroundColor: draft.cardBg,
                  border: `1px solid ${draft.cardBorder}33`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = draft.cardHoverBg;
                  e.currentTarget.style.boxShadow = `0 0 30px -8px ${draft.cardGlow}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = draft.cardBg;
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <p className="text-xs text-muted-foreground mb-2">{label}</p>
                <p className="text-2xl font-bold text-foreground">42</p>
              </div>
            ))}
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={() => applyPreset(defaultPaletteColors)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </button>
      </div>

      {/* Other settings placeholder */}
      <div className="rounded-xl border border-border bg-secondary p-12 text-center">
        <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">More Settings</h2>
        <p className="text-sm text-muted-foreground">
          Account preferences, notifications, and integrations will be configurable here.
        </p>
      </div>
    </div>
  );
}
