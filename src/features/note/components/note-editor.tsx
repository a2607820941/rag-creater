"use client";

import MDEditor from "@uiw/react-md-editor";
import * as commands from "@uiw/react-md-editor/commands";
import type { ICommand } from "@uiw/react-md-editor/commands";

type NoteEditorProps = {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
};

function withLabel(command: ICommand, label: string): ICommand {
  return {
    ...command,
    buttonProps: {
      ...command.buttonProps,
      "aria-label": label,
      title: label,
    },
  };
}

const titleCommands = [
  withLabel(commands.title1, "一级标题"),
  withLabel(commands.title2, "二级标题"),
  withLabel(commands.title3, "三级标题"),
  withLabel(commands.title4, "四级标题"),
  withLabel(commands.title5, "五级标题"),
  withLabel(commands.title6, "六级标题"),
];

const editorCommands: ICommand[] = [
  withLabel(commands.bold, "加粗 (Ctrl+B)"),
  withLabel(commands.italic, "斜体 (Ctrl+I)"),
  withLabel(commands.strikethrough, "删除线"),
  withLabel(commands.hr, "分割线"),
  commands.group(titleCommands, {
    name: "title",
    groupName: "title",
    buttonProps: {
      "aria-label": "插入标题",
      title: "插入标题",
    },
  }),
  commands.divider,
  withLabel(commands.link, "链接"),
  withLabel(commands.quote, "引用"),
  withLabel(commands.code, "行内代码"),
  withLabel(commands.codeBlock, "代码块"),
  withLabel(commands.comment, "注释"),
  withLabel(commands.image, "图片"),
  withLabel(commands.table, "表格"),
  commands.divider,
  withLabel(commands.unorderedListCommand, "无序列表"),
  withLabel(commands.orderedListCommand, "有序列表"),
  withLabel(commands.checkedListCommand, "任务列表"),
  commands.divider,
  withLabel(commands.help, "帮助"),
];

const extraCommands: ICommand[] = [
  withLabel(commands.codeEdit, "仅编辑 (Ctrl+7)"),
  withLabel(commands.codeLive, "编辑和预览 (Ctrl+8)"),
  withLabel(commands.codePreview, "仅预览 (Ctrl+9)"),
  commands.divider,
  withLabel(commands.fullscreen, "全屏"),
];

export function NoteEditor({ value, saving, onChange }: NoteEditorProps) {
  return (
    <div
      className="note-markdown-editor h-[calc(100vh-10rem)] min-h-[560px]"
      data-color-mode="light"
    >
      <MDEditor
        commands={editorCommands}
        extraCommands={extraCommands}
        height="100%"
        onChange={(nextValue) => onChange(nextValue ?? "")}
        preview="live"
        textareaProps={{
          disabled: saving,
          placeholder: "开始编写 Markdown 知识笔记...",
        }}
        value={value}
      />
    </div>
  );
}
