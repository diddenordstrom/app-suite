import { Suspense, lazy } from "react";
import { APPS } from "@/shared/apps";
import { AppSection } from "./components/AppSection";
import { BlogBand, Footer } from "./components/Closing";
import { Foundation } from "./components/Foundation";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";

/** Loaded only on /fartlek: it brings Fartlek's own components and the demo data along. */
const FartlekPage = lazy(() => import("./components/fartlek/FartlekPage").then((m) => ({ default: m.FartlekPage })));

/** The portfolio is one page plus Fartlek's landing page; the server answers every path with index.html. */
export function App() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/fartlek") return <Suspense fallback={null}><FartlekPage /></Suspense>;
  return <Home />;
}

function Home() {
  return (
    <div className="min-h-dvh">
      <Header />
      <main>
        <Hero />
        {APPS.map((app, i) => <AppSection key={app.id} app={app} flip={i % 2 === 1} />)}
        <Foundation />
        <BlogBand />
      </main>
      <Footer />
    </div>
  );
}
