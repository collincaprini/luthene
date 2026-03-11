'use client';

import * as React from 'react';

import { defineBasicExtension } from 'prosekit/basic';
import {
  type Editor,
  createEditor,
  defineNodeSpec,
  definePasteHandler,
  defineUpdateHandler,
  insertNode,
  union,
} from 'prosekit/core';
import { ProseKit, useEditorDerivedValue } from 'prosekit/react';
import {
  TableHandleColumnRoot,
  TableHandleColumnTrigger,
  TableHandleDragPreview,
  TableHandleDropIndicator,
  TableHandlePopoverContent,
  TableHandlePopoverItem,
  TableHandleRoot,
  TableHandleRowRoot,
  TableHandleRowTrigger,
} from 'prosekit/react/table-handle';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ListBulletsIcon, TextBolderIcon, TextItalicIcon, ListNumbersIcon, TableIcon, YoutubeLogoIcon } from '@phosphor-icons/react';

export type ProsekitMarkdownEditorProps = {
  initialMarkdown: string;
  onChange?: (markdown: string) => void;
  heightClassName?: string;
  className?: string;
};

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:[&?].*)?$/,
  /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?].*)?$/,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[?].*)?$/,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?].*)?$/,
];

function getYoutubeEmbedUrl(input: string): string | null {
  const value = input.trim();
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }
  return null;
}

function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, breaks: true, gfm: true }) as string;
}

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx' });
  turndown.use(gfm);
  turndown.addRule('youtube-iframe', {
    filter: (node) => node.nodeName === 'IFRAME' && (node as HTMLIFrameElement).dataset.youtube === 'true',
    replacement: (_content, node) => {
      const iframe = node as HTMLIFrameElement;
      const src = iframe.getAttribute('src') ?? '';
      return src ? `\n\n${src}\n\n` : '\n\n';
    },
  });
  return turndown.turndown(html);
}

type CommandFn = ((...args: never[]) => void) & {
  canExec?: () => boolean;
};

function getTableHandleState(editor: Editor) {
  const commands = editor.commands as Record<string, CommandFn>;

  const getAction = (commandName: string) => {
    const command = commands[commandName];
    return {
      canExec: typeof command?.canExec === 'function' ? Boolean(command.canExec()) : false,
      command: () => {
        if (typeof command !== 'function') return;
        command();
        editor.focus();
      },
    };
  };

  return {
    addTableColumnBefore: getAction('addTableColumnBefore'),
    addTableColumnAfter: getAction('addTableColumnAfter'),
    deleteCellSelection: getAction('deleteCellSelection'),
    deleteTableColumn: getAction('deleteTableColumn'),
    addTableRowAbove: getAction('addTableRowAbove'),
    addTableRowBelow: getAction('addTableRowBelow'),
    deleteTableRow: getAction('deleteTableRow'),
    deleteTable: getAction('deleteTable'),
  };
}

function TableHandle() {
  const state = useEditorDerivedValue(getTableHandleState);
  const menuItemClass =
    'relative min-w-32 scroll-my-1 rounded-sm px-3 py-1.5 flex items-center justify-between gap-8 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 hover:data-[disabled=true]:opacity-50 data-danger:text-red-500 box-border cursor-default select-none whitespace-nowrap outline-hidden data-focused:bg-muted';

  return (
    <TableHandleRoot className="contents">
      <TableHandleDragPreview />
      <TableHandleDropIndicator />
      <TableHandleColumnRoot className="h-[1.2em] w-[1.5em] translate-y-[80%] flex items-center box-border justify-center rounded-sm border border-border bg-background p-0 text-muted-foreground/60 transition data-[state=closed]:scale-95 data-[state=closed]:opacity-0 hover:bg-muted">
        <TableHandleColumnTrigger className="flex items-center justify-center px-1 text-base leading-none">
          ⋯
        </TableHandleColumnTrigger>
        <TableHandlePopoverContent className="relative z-10 block max-h-100 min-w-32 select-none overflow-auto whitespace-nowrap rounded-lg border border-border bg-background p-1 shadow-lg [&:not([data-state])]:hidden">
          {state.addTableColumnBefore.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.addTableColumnBefore.command}>
              <span>Insert Left</span>
            </TableHandlePopoverItem>
          )}
          {state.addTableColumnAfter.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.addTableColumnAfter.command}>
              <span>Insert Right</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteCellSelection.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.deleteCellSelection.command}>
              <span>Clear Contents</span>
              <span className="text-xs tracking-widest text-muted-foreground">Del</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteTableColumn.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.deleteTableColumn.command}>
              <span>Delete Column</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteTable.canExec && (
            <TableHandlePopoverItem
              className={menuItemClass}
              data-danger=""
              onSelect={state.deleteTable.command}
            >
              <span>Delete Table</span>
            </TableHandlePopoverItem>
          )}
        </TableHandlePopoverContent>
      </TableHandleColumnRoot>
      <TableHandleRowRoot className="h-[1.5em] w-[1.2em] ltr:translate-x-[80%] flex items-center box-border justify-center rounded-sm border border-border bg-background p-0 text-muted-foreground/60 transition data-[state=closed]:scale-95 data-[state=closed]:opacity-0 hover:bg-muted">
        <TableHandleRowTrigger className="flex items-center justify-center px-1 text-base leading-none">
          ⋮
        </TableHandleRowTrigger>
        <TableHandlePopoverContent className="relative z-10 block max-h-100 min-w-32 select-none overflow-auto whitespace-nowrap rounded-lg border border-border bg-background p-1 shadow-lg [&:not([data-state])]:hidden">
          {state.addTableRowAbove.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.addTableRowAbove.command}>
              <span>Insert Above</span>
            </TableHandlePopoverItem>
          )}
          {state.addTableRowBelow.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.addTableRowBelow.command}>
              <span>Insert Below</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteCellSelection.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.deleteCellSelection.command}>
              <span>Clear Contents</span>
              <span className="text-xs tracking-widest text-muted-foreground">Del</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteTableRow.canExec && (
            <TableHandlePopoverItem className={menuItemClass} onSelect={state.deleteTableRow.command}>
              <span>Delete Row</span>
            </TableHandlePopoverItem>
          )}
          {state.deleteTable.canExec && (
            <TableHandlePopoverItem
              className={menuItemClass}
              data-danger=""
              onSelect={state.deleteTable.command}
            >
              <span>Delete Table</span>
            </TableHandlePopoverItem>
          )}
        </TableHandlePopoverContent>
      </TableHandleRowRoot>
    </TableHandleRoot>
  );
}

const youtubeExtension = union(
  defineNodeSpec({
    name: 'youtube',
    group: 'block',
    atom: true,
    attrs: {
      src: { default: '' },
    },
    parseDOM: [
      {
        tag: 'iframe[data-youtube="true"]',
        getAttrs(dom) {
          const element = dom as HTMLIFrameElement;
          return { src: element.getAttribute('src') ?? '' };
        },
      },
    ],
    toDOM(node) {
      return [
        'div',
        { class: 'my-4', 'data-youtube-wrapper': 'true' },
        [
          'iframe',
          {
            'data-youtube': 'true',
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowfullscreen: 'true',
            frameborder: '0',
            src: node.attrs.src,
            style: 'aspect-ratio:16/9;width:100%;height:auto;min-height:280px;',
            title: 'YouTube embed',
          },
        ],
      ];
    },
  }),
  definePasteHandler((view, event) => {
    const text = event.clipboardData?.getData('text/plain')?.trim();
    if (!text) return false;

    const embedUrl = getYoutubeEmbedUrl(text);
    if (!embedUrl) return false;

    event.preventDefault();
    return insertNode({ attrs: { src: embedUrl }, type: 'youtube' })(
      view.state,
      view.dispatch,
      view
    );
  })
);

export function ProsekitMarkdownEditor({
  initialMarkdown,
  onChange,
  heightClassName = 'h-[26rem]',
  className,
}: ProsekitMarkdownEditorProps) {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const previousTextLengthRef = React.useRef<number>(0);
  const [initialHtml] = React.useState(() => markdownToHtml(initialMarkdown));
  const [editor, setEditor] = React.useState<Editor | null>(null);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const extension = union(defineBasicExtension(), youtubeExtension);
    const nextEditor = createEditor({
      defaultContent: initialHtml,
      extension,
    });
    setEditor(nextEditor);

    return () => {
      nextEditor.unmount();
    };
  }, [initialHtml]);

  React.useEffect(() => {
    if (!editor || !mountRef.current) return;
    const cleanup = editor.mount(mountRef.current);
    previousTextLengthRef.current = editor.state.doc.textContent.length;

    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      } else {
        editor.unmount();
      }
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor || !onChange) return;

    return editor.use(
      defineUpdateHandler((view) => {
        const nextTextLength = view.state.doc.textContent.length;
        const prevTextLength = previousTextLengthRef.current;
        previousTextLengthRef.current = nextTextLength;

        if (nextTextLength <= prevTextLength) return;
        onChange(htmlToMarkdown(editor.getDocHTML()));
      })
    );
  }, [editor, onChange]);

  const runCommand = React.useCallback((name: string, ...args: unknown[]) => {
    if (!editor) return;

    const command = (editor.commands as Record<
      string,
      (...commandArgs: unknown[]) => boolean | void
    >)[name];

    if (typeof command !== 'function') return;
    command(...args);
    editor.focus();
  }, [editor]);

  const toggleBold = React.useCallback(() => {
    runCommand('toggleBold');
  }, [runCommand]);

  const toggleItalic = React.useCallback(() => {
    runCommand('toggleItalic');
  }, [runCommand]);

  const toggleBulletList = React.useCallback(() => {
    runCommand('toggleList', { kind: 'bullet' });
  }, [runCommand]);

  const toggleOrderedList = React.useCallback(() => {
    runCommand('toggleList', { kind: 'ordered' });
  }, [runCommand]);

  const insertTableNode = React.useCallback(() => {
    runCommand('insertTable', { col: 3, header: true, row: 3 });
  }, [runCommand]);

  const insertYoutube = React.useCallback(() => {
    if (!editor) return;
    const input = window.prompt('Paste a YouTube link');
    if (!input) return;

    const embedUrl = getYoutubeEmbedUrl(input);
    if (!embedUrl) return;

    runCommand('insertNode', { attrs: { src: embedUrl }, type: 'youtube' });
  }, [editor, runCommand]);

  return (
    <div className={cn('min-h-0', heightClassName, className)}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border border-border bg-background p-2">
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          <Button disabled={!editor} onClick={toggleBold} size="icon" type="button" variant="outline">
            <TextBolderIcon className="h-4 w-4" />
          </Button>
          <Button disabled={!editor} onClick={toggleItalic} size="icon" type="button" variant="outline">
            <TextItalicIcon className="h-4 w-4" />
          </Button>
          <Button disabled={!editor} onClick={toggleBulletList} size="icon" type="button" variant="outline">
            <ListBulletsIcon className="h-4 w-4" />
          </Button>
          <Button disabled={!editor} onClick={toggleOrderedList} size="icon" type="button" variant="outline">
            <ListNumbersIcon className="h-4 w-4" />
          </Button>
          <Button disabled={!editor} onClick={insertTableNode} size="icon" type="button" variant="outline">
            <TableIcon className="h-4 w-4" />
          </Button>
          <Button disabled={!editor} onClick={insertYoutube} size="icon" type="button" variant="outline">
            <YoutubeLogoIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="prosekit-editor-surface relative min-h-0 flex-1">
          {editor ? (
            <ProseKit editor={editor}>
              <div className="min-h-full" ref={mountRef} />
              <TableHandle />
            </ProseKit>
          ) : (
            <div className="text-xs text-muted-foreground">Loading editor...</div>
          )}
        </div>
      </div>
    </div>
  );
}
