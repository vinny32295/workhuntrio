import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

interface SkillsEditorProps {
  skills: string[];
  onChange: (skills: string[]) => void;
}

export default function SkillsEditor({ skills, onChange }: SkillsEditorProps) {
  const [newSkill, setNewSkill] = useState("");

  const handleAddSkill = () => {
    const skill = newSkill.trim();
    if (skill && !skills.includes(skill)) {
      onChange([...skills, skill]);
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    onChange(skills.filter(s => s !== skillToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSkill();
    }
  };

  return (
    <div className="space-y-4">
      {/* Add new skill input */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a skill..."
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAddSkill}
          disabled={!newSkill.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Skills list */}
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="px-3 py-1.5 text-sm flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 border-primary/20"
            >
              {skill}
              <button
                onClick={() => handleRemoveSkill(skill)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          No skills added yet. Upload a resume to auto-extract skills or add them manually.
        </p>
      )}
    </div>
  );
}
