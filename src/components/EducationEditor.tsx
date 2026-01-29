import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

interface EducationEditorProps {
  education: Education[];
  onChange: (education: Education[]) => void;
}

export default function EducationEditor({ education, onChange }: EducationEditorProps) {
  const addEducation = () => {
    const newEdu: Education = {
      id: crypto.randomUUID(),
      institution: "",
      degree: "",
      field: "",
      startDate: "",
      endDate: "",
    };
    onChange([...education, newEdu]);
  };

  const removeEducation = (id: string) => {
    onChange(education.filter(edu => edu.id !== id));
  };

  const updateEducation = (id: string, field: keyof Education, value: string) => {
    onChange(education.map(edu => 
      edu.id === id ? { ...edu, [field]: value } : edu
    ));
  };

  return (
    <div className="space-y-4">
      {education.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-white/20 rounded-lg">
          <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No education added yet.</p>
          <p className="text-sm">Upload a resume to auto-fill, or add manually.</p>
        </div>
      ) : (
        education.map((edu, index) => (
          <Card key={edu.id} className="p-4 bg-muted/30 border-white/10">
            <div className="flex items-start gap-3">
              <div className="text-muted-foreground mt-2">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Education {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEducation(edu.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`institution-${edu.id}`}>Institution</Label>
                  <Input
                    id={`institution-${edu.id}`}
                    value={edu.institution}
                    onChange={(e) => updateEducation(edu.id, "institution", e.target.value)}
                    placeholder="University or school name"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`degree-${edu.id}`}>Degree</Label>
                    <Input
                      id={`degree-${edu.id}`}
                      value={edu.degree}
                      onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                      placeholder="e.g., Bachelor's, Master's"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`field-${edu.id}`}>Field of Study</Label>
                    <Input
                      id={`field-${edu.id}`}
                      value={edu.field}
                      onChange={(e) => updateEducation(edu.id, "field", e.target.value)}
                      placeholder="e.g., Computer Science"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`edu-start-${edu.id}`}>Start Date</Label>
                    <Input
                      id={`edu-start-${edu.id}`}
                      value={edu.startDate}
                      onChange={(e) => updateEducation(edu.id, "startDate", e.target.value)}
                      placeholder="e.g., Sep 2016"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edu-end-${edu.id}`}>End Date</Label>
                    <Input
                      id={`edu-end-${edu.id}`}
                      value={edu.endDate}
                      onChange={(e) => updateEducation(edu.id, "endDate", e.target.value)}
                      placeholder="e.g., May 2020"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        onClick={addEducation}
        className="w-full border-dashed"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Education
      </Button>
    </div>
  );
}
