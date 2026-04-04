import * as React from "react";
import {
  Map,
  Settings2,
  SquareTerminal,
} from "lucide-react";

import logo from "@/assets/logo.png";
import { authClient } from "@/utils/auth-client";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// Navigation data
const data = {
  navMain: [
    {
      title: "Core Management",
      url: "#",
      icon: SquareTerminal,
      isActive: true,
      items: [
        { title: "Dashboard", url: "/" },
        { title: "Devices", url: "/devices" },
        { title: "Users", url: "/users" },
      ],
    },
    {
      title: "Tracking & Security",
      url: "#",
      icon: Map,
      isActive: true,
      items: [
        { title: "Geofences", url: "/geofences" },
        { title: "Alerts", url: "/alerts" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        { title: "General", url: "/settings" },
      ],
    },
  ],
  projects: [],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { useSession } = authClient;
  const { data: session } = useSession();

  const user = {
    name: session?.user?.name || "User",
    email: session?.user?.email || "",
    avatar: "",
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <img src={logo} alt="GNSS Tracker" className="size-6" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">GNSS Tracker</span>
                  <span className="truncate text-xs">
                    Management System
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
