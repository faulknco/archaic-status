// The public surfaces this page watches. Order is the order on the page.
export type Target = { id: string; name: string; url: string };

export const TARGETS: readonly Target[] = [
  { id: 'archaic', name: 'Archaic', url: 'https://archaic.ie/' },
  { id: 'planningwatch', name: 'PlanningWatch', url: 'https://planningwatch.ie/health/' },
  { id: 'planning-pulse', name: 'Planning Pulse', url: 'https://planningwatch.ie/trends/' },
  { id: 'salaries', name: 'salaries.ie', url: 'https://salaries.ie/' },
  { id: 'roleup', name: 'RoleUp', url: 'https://roleup.ie/' },
  { id: 'stats-mcp', name: 'Ireland Stats MCP', url: 'https://stats.archaic.ie/health' },
  { id: 'forge', name: 'Forge', url: 'https://archaic.ie/forge/' },
];
