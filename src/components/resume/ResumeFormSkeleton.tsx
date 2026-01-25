import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, GraduationCap, Award, Wrench } from "lucide-react";

interface ResumeFormSkeletonProps {
  sections?: ('personal' | 'experience' | 'education' | 'skills' | 'certifications')[];
}

export function ResumeFormSkeleton({ sections = ['personal', 'experience', 'education', 'skills', 'certifications'] }: ResumeFormSkeletonProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      {sections.includes('personal') && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="py-3 bg-primary/5">
            <CardTitle className="text-sm flex items-center gap-2">
              👤 Personal Information
              <span className="ml-auto text-xs text-primary animate-pulse">Extracting...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes('experience') && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="py-3 bg-primary/5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Experience
              <span className="ml-auto text-xs text-primary animate-pulse">Extracting...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sections.includes('education') && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="py-3 bg-primary/5">
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> Education
              <span className="ml-auto text-xs text-primary animate-pulse">Extracting...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes('skills') && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="py-3 bg-primary/5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Skills
              <span className="ml-auto text-xs text-primary animate-pulse">Extracting...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex flex-wrap gap-2">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton key={j} className="h-6 w-16 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sections.includes('certifications') && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="py-3 bg-primary/5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4" /> Certifications
              <span className="ml-auto text-xs text-primary animate-pulse">Extracting...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
