import { Suspense } from "react";
import { GitBranch, LayoutGrid } from "lucide-react";
import { categories, demos } from "@/demos/registry";
import { Home } from "@/pages/Home";
import { go, useRoute } from "@/lib/router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function App() {
  const route = useRoute();
  const demo = demos.find((d) => d.path === route);
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" isActive={!demo} onClick={() => go("/")}>
                  <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><LayoutGrid className="size-4" /></span>
                  <span className="font-semibold">Demo gallery</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            {categories.map((c) => (
              <SidebarGroup key={c.name}>
                <SidebarGroupLabel>{c.name}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {demos.filter((d) => d.category === c.name).map((d) => (
                      <SidebarMenuItem key={d.path}>
                        <SidebarMenuButton size="lg" isActive={d.path === route} onClick={() => go(d.path)}>
                          <d.icon />
                          <span className="text-[15px]">{d.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="https://github.com/pluckey/demo-gallery" target="_blank" rel="noreferrer"><GitBranch /> Source on GitHub</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">{demo ? `${demo.category} / ${demo.title}` : "All demos"}</span>
          </header>
          {demo ? (
            <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
              <demo.component key={demo.path} />
            </Suspense>
          ) : <Home />}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
