import { Link, useNavigate, useServerFn } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquarePlus,
  Pencil,
  Trash2,
  LogOut,
  PanelLeftCloseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { deleteThread, listThreads, renameThread } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/astra-logo.png";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  email: string | null;
}

export function AppSidebar({ collapsed, onToggle, email }: AppSidebarProps) {
  if (collapsed) return null;
  return <SidebarContent onToggle={onToggle} email={email} />;
}

function SidebarContent({ onToggle, email }: Omit<AppSidebarProps, "collapsed">) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(
    null
  );

  const threadsQuery = useQuery({ queryKey: ["threads"], queryFn: () => listThreads() });
  const renameFn = useServerFn(renameThread);
  const deleteFn = useServerFn(deleteThread);

  const renameMutation = useMutation({
    mutationFn: (input: { threadId: string; title: string }) => renameFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setRenameTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { threadId: string }) => deleteFn({ data: input }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["messages", input.threadId] });
      setDeleteTarget(null);
      if (window.location.pathname === `/app/${input.threadId}`) {
        navigate({ to: "/app", replace: true });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/app" className="flex items-center gap-2">
          <img src={logoUrl} alt="Astra" className="size-8" width={32} height={32} />
          <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">
            Astra
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label="Collapse sidebar"
        >
          <PanelLeftCloseIcon className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button
          className="w-full justify-start gap-2"
          variant="default"
          onClick={() => navigate({ to: "/app" })}
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Chat threads">
        {threadsQuery.data?.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No chats yet. Start one above.
          </p>
        )}
        <ul className="space-y-0.5">
          {threadsQuery.data?.map((thread) => (
            <li key={thread.id} className="group/thread relative">
              <Link
                to="/app/$threadId"
                params={{ threadId: thread.id }}
                activeProps={{
                  className:
                    "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                }}
                className="block truncate rounded-md px-3 py-2 pr-14 text-sm text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {thread.title}
              </Link>
              <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/thread:flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${thread.title}`}
                  onClick={() => setRenameTarget(thread)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${thread.title}`}
                  onClick={() => setDeleteTarget(thread)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
        <span className="truncate text-xs text-muted-foreground" title={email ?? ""}>
          {email}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.assign("/");
          }}
        >
          <LogOut className="size-4" />
        </Button>
      </div>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.title ?? ""}
            onChange={(e) =>
              setRenameTarget((t) => (t ? { ...t, title: e.target.value } : t))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameTarget?.title.trim()) {
                renameMutation.mutate({
                  threadId: renameTarget.id,
                  title: renameTarget.title.trim(),
                });
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameTarget?.title.trim() || renameMutation.isPending}
              onClick={() =>
                renameTarget &&
                renameMutation.mutate({
                  threadId: renameTarget.id,
                  title: renameTarget.title.trim(),
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” and all of its messages will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ threadId: deleteTarget.id })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
