"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteNoteDialogProps = {
  open: boolean;
  deleting: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteNoteDialog({
  open,
  deleting,
  title,
  onOpenChange,
  onConfirm,
}: DeleteNoteDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除文档？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后无法恢复。当前文档：{title || "未命名文档"}。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            variant="destructive"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
