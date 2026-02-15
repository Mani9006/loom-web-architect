import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { JobSearchPanel } from "@/components/chat/JobSearchPanel";

export default function JobSearchPage() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState("gemini-flash");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
    });
  }, [navigate]);

  return (
    <div className="h-[calc(100vh-68px)] flex flex-col">
      <JobSearchPanel selectedModel={selectedModel} onModelChange={setSelectedModel} />
    </div>
  );
}
