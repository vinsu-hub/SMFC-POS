import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SyncProvider } from "./contexts/SyncContext";

// Pages
import Login from "./pages/Login";
import Home from "./pages/Home";
import POSTerminal from "./pages/POSTerminal";
import ManagerDashboard from "./pages/ManagerDashboard";
import CommandCenter from "./pages/CommandCenter";
import TrendAnalysis from "./pages/TrendAnalysis";
import MalayaChat from "./pages/MalayaChat";
import HRFlags from "./pages/HRFlags";
import Newsfeed from "./pages/Newsfeed";
import InventoryCount from "./pages/InventoryCount";
import LossLog from "./pages/LossLog";
import Settings from "./pages/Settings";
import InventoryMovements from "./pages/InventoryMovements";
import UtilityLog from "./pages/UtilityLog";
import HRAttendance from "./pages/HRAttendance";
import HRPayroll from "./pages/HRPayroll";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/pos"} component={POSTerminal} />
      <Route path={"/dashboard"} component={ManagerDashboard} />
      <Route path={"/command-center"} component={CommandCenter} />
      <Route path={"/trends"} component={TrendAnalysis} />
      <Route path={"/malaya"} component={MalayaChat} />
      <Route path={"/hr-flags"} component={HRFlags} />
      <Route path={"/newsfeed"} component={Newsfeed} />
      <Route path={"/inventory-count"} component={InventoryCount} />
      <Route path={"/loss-log"} component={LossLog} />
      <Route path={"/inventory-movements"} component={InventoryMovements} />
      <Route path={"/utility-log"} component={UtilityLog} />
      <Route path={"/hr/attendance"} component={HRAttendance} />
      <Route path={"/hr/payroll"} component={HRPayroll} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <SyncProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
