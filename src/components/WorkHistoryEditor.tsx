import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

interface WorkHistoryEditorProps {
  workHistory: WorkExperience[];
  onChange: (workHistory: WorkExperience[]) => void;
}

export default function WorkHistoryEditor({ workHistory, onChange }: WorkHistoryEditorProps) {
  const addExperience = () => {
    const newExp: WorkExperience = {
      id: crypto.randomUUID(),
      company: "",
      title: "",
      startDate: "",
      endDate: "",
      description: "",
    };
    onChange([...workHistory, newExp]);
  };

  const removeExperience = (id: string) => {
    onChange(workHistory.filter(exp => exp.id !== id));
  };

  const updateExperience = (id: string, field: keyof WorkExperience, value: string) => {
    onChange(workHistory.map(exp => 
      exp.id === id ? { ...exp, [field]: value } : exp
    ));
  };

  return (
    <div className="space-y-4">
      {workHistory.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-white/20 rounded-lg">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No work experience added yet.</p>
          <p className="text-sm">Upload a resume to auto-fill, or add manually.</p>
        </div>
      ) : (
        workHistory.map((exp, index) => (
          <Card key={exp.id} className="p-4 bg-muted/30 border-white/10">
            <div className="flex items-start gap-3">
              <div className="text-muted-foreground mt-2">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Experience {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExperience(exp.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`company-${exp.id}`}>Company</Label>
                    <Input
                      id={`company-${exp.id}`}
                      value={exp.company}
                      onChange={(e) => updateExperience(exp.id, "company", e.target.value)}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`title-${exp.id}`}>Job Title</Label>
                    <Input
                      id={`title-${exp.id}`}
                      value={exp.title}
                      onChange={(e) => updateExperience(exp.id, "title", e.target.value)}
                      placeholder="Your role"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`start-${exp.id}`}>Start Date</Label>
                    <Input
                      id={`start-${exp.id}`}
                      value={exp.startDate}
                      onChange={(e) => updateExperience(exp.id, "startDate", e.target.value)}
                      placeholder="e.g., Jan 2020"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`end-${exp.id}`}>End Date</Label>
                    <Input
                      id={`end-${exp.id}`}
                      value={exp.endDate}
                      onChange={(e) => updateExperience(exp.id, "endDate", e.target.value)}
                      placeholder="e.g., Present"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`desc-${exp.id}`}>Description</Label>
                  <Textarea
                    id={`desc-${exp.id}`}
                    value={exp.description}
                    onChange={(e) => updateExperience(exp.id, "description", e.target.value)}
                    placeholder="Key responsibilities and achievements..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        onClick={addExperience}
        className="w-full border-dashed"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Work Experience
      </Button>
    </div>
  );
}
