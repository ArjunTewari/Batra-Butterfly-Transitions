import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Users, BarChart3, Briefcase, Package, Menu, X, FileText, Truck, CreditCard, Settings, } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth, LogoutButton } from "@/contexts/AuthContext";
const allLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, masterOnly: false },
    { href: "/retailers", label: "Retailers", icon: Users, masterOnly: false },
    { href: "/analytics", label: "Analytics", icon: BarChart3, masterOnly: false },
    { href: "/staff", label: "Staff", icon: Briefcase, masterOnly: false },
    { href: "/stock", label: "Stock", icon: Package, masterOnly: false },
    { href: "/invoices", label: "Invoices", icon: FileText, masterOnly: false },
    { href: "/suppliers", label: "Suppliers", icon: Truck, masterOnly: false },
    { href: "/payment-clearance", label: "Payment Clearance", icon: CreditCard, masterOnly: false },
    { href: "/account", label: "Account", icon: Settings, masterOnly: false },
];
export function Sidebar() {
    const [location] = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { isMaster, role } = useAuth();
    const sidebarLinks = allLinks.filter((l) => !l.masterOnly || isMaster);
    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [location]);
    // Sync sidebar width CSS variable for main content padding
    useEffect(() => {
        document.documentElement.style.setProperty("--sidebar-width", collapsed ? "72px" : "240px");
    }, [collapsed]);
    const SidebarContent = () => (<div className="flex flex-col h-full bg-black border-r border-white/10 text-white">
      <div className="flex items-center justify-between p-4 h-16 border-b border-white/10">
        <AnimatePresence mode="wait">
          {!collapsed && (<motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="font-bold text-lg tracking-tight overflow-hidden whitespace-nowrap">
              Batra Butterfly
            </motion.div>)}
        </AnimatePresence>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="hidden md:flex text-gray-400 hover:text-white">
          {collapsed ? <Menu className="h-5 w-5"/> : <X className="h-5 w-5"/>}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-400 hover:text-white">
          <X className="h-5 w-5"/>
        </Button>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {sidebarLinks.map((link) => {
            const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href}>
                <div className={cn("flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer group", isActive
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white", link.masterOnly && "border border-yellow-500/20")} data-testid={`link-sidebar-${link.label.toLowerCase().replace(/ /g, '-')}`}>
                  <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : link.masterOnly ? "text-yellow-400 group-hover:text-yellow-300" : "text-gray-400 group-hover:text-white")}/>
                  <AnimatePresence mode="wait">
                    {!collapsed && (<motion.span initial={{ opacity: 0, width: 0, marginLeft: 0 }} animate={{ opacity: 1, width: "auto", marginLeft: 12 }} exit={{ opacity: 0, width: 0, marginLeft: 0 }} className={cn("overflow-hidden whitespace-nowrap", link.masterOnly && "text-yellow-300")}>
                        {link.label}
                      </motion.span>)}
                  </AnimatePresence>
                </div>
              </Link>);
        })}
        </nav>
      </ScrollArea>

      {/* Role badge + logout */}
      <div className="border-t border-white/10 p-2">
        {!collapsed && (<div className="px-3 pb-1">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", isMaster ? "bg-yellow-500/15 text-yellow-400" : "bg-white/10 text-gray-400")}>
              {isMaster ? "⚡ Master" : "👤 Employee"}
            </span>
          </div>)}
        <LogoutButton />
      </div>
    </div>);
    return (<>
      {/* Mobile Trigger */}
      <div className="md:hidden fixed top-0 left-0 w-full h-16 bg-black border-b border-white/10 flex items-center px-4 z-40">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white">
          <Menu className="h-6 w-6"/>
        </Button>
        <span className="ml-4 font-bold text-lg text-white">Batra Butterfly</span>
      </div>

      {/* Desktop Sidebar */}
      <motion.aside initial={false} animate={{ width: collapsed ? 72 : 240 }} className="hidden md:block fixed inset-y-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out">
        <SidebarContent />
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (<>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobileOpen(false)}/>
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.3 }} className="fixed inset-y-0 left-0 z-50 w-64 md:hidden">
              <SidebarContent />
            </motion.aside>
          </>)}
      </AnimatePresence>
      
    </>);
}
