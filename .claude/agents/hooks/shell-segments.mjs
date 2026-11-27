// Shared shell-command parsing for the subagent PreToolUse guards in this folder.
// Commands are matched only in command position (after ; & | ( newline or $( ), never as substrings,
// so text that merely mentions `git push` inside an echo or heredoc body is not matched by accident.
// The parser is not quote-aware: odd quoting splits into extra segments, which every guard treats
// as more commands to check (fails closed), never fewer.

/** Split a shell command into simple-command segments, each with its leading words. */
export function segments(command) {
  return command
    .split(/\$\(|[;&|()\n`]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).filter((w) => !/^\w+=\S*$/.test(w) && !['command', 'env', 'exec', 'sudo'].includes(w)))
    .filter((w) => w.length > 0);
}

/** The git subcommand of a `git …` segment: git [-C path | -c k=v | --flag]… <sub>. */
export function gitSubcommand(words) {
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === '-C' || w === '-c') { i++; continue; }
    if (w.startsWith('-')) continue;
    return w;
  }
  return null;
}
