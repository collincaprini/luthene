'use client';

import { useState } from 'react';

import { ProsekitMarkdownEditor } from '@/components/prosekit-markdown-editor';
import { get } from 'http';

export default function Home() {
  const initialMarkdown =
    '# Hello\n\nStart writing here...\n\n- item 1\n- item 2\n\n https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const [markdown, setMarkdown] = useState(
    initialMarkdown
  );

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <ProsekitMarkdownEditor
        heightClassName="h-[26rem] w-4xl max-w-4xl"
        initialMarkdown={initialMarkdown}
        onChange={(nextMarkdown) => setMarkdown(nextMarkdown)}
      />

      <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-none border border-border bg-background p-3 text-xs">
        {markdown}
      </pre>
    </main>
  );
}
