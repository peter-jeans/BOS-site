using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Replaced with the exact resource-inventory hash by the qualification builder.
sealed class BOSSetup : Form {
    const string ManifestPin = "__BOS_DESKTOP_MANIFEST_PIN__";
    readonly string resources = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Resources");
    readonly Label status = new Label();
    readonly Button install = new Button();
    bool busy;

    BOSSetup() {
        Text = "Install BOS — Build Operating System";
        ClientSize = new Size(600, 570); FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10); BackColor = Color.WhiteSmoke;
        var stack = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
            WrapContents = false, Padding = new Padding(30), AutoScroll = true };
        Controls.Add(stack);
        AddLabel(stack, "BOS", 30, true, 50);
        AddLabel(stack, "Build Operating System", 13, false, 30);
        AddLabel(stack, "QUALIFICATION BUILD · SEPARATE TEST PROFILE", 9, true, 28);
        AddLabel(stack, "1   Install BOS\r\n2   Approve its automatic checks\r\n3   Sign in\r\n4   Set up your project in Codex", 14, true, 120);
        AddLabel(stack, "This build tests installation without changing your working Codex or any project. Account sign-in and project setup remain separate acceptance checks.", 10, false, 65);
        status.Text = "Checking the BOS download…"; status.Size = new Size(530, 85);
        status.AccessibleName = "BOS setup status"; stack.Controls.Add(status);
        install.Text = "Test installation"; install.Size = new Size(180, 36); install.Enabled = false;
        install.Click += async (sender, e) => { if (!busy) await Run("install"); };
        stack.Controls.Add(install);
        Shown += async (sender, e) => await Run("preflight");
    }
    static void AddLabel(Control parent, string text, float size, bool bold, int height) {
        parent.Controls.Add(new Label { Text = text, Size = new Size(530, height),
            Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular) });
    }
    static string Hash(string filename) {
        using (var stream = File.OpenRead(filename)) using (var hash = SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static void Walk(string root, string relative, HashSet<string> actual) {
        foreach (string filename in Directory.GetFileSystemEntries(Path.Combine(root, relative))) {
            var attributes = File.GetAttributes(filename);
            if ((attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException();
            string name = filename.Substring(root.Length + 1).Replace('\\', '/');
            if ((attributes & FileAttributes.Directory) != 0) Walk(root, name, actual);
            else actual.Add(name);
        }
    }
    void VerifyResources() {
        string manifest = Path.Combine(resources, "DESKTOP_MANIFEST.json");
        if (new FileInfo(manifest).Length > 131072 || Hash(manifest) != ManifestPin) throw new InvalidDataException();
        var json = new JavaScriptSerializer();
        var body = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(manifest));
        if ((string)body["delivery"] != "QUALIFICATION_ONLY" || (string)body["profile"] != "win32-x64") throw new InvalidDataException();
        var expected = new HashSet<string>(StringComparer.Ordinal) { "DESKTOP_MANIFEST.json" };
        foreach (Dictionary<string, object> item in (IEnumerable)body["files"]) {
            string name = (string)item["path"];
            if (name.StartsWith("/") || name.IndexOfAny(new char[] {'\\', ':', '\0'}) >= 0 || !expected.Add(name)) throw new InvalidDataException();
            foreach (string segment in name.Split('/')) if (segment == ".." || segment == "." || segment.Length == 0) throw new InvalidDataException();
            string filename = Path.Combine(resources, name.Replace('/', Path.DirectorySeparatorChar));
            if ((File.GetAttributes(filename) & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != 0
                || new FileInfo(filename).Length != Convert.ToInt64(item["size"]) || Hash(filename) != (string)item["sha256"]) throw new InvalidDataException();
        }
        var actual = new HashSet<string>(StringComparer.Ordinal); Walk(resources, "", actual);
        if (!actual.SetEquals(expected)) throw new InvalidDataException();
    }
    async Task Run(string action) {
        busy = true; install.Enabled = false;
        if (action == "install") status.Text = "Installing BOS in a separate test profile…";
        bool ready = false;
        string message = "The BOS download needs review. Setup has stopped safely.";
        await Task.Run(() => {
            try {
                VerifyResources();
                var start = new ProcessStartInfo(Path.Combine(resources, "vendor/node/node.exe")) {
                    Arguments = "\"" + Path.Combine(resources, "engine/desktop-entry.mjs") + "\" --resources \"" + resources + "\" --action " + action,
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
                };
                start.EnvironmentVariables.Clear();
                foreach (string key in new string[] {"SystemRoot", "WINDIR", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"}) {
                    string value = Environment.GetEnvironmentVariable(key); if (value != null) start.EnvironmentVariables[key] = value;
                }
                start.EnvironmentVariables["PATH"] = Path.Combine(Environment.GetEnvironmentVariable("SystemRoot"), "System32");
                using (var process = Process.Start(start)) {
                    process.ErrorDataReceived += (sender, e) => {}; process.BeginErrorReadLine();
                    var output = Task.Run(() => {
                        var text = new StringBuilder(); var buffer = new char[4096]; int count;
                        while ((count = process.StandardOutput.Read(buffer, 0, buffer.Length)) != 0) {
                            text.Append(buffer, 0, count);
                            if (text.Length > 65536) { process.Kill(); throw new InvalidDataException(); }
                        }
                        return text.ToString();
                    });
                    if (!process.WaitForExit(120000)) { process.Kill(); throw new TimeoutException(); }
                    if (!output.Wait(2000)) throw new TimeoutException();
                    var result = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(output.Result);
                    message = (string)result["message"];
                    ready = process.ExitCode == 0 && (string)result["status"] == "READY_TO_TEST_INSTALL";
                }
            } catch { }
        });
        status.Text = message; install.Enabled = ready; busy = false;
    }
    [STAThread] static int Main(string[] args) {
        if (Array.IndexOf(args, "--verify-only") >= 0) {
            try {
                new BOSSetup().VerifyResources();
                Console.WriteLine("{\"status\":\"NATIVE_RESOURCE_INVENTORY_VERIFIED\",\"public_release\":false}"); return 0;
            } catch {
                Console.WriteLine("{\"status\":\"NATIVE_RESOURCE_INVENTORY_REJECTED\",\"public_release\":false}"); return 1;
            }
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new BOSSetup()); return 0;
    }
}
