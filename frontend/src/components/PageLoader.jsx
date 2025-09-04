import { LoaderCircle } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const PageLoader = () => {
  const { theme } = useThemeStore();
  return (
    <div
      className="flex items-center justify-center min-h-screen "
      data-theme={theme}
    >
      <LoaderCircle className="animate-spin size-10" />
    </div>
  );
};

export default PageLoader;
