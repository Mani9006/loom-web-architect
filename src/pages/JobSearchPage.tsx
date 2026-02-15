import { useState } from "react";
import { JobSearchPanel } from "@/components/chat/JobSearchPanel";

export default function JobSearchPage() {
  const [selectedModel, setSelectedModel] = useState("gemini-flash");

  return (
    <div className="h-[calc(100vh-68px)] flex flex-col">
      <JobSearchPanel selectedModel={selectedModel} onModelChange={setSelectedModel} />
    </div>
  );
}
