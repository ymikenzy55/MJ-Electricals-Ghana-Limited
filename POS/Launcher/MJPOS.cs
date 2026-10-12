// MJ Electricals POS launcher.
//
// A small Windows application that starts the POS the way a desktop program
// would: double-click, a splash appears, the local database + interface are
// started in the background, and the POS opens in its own app window.
// It then stays in the system tray so background sync to the cloud keeps
// running after the window is closed. Exit from the tray menu stops everything.
//
// Build with build-launcher.ps1 (uses the C# compiler that ships with Windows).
//
// Two layouts:
// * Development (this repo): backend\.venv Python, Node.js from PATH, data and
//   logs next to the exe.
// * Installed (MJ-POS-Setup.exe): a bundled runtime\ folder with Python and
//   node.exe, the frontend as a Next.js standalone build, and all data in
//   %LOCALAPPDATA%\MJPOS (MJPOS_DATA_DIR overrides it, for testing). The
//   first start registers the computer (app.till_setup) and needs internet.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    const string BackendUrl = "http://127.0.0.1:8000";
    // 127.0.0.1 rather than "localhost": the interface listens on IPv4 only and
    // "localhost" tries IPv6 first on Windows, which made start-up look slow.
    const string FrontendUrl = "http://127.0.0.1:3000";

    static string root;
    static string logs;
    static string dataDir;
    static bool installed;
    static NotifyIcon tray;
    static Form splash;
    static Label status;
    static readonly List<Process> children = new List<Process>();
    static volatile bool ready;
    static Icon appIcon;
    static Control ui;   // hidden control used to marshal calls onto the UI thread

    static void Log(string text)
    {
        try { File.AppendAllText(Path.Combine(logs, "launcher.log"), DateTime.Now + " " + text + Environment.NewLine); } catch { }
    }

    static void OnUi(Action a)
    {
        try { if (ui != null && ui.IsHandleCreated) ui.BeginInvoke(a); else a(); } catch (Exception ex) { Log("UI call failed: " + ex.Message); }
    }

    [STAThread]
    static void Main(string[] args)
    {
        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        installed = File.Exists(Path.Combine(root, "runtime", "python", "python.exe"));
        dataDir = root;
        if (installed)
        {
            dataDir = Environment.GetEnvironmentVariable("MJPOS_DATA_DIR");
            if (string.IsNullOrEmpty(dataDir))
                dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MJPOS");
        }
        logs = Path.Combine(dataDir, "logs");
        Directory.CreateDirectory(logs);
        AppDomain.CurrentDomain.UnhandledException += (s, e) => Log("Unhandled: " + e.ExceptionObject);

        bool created;
        var mutex = new Mutex(true, "MJPOS_Launcher_SingleInstance", out created);
        var openSignal = new EventWaitHandle(false, EventResetMode.AutoReset, "MJPOS_Launcher_Open");
        if (!created)
        {
            // Already running — just bring the POS window forward.
            openSignal.Set();
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string icoPath = Path.Combine(root, "MJPOS.ico");
        appIcon = File.Exists(icoPath) ? new Icon(icoPath) : SystemIcons.Application;

        ui = new Control();
        ui.CreateControl();
        var handle = ui.Handle; // force creation on this (UI) thread
        BuildTray();
        ShowSplash();

        var worker = new Thread(() => StartEverything(args)) { IsBackground = true };
        worker.Start();

        // Second launches ask us to reopen the window.
        var watcher = new Thread(() =>
        {
            while (true) { openSignal.WaitOne(); if (ready) OpenWindow(); }
        }) { IsBackground = true };
        watcher.Start();

        Log("Launcher started");
        Application.Run();
        Log("Launcher message loop ended");
        GC.KeepAlive(mutex);
    }

    // ------------------------------------------------------------ UI ------

    static void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open MJ POS", null, (s, e) => OpenWindow());
        menu.Items.Add("Sync now", null, (s, e) => ThreadPool.QueueUserWorkItem(_ => SyncNow()));
        menu.Items.Add("Open logs folder", null, (s, e) => Process.Start("explorer.exe", logs));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit (stop POS)", null, (s, e) => ExitAll());
        tray = new NotifyIcon
        {
            Icon = appIcon, Text = "MJ Electricals POS", Visible = true, ContextMenuStrip = menu,
        };
        tray.DoubleClick += (s, e) => OpenWindow();
    }

    static void ShowSplash()
    {
        splash = new Form
        {
            FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.CenterScreen,
            Width = 440, Height = 250, BackColor = Color.FromArgb(6, 17, 97), ShowInTaskbar = false, TopMost = true,
        };
        string logo = Path.Combine(root, "frontend", "public", "MJ_Logo.png");
        if (File.Exists(logo))
        {
            var pic = new PictureBox
            {
                Image = Image.FromFile(logo), SizeMode = PictureBoxSizeMode.Zoom,
                Width = 84, Height = 84, Left = (440 - 84) / 2, Top = 28,
            };
            splash.Controls.Add(pic);
        }
        splash.Controls.Add(new Label
        {
            Text = "MJ Electricals POS", ForeColor = Color.White, Font = new Font("Segoe UI", 16, FontStyle.Bold),
            AutoSize = false, TextAlign = ContentAlignment.MiddleCenter, Left = 0, Top = 124, Width = 440, Height = 34,
        });
        status = new Label
        {
            Text = "Starting…", ForeColor = Color.FromArgb(200, 205, 235), Font = new Font("Segoe UI", 10),
            AutoSize = false, TextAlign = ContentAlignment.MiddleCenter, Left = 0, Top = 162, Width = 440, Height = 24,
        };
        splash.Controls.Add(status);
        var bar = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 25, Left = 60, Top = 200, Width = 320, Height = 8 };
        splash.Controls.Add(bar);
        splash.Show();
        splash.Refresh();
    }

    static void SetStatus(string text)
    {
        if (splash == null || splash.IsDisposed) return;
        OnUi(() => { if (status != null && !status.IsDisposed) status.Text = text; });
    }

    static void CloseSplash()
    {
        if (splash == null || splash.IsDisposed) return;
        OnUi(() => { if (splash != null && !splash.IsDisposed) splash.Close(); });
    }

    static void Fail(string message)
    {
        Log("FAIL: " + message);
        CloseSplash();
        OnUi(() =>
        {
            MessageBox.Show(message + "\n\nDetails are in the logs folder:\n" + logs, "MJ Electricals POS",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            ExitAll();
        });
    }

    // ------------------------------------------------------- startup ------

    static void StartEverything(string[] args)
    {
        try
        {
            string backendDir = Path.Combine(root, "backend");
            string frontendDir = Path.Combine(root, "frontend");
            string python = installed
                ? Path.Combine(root, "runtime", "python", "python.exe")
                : Path.Combine(backendDir, ".venv", "Scripts", "python.exe");
            if (!File.Exists(python)) { Fail("The POS is not fully installed (backend environment not found)."); return; }

            // ---- backend (local database + cloud sync)
            if (!IsUp(BackendUrl + "/api/v1/health"))
            {
                string dbDir = installed ? Path.Combine(dataDir, "data") : Path.Combine(backendDir, "data");
                var env = new Dictionary<string, string>
                {
                    { "POS_MODE", "local" },
                    { "LOCAL_DATABASE_URL", "sqlite:///" + dbDir.Replace('\\', '/') + "/mjpos_local.db" },
                    { "PYTHONUTF8", "1" },
                };
                if (installed && !LoadTillSettings(python, backendDir, Path.Combine(dbDir, "mjpos_local.db"), env)) return;
                SetStatus("Starting the local database…");
                Spawn(python, "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log", backendDir, env, "backend.log");
                if (!WaitFor(BackendUrl + "/api/v1/health", 60)) { Fail("The POS database did not start."); return; }
            }

            // ---- frontend (optimised production build)
            if (installed && !IsUp(FrontendUrl))
            {
                // Standalone build: a plain Node server, nothing to compile.
                SetStatus("Starting the interface…");
                var env = new Dictionary<string, string> { { "PORT", "3000" }, { "HOSTNAME", "127.0.0.1" }, { "NODE_ENV", "production" } };
                Spawn(Path.Combine(root, "runtime", "node", "node.exe"), "server.js", frontendDir, env, "frontend.log");
                if (!WaitFor(FrontendUrl, 60)) { Fail("The POS interface did not start."); return; }
            }
            else if (!IsUp(FrontendUrl))
            {
                string node = FindOnPath("node.exe");
                if (node == null) { Fail("Node.js was not found. Install Node.js 20 or newer."); return; }
                string next = Path.Combine(frontendDir, "node_modules", "next", "dist", "bin", "next");
                if (!File.Exists(Path.Combine(frontendDir, ".next", "BUILD_ID")))
                {
                    SetStatus("First-time setup: preparing the interface (a few minutes)…");
                    var build = Spawn(node, Quote(next) + " build", frontendDir, null, "frontend-build.log");
                    build.WaitForExit();
                    if (build.ExitCode != 0) { Fail("The POS interface could not be prepared."); return; }
                }
                SetStatus("Starting the interface…");
                Spawn(node, Quote(next) + " start -p 3000 -H 127.0.0.1", frontendDir, null, "frontend.log");
                if (!WaitFor(FrontendUrl, 60)) { Fail("The POS interface did not start."); return; }
            }

            SetStatus("Ready");
            ready = true;
            CloseSplash();
            if (Array.IndexOf(args, "--minimized") < 0) OpenWindow();
            else OnUi(() => tray.ShowBalloonTip(3000, "MJ POS is running", "Sync is active. Double-click the tray icon to open.", ToolTipIcon.Info));
        }
        catch (Exception ex)
        {
            Log(ex.ToString());
            Fail("Something went wrong while starting the POS.");
        }
    }

    // Installed tills keep per-computer settings (secret key, offline id block)
    // in till.env, created on first start by app.till_setup. A missing local
    // database also re-registers: a new database must get a new id block.
    static bool LoadTillSettings(string python, string backendDir, string dbFile, Dictionary<string, string> env)
    {
        string tillEnv = Path.Combine(dataDir, "till.env");
        if (!File.Exists(tillEnv) || !File.Exists(dbFile))
        {
            SetStatus("Registering this computer (needs internet)…");
            var setup = Spawn(python, "-m app.till_setup " + Quote(tillEnv) + " " + Quote(dbFile), backendDir, env, "setup.log");
            setup.WaitForExit();
            lock (children) children.Remove(setup);
            if (setup.ExitCode == 2)
            {
                Fail("The first start of the POS on a new computer needs an internet connection.\nConnect to the internet and open MJ POS again.");
                return false;
            }
            if (setup.ExitCode != 0) { Fail("This computer could not be registered for the POS."); return false; }
        }
        foreach (var line in File.ReadAllLines(tillEnv))
        {
            int eq = line.IndexOf('=');
            if (eq > 0 && !line.TrimStart().StartsWith("#"))
                env[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
        }
        return true;
    }

    static Process Spawn(string exe, string arguments, string workDir, Dictionary<string, string> env, string logName)
    {
        // cmd handles the log redirection so output is captured without a console window.
        string logFile = Path.Combine(logs, logName);
        var psi = new ProcessStartInfo("cmd.exe", "/c \"" + Quote(exe) + " " + arguments + " >> " + Quote(logFile) + " 2>&1\"")
        {
            WorkingDirectory = workDir, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
        };
        if (env != null) foreach (var kv in env) psi.EnvironmentVariables[kv.Key] = kv.Value;
        var p = Process.Start(psi);
        lock (children) children.Add(p);
        return p;
    }

    static string Quote(string s) { return "\"" + s + "\""; }

    static string FindOnPath(string file)
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { string f = Path.Combine(dir.Trim(), file); if (File.Exists(f)) return f; } catch { }
        }
        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", file);
        return File.Exists(pf) ? pf : null;
    }

    static bool IsUp(string url)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 1500; req.Proxy = null;
            using (var resp = (HttpWebResponse)req.GetResponse()) return (int)resp.StatusCode < 500;
        }
        catch (WebException ex) { return ex.Response != null; }
        catch { return false; }
    }

    static bool WaitFor(string url, int seconds)
    {
        var end = DateTime.Now.AddSeconds(seconds);
        while (DateTime.Now < end) { if (IsUp(url)) return true; Thread.Sleep(500); }
        return false;
    }

    // ------------------------------------------------------- window -------

    static string FindBrowser()
    {
        string[] keys = { "msedge.exe", "chrome.exe" };
        foreach (var k in keys)
        {
            foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
            {
                try
                {
                    using (var key = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + k))
                    {
                        var v = key == null ? null : key.GetValue(null) as string;
                        if (!string.IsNullOrEmpty(v) && File.Exists(v)) return v;
                    }
                }
                catch { }
            }
        }
        return null;
    }

    static void OpenWindow()
    {
        try
        {
            string browser = FindBrowser();
            if (browser == null) { Process.Start(FrontendUrl + "/pos"); return; }
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MJPOS", "window");
            Directory.CreateDirectory(profile);
            // --app gives a clean window with no address bar or tabs; a private
            // profile keeps the POS session separate from everyday browsing.
            Process.Start(browser, "--app=" + FrontendUrl + "/pos --user-data-dir=\"" + profile + "\" --no-first-run --disable-features=Translate");
        }
        catch { Process.Start(FrontendUrl + "/pos"); }
    }

    static void SyncNow()
    {
        try
        {
            // A sync is triggered by the app itself (admin "Sync now"); the tray item
            // just reopens the window on the page that shows sync status.
            OpenWindow();
        }
        catch { }
    }

    static void ExitAll()
    {
        try { tray.Visible = false; } catch { }
        lock (children)
        {
            foreach (var p in children)
            {
                try { Process.Start(new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false }).WaitForExit(4000); } catch { }
            }
        }
        Environment.Exit(0);
    }
}
