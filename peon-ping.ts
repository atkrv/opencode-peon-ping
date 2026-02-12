/**
 * peon-ping for OpenCode
 *
 * Plays Warcraft III Peon (and other) voice lines when OpenCode finishes tasks,
 * needs permission, or starts a session. Ported from the Claude Code hook:
 * https://github.com/tonyyont/peon-ping
 *
 * Features:
 * - Sound packs with manifest-based sound selection
 * - Desktop notifications when the terminal is not focused
 * - Tab title updates (project: status)
 * - "Annoyed" easter egg when rapid prompts are detected
 * - Pause/resume support via config file
 * - Pack rotation per session
 *
 * Setup:
 *   1. Clone or copy the peon-ping sound packs to ~/.config/opencode/peon-ping/packs/
 *      e.g.: git clone https://github.com/tonyyont/peon-ping /tmp/peon-ping
 *            cp -r /tmp/peon-ping/packs ~/.config/opencode/peon-ping/packs
 *
 *   2. Create a config at ~/.config/opencode/peon-ping/config.json (optional):
 *      {
 *        "active_pack": "peon",
 *        "volume": 0.5,
 *        "enabled": true,
 *        "categories": {
 *          "greeting": true,
 *          "acknowledge": true,
 *          "complete": true,
 *          "error": true,
 *          "permission": true,
 *          "annoyed": true
 *        },
 *        "annoyed_threshold": 3,
 *        "annoyed_window_seconds": 10,
 *        "pack_rotation": []
 *      }
 *
 *   3. This file goes in ~/.config/opencode/plugins/peon-ping.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import type { Plugin } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SoundEntry {
  file: string
  line: string
}

interface PackManifest {
  name: string
  display_name: string
  categories: Record<string, { sounds: SoundEntry[] }>
}

interface PeonConfig {
  active_pack: string
  volume: number
  enabled: boolean
  categories: Record<string, boolean>
  annoyed_threshold: number
  annoyed_window_seconds: number
  pack_rotation: string[]
}

interface PeonState {
  last_played: Record<string, string>
  prompt_timestamps: Record<string, number[]>
  session_packs: Record<string, string>
  paused: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEON_DIR = path.join(os.homedir(), ".config", "opencode", "peon-ping")
const CONFIG_PATH = path.join(PEON_DIR, "config.json")
const STATE_PATH = path.join(PEON_DIR, ".state.json")
const PAUSED_PATH = path.join(PEON_DIR, ".paused")
const PACKS_DIR = path.join(PEON_DIR, "packs")

const DEFAULT_CONFIG: PeonConfig = {
  active_pack: "peon",
  volume: 0.5,
  enabled: true,
  categories: {
    greeting: true,
    acknowledge: true,
    complete: true,
    error: true,
    permission: true,
    resource_limit: true,
    annoyed: true,
  },
  annoyed_threshold: 3,
  annoyed_window_seconds: 10,
  pack_rotation: [],
}

// Terminal process names for focus detection on macOS
const TERMINAL_PROCESS_NAMES = [
  "Terminal",
  "iTerm2",
  "Warp",
  "Alacritty",
  "kitty",
  "WezTerm",
  "Ghostty",
  "Hyper",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig(): PeonConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed, categories: { ...DEFAULT_CONFIG.categories, ...parsed.categories } }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function loadState(): PeonState {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8")
    return JSON.parse(raw)
  } catch {
    return { last_played: {}, prompt_timestamps: {}, session_packs: {}, paused: false }
  }
}

function saveState(state: PeonState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  } catch {
    // Silently fail - state is non-critical
  }
}

function isPaused(): boolean {
  return fs.existsSync(PAUSED_PATH)
}

function loadManifest(packName: string): PackManifest | null {
  try {
    const manifestPath = path.join(PACKS_DIR, packName, "manifest.json")
    const raw = fs.readFileSync(manifestPath, "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function listPacks(): string[] {
  try {
    return fs
      .readdirSync(PACKS_DIR)
      .filter((name) => {
        const manifestPath = path.join(PACKS_DIR, name, "manifest.json")
        return fs.existsSync(manifestPath)
      })
      .sort()
  } catch {
    return []
  }
}

/**
 * Pick a random sound from a category, avoiding the last played sound.
 */
function pickSound(
  manifest: PackManifest,
  category: string,
  state: PeonState,
): SoundEntry | null {
  const cat = manifest.categories[category]
  if (!cat || !cat.sounds || cat.sounds.length === 0) return null

  const sounds = cat.sounds
  const lastFile = state.last_played[category]

  let candidates = sounds
  if (sounds.length > 1 && lastFile) {
    candidates = sounds.filter((s) => s.file !== lastFile)
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)]

  state.last_played[category] = pick.file
  return pick
}

/**
 * Resolve the active pack for a session, supporting pack_rotation.
 */
function resolveActivePack(
  config: PeonConfig,
  state: PeonState,
  sessionId: string,
): string {
  if (config.pack_rotation.length > 0) {
    const existing = state.session_packs[sessionId]
    if (existing && config.pack_rotation.includes(existing)) {
      return existing
    }
    const pick =
      config.pack_rotation[
        Math.floor(Math.random() * config.pack_rotation.length)
      ]
    state.session_packs[sessionId] = pick
    return pick
  }
  return config.active_pack
}

// ---------------------------------------------------------------------------
// Platform: Audio playback
// ---------------------------------------------------------------------------

function playSound(filePath: string, volume: number): void {
  if (!fs.existsSync(filePath)) return

  const platform = os.platform()

  if (platform === "darwin") {
    // macOS: use afplay
    const proc = Bun.spawn(["afplay", "-v", String(volume), filePath], {
      stdout: "ignore",
      stderr: "ignore",
    })
    // Fire and forget - don't block on the sound
    proc.unref()
  } else if (platform === "linux") {
    // Linux/WSL: try paplay (PulseAudio) or aplay (ALSA)
    // Check if WSL by looking for /proc/version
    let isWSL = false
    try {
      const ver = fs.readFileSync("/proc/version", "utf8")
      isWSL = /microsoft/i.test(ver)
    } catch {}

    if (isWSL) {
      // WSL: Use PowerShell MediaPlayer
      const wpath = filePath.replace(/\//g, "\\")
      const cmd = `
        Add-Type -AssemblyName PresentationCore
        $p = New-Object System.Windows.Media.MediaPlayer
        $p.Open([Uri]::new('file:///${wpath}'))
        $p.Volume = ${volume}
        Start-Sleep -Milliseconds 200
        $p.Play()
        Start-Sleep -Seconds 3
        $p.Close()
      `
      const proc = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", cmd], {
        stdout: "ignore",
        stderr: "ignore",
      })
      proc.unref()
    } else {
      // Native Linux: try paplay first, fall back to aplay
      try {
        const proc = Bun.spawn(["paplay", filePath], {
          stdout: "ignore",
          stderr: "ignore",
        })
        proc.unref()
      } catch {
        try {
          const proc = Bun.spawn(["aplay", filePath], {
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.unref()
        } catch {}
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Platform: Desktop notifications
// ---------------------------------------------------------------------------

async function sendNotification(msg: string, title: string): Promise<void> {
  const platform = os.platform()

  if (platform === "darwin") {
    try {
      const proc = Bun.spawn(
        [
          "osascript",
          "-e",
          `display notification "${msg}" with title "${title}"`,
        ],
        { stdout: "ignore", stderr: "ignore" },
      )
      proc.unref()
    } catch {}
  } else if (platform === "linux") {
    try {
      const proc = Bun.spawn(["notify-send", title, msg], {
        stdout: "ignore",
        stderr: "ignore",
      })
      proc.unref()
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Platform: Terminal focus detection
// ---------------------------------------------------------------------------

async function isTerminalFocused(): Promise<boolean> {
  if (os.platform() !== "darwin") {
    // On non-macOS, we can't easily detect focus; always notify
    return false
  }

  try {
    const proc = Bun.spawn(
      [
        "osascript",
        "-e",
        'tell application "System Events" to get name of first process whose frontmost is true',
      ],
      { stdout: "pipe", stderr: "ignore" },
    )
    const output = await new Response(proc.stdout).text()
    const frontmost = output.trim()
    return TERMINAL_PROCESS_NAMES.some(
      (name) => name.toLowerCase() === frontmost.toLowerCase(),
    )
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Tab title
// ---------------------------------------------------------------------------

function setTabTitle(title: string): void {
  process.stdout.write(`\x1b]0;${title}\x07`)
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------

type EventCategory =
  | "greeting"
  | "acknowledge"
  | "complete"
  | "error"
  | "permission"
  | "resource_limit"
  | "annoyed"

interface EventResult {
  category: EventCategory | null
  status: string
  marker: string
  shouldNotify: boolean
  notifyMsg: string
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const PeonPingPlugin: Plugin = async ({ $, directory }) => {
  // Derive project name from the working directory
  const projectName = path.basename(directory || process.cwd()) || "opencode"

  // Per-session state kept in memory for rapid-prompt tracking
  const sessionPromptTimestamps: Record<string, number[]> = {}

  // Unique session ID (approximated per plugin init since OpenCode creates
  // a fresh plugin instance per server start)
  const sessionId = `oc-${Date.now()}`

  // Load config once at startup
  const config = loadConfig()
  if (!config.enabled) {
    return {}
  }

  // Resolve the active pack
  const state = loadState()
  const activePack = resolveActivePack(config, state, sessionId)
  saveState(state)

  const manifest = loadManifest(activePack)
  if (!manifest) {
    // No pack found - plugin is a no-op
    return {}
  }

  /**
   * Core handler: given a mapped event result, play sound + notify + title.
   */
  async function handle(result: EventResult): Promise<void> {
    const paused = isPaused()

    // Tab title (always, even when paused)
    if (result.status) {
      setTabTitle(`${result.marker}${projectName}: ${result.status}`)
    }

    // Sound
    if (result.category && config.categories[result.category] !== false && !paused) {
      const currentState = loadState()
      const sound = pickSound(manifest!, result.category, currentState)
      if (sound) {
        const soundPath = path.join(PACKS_DIR, activePack, "sounds", sound.file)
        playSound(soundPath, config.volume)
        saveState(currentState)
      }
    }

    // Desktop notification (only when terminal is NOT focused and not paused)
    if (result.shouldNotify && !paused) {
      const focused = await isTerminalFocused()
      if (!focused) {
        await sendNotification(
          result.notifyMsg,
          `${result.marker}${projectName}: ${result.status}`,
        )
      }
    }
  }

  /**
   * Check for rapid-prompt "annoyed" easter egg.
   */
  function checkAnnoyed(): boolean {
    if (!config.categories.annoyed) return false

    const now = Date.now() / 1000
    const window = config.annoyed_window_seconds
    const threshold = config.annoyed_threshold

    if (!sessionPromptTimestamps[sessionId]) {
      sessionPromptTimestamps[sessionId] = []
    }

    const ts = sessionPromptTimestamps[sessionId]
    // Prune old timestamps
    const recent = ts.filter((t) => now - t < window)
    recent.push(now)
    sessionPromptTimestamps[sessionId] = recent

    return recent.length >= threshold
  }

  // --- Play greeting sound on plugin init (equivalent to SessionStart) ---
  const greetingResult: EventResult = {
    category: "greeting",
    status: "ready",
    marker: "",
    shouldNotify: false,
    notifyMsg: "",
  }
  // Defer slightly so the plugin init doesn't block
  setTimeout(() => handle(greetingResult), 100)

  // --- Return event hooks ---
  return {
    event: async ({ event }) => {
      switch (event.type) {
        // Session completed / went idle
        case "session.idle": {
          await handle({
            category: "complete",
            status: "done",
            marker: "\u25cf ",
            shouldNotify: true,
            notifyMsg: `${projectName}  \u2014  Task complete`,
          })
          break
        }

        // Session encountered an error
        case "session.error": {
          await handle({
            category: "error",
            status: "error",
            marker: "\u25cf ",
            shouldNotify: true,
            notifyMsg: `${projectName}  \u2014  Error occurred`,
          })
          break
        }

        // Permission asked (AI is blocked waiting for human)
        case "permission.asked": {
          await handle({
            category: "permission",
            status: "needs approval",
            marker: "\u25cf ",
            shouldNotify: true,
            notifyMsg: `${projectName}  \u2014  Permission needed`,
          })
          break
        }

        // Session created (new session started)
        case "session.created": {
          await handle({
            category: "greeting",
            status: "ready",
            marker: "",
            shouldNotify: false,
            notifyMsg: "",
          })
          break
        }

        // Session status change (working)
        case "session.status": {
          const status = event.properties?.status
          if (status === "busy" || status === "running") {
            // Check for rapid prompts (annoyed)
            if (checkAnnoyed()) {
              await handle({
                category: "annoyed",
                status: "working",
                marker: "",
                shouldNotify: false,
                notifyMsg: "",
              })
            } else {
              // Just update tab title, no sound for normal work start
              setTabTitle(`${projectName}: working`)
            }
          }
          break
        }
      }
    },

    // Intercept prompt submissions to track rapid prompts
    "message.updated": async (props) => {
      // Track timestamps for the annoyed detection
      // message.updated fires on both user and assistant messages
      if (props?.properties?.role === "user") {
        checkAnnoyed()
      }
    },
  }
}

export default PeonPingPlugin
