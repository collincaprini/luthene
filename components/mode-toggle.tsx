"use client"

import * as React from "react"

import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { HeadlightsIcon } from "@phosphor-icons/react"

export function ModeToggle() {
  const { setTheme, theme } = useTheme()

  function toggleTheme() {
    if (theme === "light") {
      setTheme("dark")
    } else {
      setTheme("light")
    }
  }

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme}>
      <HeadlightsIcon className="h-[1.2rem] w-[1.2rem]" />
    </Button>
  )
}
