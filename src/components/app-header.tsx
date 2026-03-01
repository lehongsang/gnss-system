import { PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function AppHeader({ title }: { title: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="flex h-12 items-center gap-1 border-b bg-background px-2">
      <button
        onClick={toggleSidebar}
        className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <PanelLeft className="h-5 w-5" />
        <span className="sr-only">Toggle Sidebar</span>
      </button>
      <span className="text-sm font-semibold tracking-tight leading-none ml-1">
        {title}
      </span>
    </header>
  );
}
