import { useState } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useStaffAuth } from "../auth/StaffAuth";
import { Button } from "@keyloop-interview/ui/components/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@keyloop-interview/ui/components/popover";
import keyloopLogo from "../assets/keyloop-logo.svg";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Package,
  Users,
  FileText,
  UserRound,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@keyloop-interview/ui/components/sidebar";
import "./admin-layout.css";

export function AdminLayout({
  activePage,
  children,
}: {
  activePage: "bookings" | "inventory" | "leads" | "documents";
  children: ReactNode;
}) {
  const { user, signOut } = useStaffAuth();
  const [signOutError, setSignOutError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const inventory = activePage === "inventory";
  const leads = activePage === "leads";
  const accountControls = user && (
    <div className="admin-account">
      <span>{user.name}</span>
      <span className="admin-account-role">
        {user.role === "admin" ? "Admin" : "Technician"}
      </span>
      <Button
        variant="outline"
        className="admin-sign-out"
        onClick={() => {
          setSignOutError("");
          void signOut().catch((error) => setSignOutError(error.message));
        }}
      >
        Sign out
      </Button>
      {signOutError && <p role="alert">{signOutError}</p>}
    </div>
  );
  return (
    <SidebarProvider className="admin-app">
      <Sidebar
        collapsible="none"
        className="admin-sidebar"
        role="complementary"
        aria-label="Dealership administration"
      >
        <div className="admin-sidebar-panel">
          <SidebarHeader className="admin-sidebar-header">
            <Link className="admin-brand" to="/admin/bookings">
              <img src={keyloopLogo} alt="Keyloop" width="140" height="36" />
            </Link>
            <p className="admin-product">Dealership administration</p>
          </SidebarHeader>
          <SidebarContent className="admin-sidebar-content">
            <nav aria-label="Admin navigation">
              <p className="admin-nav-label">Workspace</p>
              <SidebarMenu className="admin-nav">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activePage === "bookings"}
                  >
                    <Link
                      to="/admin/bookings"
                      aria-current={
                        activePage === "bookings" ? "page" : undefined
                      }
                    >
                      <CalendarDays aria-hidden="true" />
                      <span>Bookings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user?.role === "admin" && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={inventory}>
                        <Link
                          to="/admin/inventory"
                          aria-current={inventory ? "page" : undefined}
                        >
                          <Package aria-hidden="true" />
                          <span>Inventory</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={leads}>
                        <Link
                          to="/admin/leads"
                          aria-current={leads ? "page" : undefined}
                        >
                          <Users aria-hidden="true" />
                          <span>Sales Leads</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={activePage === "documents"}
                      >
                        <Link
                          to="/admin/documents"
                          aria-current={
                            activePage === "documents" ? "page" : undefined
                          }
                        >
                          <FileText aria-hidden="true" />
                          <span>Documents</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </nav>
          </SidebarContent>
          <SidebarFooter className="admin-sidebar-footer">
            {user && (
              <>
                <div className="admin-account-desktop">{accountControls}</div>
                <Popover open={accountOpen} onOpenChange={setAccountOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="admin-account-trigger"
                      aria-label={"Account menu for " + user.name}
                    >
                      <UserRound aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <AnimatePresence>
                    {accountOpen && (
                      <PopoverContent
                        key="staff-account"
                        forceMount
                        asChild
                        className="admin-account-menu"
                        align="end"
                        collisionPadding={12}
                        aria-label="Staff account"
                      >
                        <m.div
                          initial={
                            reduceMotion
                              ? false
                              : { opacity: 0, y: -6, scale: 0.98 }
                          }
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{
                            opacity: reduceMotion ? 1 : 0,
                            y: reduceMotion ? 0 : -4,
                            scale: reduceMotion ? 1 : 0.98,
                          }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.16,
                            ease: "easeOut",
                          }}
                          style={{
                            transformOrigin:
                              "var(--radix-popover-content-transform-origin)",
                            pointerEvents: accountOpen ? "auto" : "none",
                          }}
                        >
                          {accountControls}
                        </m.div>
                      </PopoverContent>
                    )}
                  </AnimatePresence>
                </Popover>
              </>
            )}
          </SidebarFooter>
        </div>
      </Sidebar>
      <main className="admin-main">{children}</main>
    </SidebarProvider>
  );
}
