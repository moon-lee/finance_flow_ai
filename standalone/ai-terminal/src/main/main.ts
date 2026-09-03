import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AiTerminalService } from "./services/ai-terminal-service.js";
import { AiOpencodeService } from "./services/ai-opencode-service.js";
import { AiReportService, parseReportRequest } from "./services/ai-report-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const aiTerminalService = new AiTerminalService();
const fallbackDb = join(
  app.getPath("appData"),
  "Finance Flow AI Dev",
  "finance.db",
);
const aiOpencodeService = new AiOpencodeService(
  fallbackDb,
  {},
  "opencode/big-pickle",
);
let terminalVisible = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = "http://localhost:5173";
  mainWindow.loadURL(devUrl).catch(() => {
    mainWindow?.loadFile(join(__dirname, "../../dist/renderer/index.html"));
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const userDb = aiTerminalService.getDbPath();
  if (userDb) aiOpencodeService.setDbPath(userDb);
  console.log(
    `[ai-terminal] DB path: ${aiOpencodeService.getDbPath()} (fallback: ${fallbackDb}, user: ${userDb || "(none)"})`,
  );
  console.log(`[ai-terminal] Model: opencode/big-pickle`);
  console.log(
    `[ai-terminal] System prompt: ${aiOpencodeService.getSystemPrompt().slice(0, 120)}...`,
  );

  const aiReportService = new AiReportService(join(app.getPath("userData"), "Reports"));

  ipcMain.handle("ai-terminal:send", async (_e, prompt: string) => {
    console.log(`[ai-terminal] IPC ai-terminal:send "${prompt.slice(0, 60)}"`);
    try {
      const out = await aiOpencodeService.query(prompt);
      const report = parseReportRequest(prompt);
      if (report) {
        const saved = await aiReportService.writeReport(out, report.fy, report.ext);
        console.log(`[ai-terminal] report saved: ${saved}`);
        await aiReportService.openReport(saved);
        return { ok: true, output: `${out}\n\nSaved: ${saved}` };
      }
      console.log(`[ai-terminal] IPC send ok ${out.length} chars`);
      return { ok: true, output: out };
    } catch (err) {
      console.log(`[ai-terminal] IPC send error ${String(err)}`);
      return { ok: false, output: String(err) };
    }
  });
  ipcMain.handle("ai-terminal:toggle", () => {
    terminalVisible = !terminalVisible;
    aiTerminalService.setVisible(terminalVisible);
    mainWindow?.webContents.send("ai-terminal:toggle", terminalVisible);
    return terminalVisible;
  });
  ipcMain.handle("ai-terminal:select-db-path", async () => {
    const p = await aiOpencodeService.selectDbPath();
    if (p && p !== fallbackDb) aiTerminalService.setDbPath(p);
    return p;
  });
  ipcMain.handle("ai-terminal:reset-db-path", async () => {
    aiTerminalService.setDbPath("");
    aiOpencodeService.setDbPath(fallbackDb);
    return fallbackDb;
  });

  function buildModelSubmenu(): Electron.MenuItemConstructorOptions[] {
    return [
      {
        label: "Loading models…",
        enabled: false,
      },
    ];
  }

  let modelSubmenu: Electron.MenuItemConstructorOptions[] = buildModelSubmenu();

  async function refreshModelMenu() {
    const models = await aiOpencodeService.getModels();
    modelSubmenu = models.length
      ? models.map((m) => ({
          label: m,
          type: "radio" as const,
          checked: m === aiOpencodeService.getModel(),
          click: () => {
            aiOpencodeService.setModel(m);
            refreshModelMenu();
          },
        }))
      : [
          {
            label: "No models found",
            enabled: false,
          },
        ];
    // Rebuild entire menu to update model submenu
    const newMenu = Menu.buildFromTemplate([
      {
        label: "View",
        submenu: [
          {
            label: "Toggle AI-Terminal",
            accelerator: "CmdOrCtrl+J",
            click: () => {
              terminalVisible = !terminalVisible;
              aiTerminalService.setVisible(terminalVisible);
              mainWindow?.webContents.send(
                "ai-terminal:toggle",
                terminalVisible,
              );
            },
          },
          {
            label: "Select Database File…",
            click: async () => {
              const p = await aiOpencodeService.selectDbPath();
              if (p) aiTerminalService.setDbPath(p);
            },
          },
          {
            label: "Reset Database File",
            click: async () => {
              aiTerminalService.setDbPath("");
              aiOpencodeService.setDbPath(fallbackDb);
            },
          },
          { type: "separator" },
          {
            label: "Model",
            submenu: modelSubmenu,
          },
        ],
      },
    ]);
    Menu.setApplicationMenu(newMenu);
  }

  // Initial menu with placeholder
  const initialMenu = Menu.buildFromTemplate([
    {
      label: "View",
      submenu: [
        {
          label: "Toggle AI-Terminal",
          accelerator: "CmdOrCtrl+J",
          click: () => {
            terminalVisible = !terminalVisible;
            aiTerminalService.setVisible(terminalVisible);
            mainWindow?.webContents.send("ai-terminal:toggle", terminalVisible);
          },
        },
        {
          label: "Select Database File…",
          click: async () => {
            const p = await aiOpencodeService.selectDbPath();
            if (p) aiTerminalService.setDbPath(p);
          },
        },
        {
          label: "Reset Database File",
          click: async () => {
            aiTerminalService.setDbPath("");
            aiOpencodeService.setDbPath(fallbackDb);
          },
        },
        { type: "separator" },
        {
          label: "Model",
          submenu: modelSubmenu,
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(initialMenu);
  // // Load models after menu is set
  // refreshModelMenu();
  // createWindow();
  void (async () => {
    const ok = await aiOpencodeService.isInstalled();
    if (!ok) {
      console.log(
        "[ai-terminal] opencode not found. Please install it via 'npm install -g opencode-ai'",
      );
    } else {
      console.log("[ai-terminal] opencode ready (direct run, no serve needed)");
    }
    // Auto probe: wait for it to complete so hasSentContext is set before user queries
    try {
      console.log("[ai-terminal] auto probe: Are you ready?");
      const probe = await aiOpencodeService.query(
        "Are you ready? if you are ready say it 'yes'",
      );
      console.log(`[ai-terminal] probe response: ${probe.slice(0, 120)}`);
      mainWindow?.webContents.send("ai-terminal:receive", probe);
    } catch (e) {
      console.log(`[ai-terminal] probe failed: ${String(e)}`);
    }
  })();
  // Load models after probe completes
  refreshModelMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {if (process.platform !== "darwin") app.quit();});
app.on("will-quit", async () => {await aiOpencodeService.stop();});
