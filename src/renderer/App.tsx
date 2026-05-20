import { ThemeProvider } from "next-themes";
import { TitleBar } from "@/components/layout/title-bar";

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TitleBar />
    </ThemeProvider>
  );
}
