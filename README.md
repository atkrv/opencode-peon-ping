# opencode-peon-ping

**Your Peon pings you when OpenCode needs attention.**

A [CESP v1.0](https://github.com/PeonPing/openpeon) (Coding Event Sound Pack Specification) player for [OpenCode](https://opencode.ai). Plays game character voice lines so you never miss when a task finishes, permission is needed, or a session starts. Compatible with all 36+ packs in the [OpenPeon registry](https://github.com/PeonPing/registry).

Ported from [peon-ping](https://github.com/tonyyont/peon-ping).

> [!IMPORTANT]
> The code was vibe coded with `Claude Opus 4.6`. Quality complaints may be forwarded to [@anthropics](https://github.com/anthropics)

## What you'll hear

| CESP Event | When | Examples (Orc Peon pack) |
|---|---|---|
| `session.start` | Session opens | *"Ready to work?"*, *"Yes?"* |
| `task.acknowledge` | Agent starts working | *"Work, work."*, *"Okie dokie."* |
| `task.complete` | Task finished | *"I can do that."*, *"Something need doing?"* |
| `task.error` | Error occurred | *"Me not that kind of orc!"* |
| `input.required` | Permission needed | *"Something need doing?"*, *"Hmm?"* |
| `resource.limit` | Rate/token limit hit | *"Why not?"* |
| `user.spam` | Rapid prompts (3+ in 10s) | *"Me busy, leave me alone!"* |

Plus terminal tab titles (`● project: done`) and desktop notifications when your terminal isn't focused.

## Install

### 1. Copy the plugin

```bash
mkdir -p ~/.config/opencode/plugins
curl -fsSL https://raw.githubusercontent.com/atkrv/opencode-peon-ping/main/peon-ping.ts \
  -o ~/.config/opencode/plugins/peon-ping.ts
```

### 2. Install a sound pack

Use the included helper script to install packs from the [OpenPeon registry](https://github.com/PeonPing/registry):

```bash
# Download the install script
curl -fsSL https://raw.githubusercontent.com/atkrv/opencode-peon-ping/main/install-pack.sh \
  -o /tmp/install-pack.sh && chmod +x /tmp/install-pack.sh

# List available packs
/tmp/install-pack.sh --list

# Install a pack (e.g., peon, glados, rick, tf2_engineer)
/tmp/install-pack.sh peon
```

Packs are installed to `~/.openpeon/packs/` per the CESP specification.

**Manual install** (without the script):

```bash
mkdir -p ~/.openpeon/packs
git clone --depth 1 https://github.com/PeonPing/og-packs /tmp/og-packs
cp -r /tmp/og-packs/peon ~/.openpeon/packs/peon
rm -rf /tmp/og-packs
```

### 3. (Optional) Create config

```bash
mkdir -p ~/.config/opencode/peon-ping
curl -fsSL https://raw.githubusercontent.com/atkrv/opencode-peon-ping/main/config.json \
  -o ~/.config/opencode/peon-ping/config.json
```

### 4. Restart OpenCode

The plugin is loaded automatically from `~/.config/opencode/plugins/`.

## Configuration

Edit `~/.config/opencode/peon-ping/config.json`:

```json
{
  "active_pack": "peon",
  "volume": 0.5,
  "enabled": true,
  "categories": {
    "session.start": true,
    "session.end": true,
    "task.acknowledge": true,
    "task.complete": true,
    "task.error": true,
    "task.progress": true,
    "input.required": true,
    "resource.limit": true,
    "user.spam": true
  },
  "spam_threshold": 3,
  "spam_window_seconds": 10,
  "debounce_ms": 500,
  "pack_rotation": []
}
```

| Option | Description |
|---|---|
| `active_pack` | Which sound pack to use (default: `peon`) |
| `volume` | Playback volume, 0.0 -- 1.0 |
| `enabled` | Master on/off switch |
| `categories` | Toggle individual CESP event categories |
| `spam_threshold` | How many prompts in the window triggers `user.spam` |
| `spam_window_seconds` | Time window for rapid-prompt detection |
| `debounce_ms` | Minimum ms between sounds for the same category |
| `pack_rotation` | Array of pack names -- each session randomly picks one |
| `packs_dir` | Override pack directory (default: `~/.openpeon/packs/`) |

## Sound packs

All 36 packs from the [OpenPeon registry](https://peonping.github.io/registry/index.json) are supported, including:

| Pack | Character | Source |
|---|---|---|
| `peon` (default) | Orc Peon | Warcraft III |
| `peasant` | Human Peasant | Warcraft III |
| `glados` | GLaDOS | Portal |
| `rick` | Rick Sanchez | Rick and Morty |
| `tf2_engineer` | Engineer | Team Fortress 2 |
| `duke_nukem` | Duke Nukem | Duke Nukem |
| `sc_kerrigan` | Sarah Kerrigan | StarCraft |
| `sopranos` | Tony Soprano | The Sopranos |
| `dota2_axe` | Axe | Dota 2 |
| `hd2_helldiver` | Helldiver | Helldivers 2 |
| ... | [36 total](https://github.com/PeonPing/og-packs) | Various |

Localized packs available in Russian, French, Spanish, Polish, and Czech.

To switch packs, update `active_pack` in config.json and restart OpenCode.

For random pack per session:

```json
{ "pack_rotation": ["peon", "glados", "rick", "tf2_engineer"] }
```

### Legacy packs

Packs using the old `manifest.json` format (from the original peon-ping) are automatically migrated at runtime. No changes needed.

## Event mapping

Per [CESP spec Section 6](https://github.com/PeonPing/openpeon/blob/main/spec/cesp-v1.md#6-ide-mapping-contract), this player maps OpenCode events as follows:

| OpenCode Event | CESP Category | Notification |
|---|---|---|
| Plugin init / `session.created` | `session.start` | No |
| `session.status` (busy) | `task.acknowledge` | No |
| `session.idle` | `task.complete` | Yes |
| `session.error` | `task.error` | Yes |
| `permission.asked` | `input.required` | Yes |
| (rate limit detection) | `resource.limit` | Yes |
| Rapid prompts detected | `user.spam` | No |

## Pause / Resume

```bash
# Pause (sounds and notifications muted, tab titles still update)
touch ~/.config/opencode/peon-ping/.paused

# Resume
rm ~/.config/opencode/peon-ping/.paused
```

## Uninstall

```bash
# Remove the plugin
rm ~/.config/opencode/plugins/peon-ping.ts

# Remove config and state
rm -rf ~/.config/opencode/peon-ping

# (Optional) Remove installed packs
rm -rf ~/.openpeon
```

Then restart OpenCode.

## Platform support

| Feature | macOS | Linux | WSL2 |
|---|---|---|---|
| Sound playback | `afplay` | `paplay` / `aplay` | PowerShell MediaPlayer |
| Notifications | `osascript` | `notify-send` | `notify-send` |
| Focus detection | AppleScript | -- | -- |
| Tab titles | Yes | Yes | Yes |

## Requirements

- macOS, Linux, or WSL2
- [OpenCode](https://opencode.ai) with plugin support
- `curl` and `jq` (for `install-pack.sh`)

## Credits

- Original [peon-ping](https://github.com/tonyyont/peon-ping) by [@tonyyont](https://github.com/tonyyont)
- [CESP v1.0 specification](https://github.com/PeonPing/openpeon) by [@garysheng](https://github.com/garysheng)
- Sound packs from [PeonPing/og-packs](https://github.com/PeonPing/og-packs)
- Sound files are property of their respective publishers

## License

MIT
