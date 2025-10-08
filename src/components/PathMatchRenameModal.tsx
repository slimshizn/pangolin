import { Pencil } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@app/components/ui/dialog";
import { Badge } from "@app/components/ui/badge";
import { Label } from "@app/components/ui/label";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";


export function PathMatchModal({
  value,
  onChange,
  trigger,
}: {
  value: { path: string | null; pathMatchType: string | null };
  onChange: (config: { path: string | null; pathMatchType: string | null }) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [matchType, setMatchType] = useState(value?.pathMatchType || "prefix");
  const [path, setPath] = useState(value?.path || "");

  useEffect(() => {
    if (open) {
      setMatchType(value?.pathMatchType || "prefix");
      setPath(value?.path || "");
    }
  }, [open, value]);

  const handleSave = () => {
    onChange({ pathMatchType: matchType as any, path: path.trim() });
    setOpen(false);
  };

  const handleClear = () => {
    onChange({ pathMatchType: null, path: null });
    setOpen(false);
  };

  const getPlaceholder = () => (matchType === "regex" ? "^/api/.*" : "/path");

  const getHelpText = () => {
    switch (matchType) {
      case "prefix":
        return "Example: /api matches /api, /api/users, etc.";
      case "exact":
        return "Example: /api matches only /api";
      case "regex":
        return "Example: ^/api/.* matches /api/anything";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure Path Matching</DialogTitle>
          <DialogDescription>
            Set up how incoming requests should be matched based on their path.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="match-type">Match Type</Label>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger id="match-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prefix">Prefix</SelectItem>
                <SelectItem value="exact">Exact</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="path-value">Path Value</Label>
            <Input
              id="path-value"
              placeholder={getPlaceholder()}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">{getHelpText()}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {value?.path && (
            <Button variant="outline" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button onClick={handleSave} disabled={!path.trim()}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function PathRewriteModal({
  value,
  onChange,
  trigger,
  disabled,
}: {
  value: { rewritePath: string | null; rewritePathType: string | null };
  onChange: (config: { rewritePath: string | null; rewritePathType: string | null }) => void;
  trigger: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rewriteType, setRewriteType] = useState(value?.rewritePathType || "prefix");
  const [rewritePath, setRewritePath] = useState(value?.rewritePath || "");

  useEffect(() => {
    if (open) {
      setRewriteType(value?.rewritePathType || "prefix");
      setRewritePath(value?.rewritePath || "");
    }
  }, [open, value]);

  const handleSave = () => {
    onChange({ rewritePathType: rewriteType as any, rewritePath: rewritePath.trim() });
    setOpen(false);
  };

  const handleClear = () => {
    onChange({ rewritePathType: null, rewritePath: null });
    setOpen(false);
  };

  const getPlaceholder = () => {
    switch (rewriteType) {
      case "regex":
        return "/new/$1";
      case "stripPrefix":
        return "";
      default:
        return "/new-path";
    }
  };

  const getHelpText = () => {
    switch (rewriteType) {
      case "prefix":
        return "Replace the matched prefix with this value";
      case "exact":
        return "Replace the entire path with this value";
      case "regex":
        return "Use capture groups like $1, $2 for replacement";
      case "stripPrefix":
        return "Leave empty to strip prefix or provide new prefix";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure Path Rewriting</DialogTitle>
          <DialogDescription>
            Transform the matched path before forwarding to the target.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="rewrite-type">Rewrite Type</Label>
            <Select value={rewriteType} onValueChange={setRewriteType}>
              <SelectTrigger id="rewrite-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prefix">Prefix - Replace prefix</SelectItem>
                <SelectItem value="exact">Exact - Replace entire path</SelectItem>
                <SelectItem value="regex">Regex - Pattern replacement</SelectItem>
                <SelectItem value="stripPrefix">Strip Prefix - Remove prefix</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rewrite-value">Rewrite Value</Label>
            <Input
              id="rewrite-value"
              placeholder={getPlaceholder()}
              value={rewritePath}
              onChange={(e) => setRewritePath(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">{getHelpText()}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {value?.rewritePath && (
            <Button variant="outline" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={rewriteType !== "stripPrefix" && !rewritePath.trim()}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PathMatchDisplay({
  value,
}: {
  value: { path: string | null; pathMatchType: string | null };
}) {
  if (!value?.path) return null;

  const getTypeLabel = (type: string | null) => {
    const labels: Record<string, string> = {
      prefix: "Prefix",
      exact: "Exact",
      regex: "Regex",
    };
    return labels[type || ""] || type;
  };

  return (
    <div className="flex items-center gap-2 w-full text-left">
      <Badge variant="secondary" className="font-mono text-xs shrink-0">
        {getTypeLabel(value.pathMatchType)}
      </Badge>
      <code className="text-sm flex-1 truncate" title={value.path}>
        {value.path}
      </code>
      <Pencil className="h-3 w-3 shrink-0 opacity-70" />
    </div>
  );
}


export function PathRewriteDisplay({
  value,
}: {
  value: { rewritePath: string | null; rewritePathType: string | null };
}) {
  if (!value?.rewritePath && value?.rewritePathType !== "stripPrefix") return null;

  const getTypeLabel = (type: string | null) => {
    const labels: Record<string, string> = {
      prefix: "Prefix",
      exact: "Exact",
      regex: "Regex",
      stripPrefix: "Strip",
    };
    return labels[type || ""] || type;
  };

  return (
    <div className="flex items-center gap-2 w-full text-left">
      <Badge variant="secondary" className="font-mono text-xs shrink-0">
        {getTypeLabel(value.rewritePathType)}
      </Badge>
      <code className="text-sm flex-1 truncate" title={value.rewritePath || ""}>
        {value.rewritePath || <span className="text-muted-foreground italic">(strip)</span>}
      </code>
      <Pencil className="h-3 w-3 shrink-0 opacity-70" />
    </div>
  );
}
