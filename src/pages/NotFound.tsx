import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[hsl(var(--primary)/0.95)] text-primary-foreground relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
      <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-white/5" />

      <div className="relative z-10 text-center space-y-6">
        <div className="flex items-center justify-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold">CareerPrep.ai</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold">This is not the page you were looking for (404)</h1>
        <p className="text-primary-foreground/70 text-lg max-w-md mx-auto">
          The page you are looking for doesn't exist or has been moved.{" "}
        </p>
        <Button
          variant="link"
          className="text-primary-foreground/90 hover:text-primary-foreground font-semibold gap-2"
          onClick={() => navigate("/home")}
        >
          <ArrowLeft className="w-4 h-4" />
          Go back home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
