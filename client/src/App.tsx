import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import TaskBank from "./pages/TaskBank";
import TaskDetail from "./pages/TaskDetail";
import Workspace from "./pages/Workspace";
import TutorWorkspace from "./pages/TutorWorkspace";
import AdminTasks from "./pages/AdminTasks";
import AdminTaskControl from "./pages/AdminTaskControl";
import AdminTheory from "./pages/AdminTheory";
import TheoryVersionCompare from "./pages/TheoryVersionCompare";
import AdminPromos from "./pages/AdminPromos";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/bank"} component={TaskBank} />
      <Route path={"/bank/:slug"} component={TaskDetail} />
      <Route path={"/theory"}>{() => <Redirect to="/bank" />}</Route>
      <Route path={"/workspace"} component={Workspace} />
      <Route path={"/practice"}>{() => <Redirect to="/bank" />}</Route>
      <Route path={"/tutor"} component={TutorWorkspace} />
      <Route path={"/admin/tasks"} component={AdminTasks} />
      <Route path={"/admin/tasks/control"} component={AdminTaskControl} />
      <Route path={"/admin/theory"} component={AdminTheory} />
      <Route path={"/admin/theory/compare/:theoryUnitId/:version"} component={TheoryVersionCompare} />
      <Route path={"/admin/promos"} component={AdminPromos} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
