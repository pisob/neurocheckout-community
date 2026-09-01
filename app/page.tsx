import Dashboard from "@/components/Dashboard";
import { UiLanguageProvider } from "@/lib/ui-language";

export default function HomePage() {
  return <UiLanguageProvider><Dashboard /></UiLanguageProvider>;
}
