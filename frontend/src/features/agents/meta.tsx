import { Cog, ListTree, MessageSquareText, Microscope, Orbit, Search, ShieldCheck, type LucideIcon } from 'lucide-react';

export const AGENT_META: Record<string, { icon: LucideIcon; accent: 'cyan' | 'violet' | 'blue' | 'magenta'; blurb: string }> = {
  orchestrator: { icon: Orbit, accent: 'violet', blurb: 'Coordinates the run, dispatches agents and enforces limits.' },
  planner: { icon: ListTree, accent: 'blue', blurb: 'Breaks the request into tool-backed steps.' },
  research: { icon: Search, accent: 'cyan', blurb: 'Reads permitted sources: knowledge base, optional web search.' },
  execution: { icon: Cog, accent: 'cyan', blurb: 'Runs approved, allow-listed tools.' },
  analysis: { icon: Microscope, accent: 'blue', blurb: 'Interprets collected observations.' },
  validation: { icon: ShieldCheck, accent: 'violet', blurb: 'Checks completeness and grounding.' },
  response: { icon: MessageSquareText, accent: 'magenta', blurb: 'Writes the final answer.' },
};
