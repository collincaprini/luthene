import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <h1 className="text-lg font-semibold">Luthene</h1>
        <ModeToggle />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup />
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter>
        <p className="text-sm text-muted-foreground">
          © 2026 Two Daimons Software
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}