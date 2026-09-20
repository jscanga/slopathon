import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  courseCode: string;
  existingLocation: string; // e.g. "Fall 2026"
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DuplicateCourseModal({
  courseCode,
  existingLocation,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="w-[min(420px,92vw)] max-w-none">
        <DialogHeader>
          <DialogTitle>Already in your plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-foreground">
            <span className="font-code text-primary">{courseCode}</span> is already
            placed in <strong>{existingLocation}</strong>. Add it again anyway?
          </p>
          <p className="text-[0.8rem] italic text-muted-foreground">
            Duplicate courses usually don't count twice toward a requirement.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Add anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
