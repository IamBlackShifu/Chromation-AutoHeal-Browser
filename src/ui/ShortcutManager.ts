export interface ShortcutDefinition { command: string; keys: string; description: string; }
export class ShortcutManager {
  private shortcuts = new Map<string, ShortcutDefinition>();
  constructor(definitions: ShortcutDefinition[] = [
    { command: 'record.toggle', keys: 'Ctrl+Shift+R', description: 'Start or stop recording' },
    { command: 'inspect.toggle', keys: 'Ctrl+Shift+I', description: 'Inspect an element' },
    { command: 'replay.start', keys: 'Ctrl+Enter', description: 'Replay the current recording' },
    { command: 'replay.stop', keys: 'Escape', description: 'Stop the active replay' },
    { command: 'commandPalette.open', keys: 'Ctrl+K', description: 'Open command search' },
  ]) { definitions.forEach((definition) => this.set(definition)); }
  set(definition: ShortcutDefinition): void {
    const keys = this.normalize(definition.keys);
    const conflict = [...this.shortcuts.values()].find((item) =>
      item.command !== definition.command && this.normalize(item.keys) === keys);
    if (conflict) throw new Error(`Shortcut ${keys} is already assigned to ${conflict.command}`);
    this.shortcuts.set(definition.command, { ...definition, keys });
  }
  remove(command: string): boolean { return this.shortcuts.delete(command); }
  find(keys: string): ShortcutDefinition | undefined {
    const normalized = this.normalize(keys);
    return [...this.shortcuts.values()].find((item) => item.keys === normalized);
  }
  reference(): ShortcutDefinition[] {
    return [...this.shortcuts.values()].sort((a, b) => a.command.localeCompare(b.command));
  }
  private normalize(keys: string): string {
    const order = ['Ctrl', 'Alt', 'Shift', 'Meta'];
    const parts = keys.split('+').map((item) => item.trim()).filter(Boolean);
    const key = parts.find((item) => !order.some((modifier) => modifier.toLowerCase() === item.toLowerCase()));
    if (!key) throw new Error('Shortcut must include a key');
    return [...order.filter((modifier) => parts.some((item) => modifier.toLowerCase() === item.toLowerCase())),
      key.length === 1 ? key.toUpperCase() : key].join('+');
  }
}
