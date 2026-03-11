'use client';

import { useState } from 'react';

import { ProsekitMarkdownEditor } from '@/components/prosekit-markdown-editor';
import { get } from 'http';

export default function Home() {
  const initialMarkdown =
    '# Hello\n\nStart writing here...\n\n- item 1\n- item 2\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const [markdown, setMarkdown] = useState(
    initialMarkdown
  );

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <ProsekitMarkdownEditor
        initialMarkdown={initialMarkdown}
        onChange={(nextMarkdown) => setMarkdown(nextMarkdown)}
      />

      <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-none border border-border bg-background p-3 text-xs">
        {markdown}
      </pre>
    </main>
  );
}

interface Position {
  you: string;
  opponent: string;
}

function doBJJ(connection: boolean, position: Position) {
  if (!connection) {
    getMeaningfulConnection()
  }
  if (position.you === 'kata gatame' || position.you === 'ushiro sankaku' || position.you === 'omote sankaku') {
    return true; //strangle them
  } else if (position.opponent === 'doing something retarded') {
    return true; //joint lock or strangle them, depending on what retarded thing they did.
  }

  const optimalNext = getOptimalNext(position);
  const newPosition = tryToImprovePositon(position, optimalNext);
  return doBJJ(connection, newPosition);
}

// returns the new postion based on the output of some attempted technique
function tryToImprovePositon(currentPosition: Position, positionYouSeek : Position): Position {
  //some algorithm from a hash table based on the current position that should lead to the new position
  return { you: 'x', opponent: 'y' };
}

// returns the optimal next position based on the current position
function getOptimalNext(position: Position): Position {
  // from hash table
  return { you: 'x', opponent: 'y' }
}

function getMeaningfulConnection(): boolean {
  // mostly handfighting if standing, could be an underhook or overhook, or shooting
  // underhooking a leg, single leg, double leg, etc. if on the ground. 
  // The point is to get a connection that allows you to control your opponent and attempt techniques.
  return true;
}

