import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface Props {
  courseCount: number;
  creditCount: number;
  /** Number of labeled rows ("Other") that will also be removed. */
  labeledRowCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmClearModal({
  courseCount,
  creditCount,
  labeledRowCount,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="w-[min(440px,92vw)] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-[1.05rem] w-[1.05rem] text-destructive" />
            Clear your whole plan?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-foreground">
            This removes all{" "}
            <strong>
              {courseCount} course{courseCount === 1 ? "" : "s"}
            </strong>{" "}
            ({creditCount} credits) from every term
            {labeledRowCount > 0 && (
              <>
                , including the imported{" "}
                <strong>
                  {labeledRowCount === 1 ? '"Other" row' : "labeled rows"}
                </strong>
              </>
            )}
            . The term grid itself stays as it is.
          </p>
          <p className="text-[0.8rem] italic text-muted-foreground">
            You can undo this straight afterwards.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Clear everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
