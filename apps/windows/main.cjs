const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let serverLogHandle;

app.setAppUserModelId("com.opencut.ai");

function reservePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 3210;
			server.close(() => resolve(port));
		});
	});
}

function waitForServer(url, timeoutMs = 60_000) {
	const startedAt = Date.now();
	return new Promise((resolve, reject) => {
		const check = () => {
			const request = http.get(`${url}/api/health`, (response) => {
				response.resume();
				if (response.statusCode && response.statusCode < 500) {
					resolve();
					return;
				}
				retry();
			});
			request.once("error", retry);
			request.setTimeout(2_000, () => request.destroy());
		};
		const retry = () => {
			if (Date.now() - startedAt >= timeoutMs) {
				reject(new Error("Server lokal OpenCut tidak dapat dimulai."));
				return;
			}
			setTimeout(check, 350);
		};
		check();
	});
}

async function startLocalServer() {
	if (!app.isPackaged) {
		return process.env.OPENCUT_SERVER_URL || "http://127.0.0.1:3000";
	}

	const port = await reservePort();
	const serverRoot = path.join(process.resourcesPath, "server");
	const serverEntry = path.join(serverRoot, "apps", "web", "server.js");
	const aiRoot = path.join(process.resourcesPath, "ai");
	const logPath = path.join(app.getPath("logs"), "server.log");
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	serverLogHandle = fs.openSync(logPath, "a");
	fs.writeSync(
		serverLogHandle,
		`\n[${new Date().toISOString()}] Memulai server OpenCut AI\n`,
	);
	serverProcess = spawn(process.execPath, [serverEntry], {
		cwd: path.dirname(serverEntry),
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			HOSTNAME: "127.0.0.1",
			NODE_ENV: "production",
			PORT: String(port),
			BETTER_AUTH_SECRET: crypto.randomBytes(32).toString("hex"),
			DATABASE_URL: "postgresql://opencut:opencut@127.0.0.1:5432/opencut",
			NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
			NEXT_PUBLIC_MARBLE_API_URL: "https://placeholder.invalid",
			UPSTASH_REDIS_REST_URL: "https://placeholder.invalid",
			UPSTASH_REDIS_REST_TOKEN: "desktop-local-only",
			MARBLE_WORKSPACE_KEY: "desktop-local-only",
			FREESOUND_CLIENT_ID: "desktop-local-only",
			FREESOUND_API_KEY: "desktop-local-only",
			OPENCUT_AI_BIN_DIR: path.join(aiRoot, "bin"),
			OPENCUT_AI_MODEL: path.join(aiRoot, "models", "ggml-base.bin"),
		},
		stdio: ["ignore", serverLogHandle, serverLogHandle],
		windowsHide: true,
	});
	serverProcess.once("exit", (code) => {
		if (serverLogHandle !== undefined) {
			fs.closeSync(serverLogHandle);
			serverLogHandle = undefined;
		}
		if (code && !app.isQuitting) {
			dialog.showErrorBox(
				"OpenCut AI berhenti",
				`Server lokal berhenti dengan kode ${code}.\n\nDetail error tersimpan di:\n${logPath}`,
			);
		}
	});

	const url = `http://127.0.0.1:${port}`;
	await waitForServer(url);
	return url;
}

async function createWindow() {
	const serverUrl = await startLocalServer();
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		show: false,
		backgroundColor: "#0f0f0f",
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	mainWindow.once("ready-to-show", () => mainWindow?.show());
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith(serverUrl)) return { action: "allow" };
		void shell.openExternal(url);
		return { action: "deny" };
	});
	await mainWindow.loadURL(`${serverUrl}/projects`);
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app
		.whenReady()
		.then(createWindow)
		.catch((error) => {
			dialog.showErrorBox(
				"OpenCut AI gagal dimulai",
				error instanceof Error ? error.message : String(error),
			);
			app.quit();
		});
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
	app.isQuitting = true;
	if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
