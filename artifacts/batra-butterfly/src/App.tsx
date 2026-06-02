import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Retailers from "@/pages/retailers";
import RetailerDetail from "@/pages/retailer-detail";
import Analytics from "@/pages/analytics";
import Staff from "@/pages/staff";
import Stock from "@/pages/stock";
import StockUpload from "@/pages/stock-upload";
import StockSale from "@/pages/stock-sale";
import Invoices from "@/pages/invoices";
import InvoiceDetail from "@/pages/invoice-detail";
import Suppliers from "@/pages/suppliers";
import SupplierDetail from "@/pages/supplier-detail";
import PaymentClearance from "@/pages/payment-clearance";
import Account from "@/pages/account";
import { AuthProvider } from "@/contexts/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/retailers" component={Retailers} />
        <Route path="/retailers/:id" component={RetailerDetail} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/staff" component={Staff} />
        <Route path="/stock" component={Stock} />
        <Route path="/stock/upload" component={StockUpload} />
        <Route path="/stock/sale" component={StockSale} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/invoices/:id" component={InvoiceDetail} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/suppliers/:id" component={SupplierDetail} />
        <Route path="/payment-clearance" component={PaymentClearance} />
        <Route path="/account" component={Account} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
