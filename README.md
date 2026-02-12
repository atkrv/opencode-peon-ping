# opencode-peon-ping

**Your Peon pings you when OpenCode needs attention.**

An [OpenCode](https://opencode.ai) plugin port of [peon-ping](https://github.com/tonyyont/peon-ping). Plays Warcraft III Peon (and other game character) voice lines so you never miss when a task finishes, permission is needed, or a session starts.

> [!IMPORTANT]
> The code was vide coded with `Claude Opus 4.6`. Quality complaints may be forwarded to [@anthropics](https://github.com/anthropics)

## What you'll hear

| Event | Sound | Examples |
|---|---|---|
| Session starts | Greeting | *"Ready to work?"*, *"Yes?"*, *"What you want?"* |
| Task finishes | Complete | *"Work, work."*, *"I can do that."*, *"Okie dokie."* |
| Permission needed | Alert | *"Something need doing?"*, *"Hmm?"*, *"What you want?"* |
| Error | Error | *"Me not that kind of orc!"*, *"Ugh."* |
| Rapid prompts (3+ in 10s) | Easter egg | *"Me busy, leave me alone!"* |

Plus terminal tab titles (`● project: done`) and desktop notifications when your terminal isn't focused.

## Install

### 1. Copy the plugin

```bash
curl -fsSL https://raw.githubusercontent.com/atkrv/opencode-peon-ping/main/peon-ping.ts \
  -o ~/.config/opencode/plugins/peon-ping.ts
```

### 2. Install sound packs

The plugin uses the same sound packs as the original peon-ping. Clone them:

```bash
mkdir -p ~/.config/opencode/peon-ping
git clone --depth 1 https://github.com/tonyyont/peon-ping /tmp/peon-ping
cp -r /tmp/peon-ping/packs ~/.config/opencode/peon-ping/packs
rm -rf /tmp/peon-ping
```

### 3. (Optional) Create config

```bash
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
    "greeting": true,
    "acknowledge": true,
    "complete": true,
    "error": true,
    "permission": true,
    "resource_limit": true,
    "annoyed": true
  },
  "annoyed_threshold": 3,
  "annoyed_window_seconds": 10,
  "pack_rotation": []
}
```

| Option | Description |
|---|---|
| `active_pack` | Which sound pack to use (default: `peon`) |
| `volume` | 0.0 -- 1.0 |
| `enabled` | Master on/off switch |
| `categories` | Toggle individual sound types |
| `annoyed_threshold` | How many prompts in the window triggers the easter egg |
| `annoyed_window_seconds` | Time window for rapid-prompt detection |
| `pack_rotation` | Array of pack names -- each session randomly gets one |

## Sound packs

All packs from the original peon-ping are supported:

| Pack | Character | Source |
|---|---|---|
| `peon` (default) | Orc Peon | Warcraft III |
| `peon_fr` | Orc Peon (French) | Warcraft III |
| `peon_pl` | Orc Peon (Polish) | Warcraft III |
| `peasant` | Human Peasant | Warcraft III |
| `peasant_fr` | Human Peasant (French) | Warcraft III |
| `ra2_soviet_engineer` | Soviet Engineer | Red Alert 2 |
| `sc_battlecruiser` | Battlecruiser | StarCraft |
| `sc_kerrigan` | Sarah Kerrigan | StarCraft |

To switch packs, set `active_pack` in config.json and restart OpenCode.

For random pack per session, set `pack_rotation`:

```json
{ "pack_rotation": ["peon", "sc_kerrigan", "peasant"] }
```

## Pause / Resume

To mute sounds and notifications:

```bash
# Pause
touch ~/.config/opencode/peon-ping/.paused

# Resume
rm ~/.config/opencode/peon-ping/.paused
```

Tab titles remain active when paused.

## How it works

The plugin hooks into OpenCode's event system:

| OpenCode event | peon-ping action |
|---|---|
| `session.created` | Greeting sound |
| `session.idle` | Complete sound + notification |
| `session.error` | Error sound + notification |
| `permission.asked` | Permission sound + notification |
| `session.status` (busy) | Rapid-prompt detection (annoyed) |

Sounds are played via `afplay` (macOS), PowerShell `MediaPlayer` (WSL), or `paplay`/`aplay` (Linux). Desktop notifications use `osascript` (macOS) or `notify-send` (Linux). Notifications are suppressed when your terminal is the frontmost app.

## Requirements

- macOS, Linux, or WSL2
- OpenCode with plugin support
- Sound packs from [tonyyont/peon-ping](https://github.com/tonyyont/peon-ping)

## Credits

- Original [peon-ping](https://github.com/tonyyont/peon-ping) by [@tonyyont](https://github.com/tonyyont)
- Sound files are property of their respective publishers (Blizzard Entertainment, EA)

## License

MIT
