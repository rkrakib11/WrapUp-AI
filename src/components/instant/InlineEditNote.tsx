import { useEffect, useRef, useState } from "react";
import { ArrowRightCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Inline-editable note row used by both the Meeting Detail Notes tab and
 * the InstantMeetingPage Notes tab. Lifted out of MeetingDetailPage so
 * both pages share the exact same UX.
 *
 * Behaviour:
 * - Click the body to enter edit mode.
 * - Enter saves; Shift+Enter inserts a newline; Escape cancels.
 * - The 3 hover-revealed icons in the corner: convert to action item,
 *   pencil-to-edit (alternative to clicking the body), and delete.
 */
export function InlineEditNote({
  note,
  onSave,
  onDelete,
  onConvertToAction,
}: {
  note: { id: string; content: string; updated_at: string };
  onSave: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onConvertToAction: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed !== note.content) {
      onSave(note.id, trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="glass rounded-lg p-3 space-y-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") {
              setValue(note.content);
              setEditing(false);
            }
          }}
          className="min-h-[60px] text-sm"
        />
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(note.content);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-4 group relative">
      <p className="text-sm cursor-pointer whitespace-pre-wrap" onClick={() => setEditing(true)}>
        {note.content}
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        {new Date(note.updated_at).toLocaleString()}
      </p>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onConvertToAction(note.content)} title="Convert to action item">
          <ArrowRightCircle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </button>
        <button onClick={() => setEditing(true)} title="Edit">
          <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </button>
        <button
          onClick={() => {
            onDelete(note.id);
            toast.success("Note deleted");
          }}
          title="Delete"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
        </button>
      </div>
    </div>
  );
}
