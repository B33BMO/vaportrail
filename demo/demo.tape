# vhs tape for the README demo — run from the repo root:
#   node demo/generate.mjs && vhs demo/demo.tape
Output demo/demo.gif

Set FontSize 14
Set Width 1150
Set Height 700
Set Padding 14
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type `export PATH="$PATH:$(dirname $(which node 2>/dev/null || echo /usr/local/bin))" HOME="$PWD/demo/home" CLAUDE_CONFIG_DIR="demo/claude" CODEX_HOME="demo/codex" XDG_DATA_HOME="demo/xdg"`
Enter
Type "clear"
Enter
Show

Type "vaportrail"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Type "vaportrail show 5e6f"
Sleep 500ms
Enter
Sleep 6s

Type "clear"
Enter
Type `vaportrail search "leak"`
Sleep 500ms
Enter
Sleep 4.5s

Type "clear"
Enter
Type "vaportrail stats"
Sleep 500ms
Enter
Sleep 6s
