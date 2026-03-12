'use client'

import Editor from '@/components/editor/examples/full/editor'

export default function Home() {
  return (
    <main className="m-auto flex flex-row w-full p-6">

      <div className='w-1/2'>
        <Editor />
      </div>

      <div className='w-1/2'>
        something
      </div>
    </main>
  )
}