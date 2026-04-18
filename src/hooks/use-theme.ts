import { useEffect } from "react";

// Single editorial light mode — dark mode removed by design.
// Hook kept as a no-op so existing imports keep working.
type Theme = "light";

export function useTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    localStorage.setItem("theme", "light");
  }, []);

  const theme: Theme = "light";
  const setTheme = () => {};
  const toggleTheme = () => {};

  return { theme, setTheme, toggleTheme };
}
