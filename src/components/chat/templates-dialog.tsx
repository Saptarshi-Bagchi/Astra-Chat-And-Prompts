import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-router";
import { BookMarkedIcon, PlusIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
} from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface TemplatesDialogProps {
  onSelect: (body: string) => void;
  trigger?: React.ReactNode;
}

export function TemplatesDialog({ onSelect, trigger }: TemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => listTemplates(),
    enabled: open,
  });
  const saveFn = useServerFn(saveTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (input: { title: string; body: string }) => saveFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setTitle("");
      setBody("");
      setAdding(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-1.5">
            <BookMarkedIcon className="size-4" />
            Templates
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prompt templates</DialogTitle>
        </DialogHeader>

        {!adding ? (
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-4" />
            New template
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-title">Title</Label>
              <Input
                id="tpl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekly planning"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Prompt</Label>
              <Textarea
                id="tpl-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the reusable prompt text…"
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!title.trim() || !body.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate({ title: title.trim(), body })}
              >
                Save template
              </Button>
            </DialogFooter>
          </div>
        )}

        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {templatesQuery.data?.map((tpl) => (
            <div
              key={tpl.id}
              className="group flex items-start justify-between gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onSelect(tpl.body);
                  setOpen(false);
                }}
              >
                <span className="block truncate text-sm font-medium text-foreground">
                  {tpl.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {tpl.body}
                </span>
              </button>
              {tpl.user_id !== null && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Delete ${tpl.title}`}
                  onClick={() => deleteMutation.mutate(tpl.id)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {templatesQuery.data?.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No templates yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
