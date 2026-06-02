import { Sidebar } from "./sidebar";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
export function Layout({ children }) {
    const [location] = useLocation();
    return (<div className="min-h-[100dvh] bg-black text-white selection:bg-white selection:text-black">
      <Sidebar />
      <main className="md:pl-[var(--sidebar-width,240px)] transition-all duration-300 ease-in-out">
        {/* This div handles the dynamic padding from the sidebar component */}
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen pt-20 md:pt-8">
          <motion.div key={location} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
            {children}
          </motion.div>
        </div>
      </main>
    </div>);
}
