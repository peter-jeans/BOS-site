import Cocoa
import CryptoKit

// BOSManifestPin is generated from the exact resource inventory at build time.
final class BOSSetup: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var status: NSTextField!
    private var install: NSButton!
    private var progress: NSProgressIndicator!
    private var busy = false
    private let resources = Bundle.main.resourceURL!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 600),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Install BOS — Build Operating System"
        window.isReleasedWhenClosed = false
        let stack = NSStackView()
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 15
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -32),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 28)
        ])
        func text(_ value: String, _ size: CGFloat, _ bold: Bool = false) -> NSTextField {
            let label = NSTextField(wrappingLabelWithString: value)
            label.font = bold ? .boldSystemFont(ofSize: size) : .systemFont(ofSize: size)
            label.translatesAutoresizingMaskIntoConstraints = false
            label.widthAnchor.constraint(equalToConstant: 536).isActive = true
            stack.addArrangedSubview(label); return label
        }
        _ = text("BOS", 34, true)
        _ = text("Build Operating System", 16)
        let badge = text("QUALIFICATION BUILD · SEPARATE TEST PROFILE", 11, true)
        badge.textColor = .secondaryLabelColor
        _ = text("1   Install BOS\n2   Approve its automatic checks\n3   Sign in\n4   Set up your project in Codex", 17, true)
        _ = text("This build tests installation without changing your working Codex or any project. Account sign-in and project setup remain separate acceptance checks.", 13)
        status = text("Checking the BOS download…", 13)
        status.setAccessibilityIdentifier("bos-setup-status")
        progress = NSProgressIndicator(); progress.style = .spinning; progress.controlSize = .small
        stack.addArrangedSubview(progress)
        install = NSButton(title: "Test installation", target: self, action: #selector(startInstall))
        install.bezelStyle = .rounded; install.isEnabled = false
        install.setAccessibilityIdentifier("bos-test-install")
        stack.addArrangedSubview(install)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        run("preflight")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    @objc private func startInstall() { if !busy { run("install") } }

    private func digest(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var hash = SHA256()
        while let bytes = try handle.read(upToCount: 1048576), !bytes.isEmpty { hash.update(data: bytes) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    func verifyResources() throws {
        let fm = FileManager.default
        let manifest = resources.appendingPathComponent("DESKTOP_MANIFEST.json")
        guard try digest(manifest) == BOSManifestPin,
              let body = try JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any],
              body["delivery"] as? String == "QUALIFICATION_ONLY",
              body["profile"] as? String == "darwin-arm64",
              let files = body["files"] as? [[String: Any]] else { throw NSError(domain: "BOSInventory", code: 1) }
        var expected = Set(["DESKTOP_MANIFEST.json"])
        for item in files {
            guard let name = item["path"] as? String, !name.hasPrefix("/"),
                  !name.split(separator: "/").contains(".."), !name.contains("\\"),
                  let size = item["size"] as? Int, let sha = item["sha256"] as? String,
                  expected.insert(name).inserted else { throw NSError(domain: "BOSInventory", code: 2) }
            let file = resources.appendingPathComponent(name)
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true,
                  values.fileSize == size, try digest(file) == sha else { throw NSError(domain: "BOSInventory", code: 3) }
        }
        guard let walker = fm.enumerator(at: resources, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey])
            else { throw NSError(domain: "BOSInventory", code: 4) }
        var actual = Set<String>()
        for case let file as URL in walker {
            let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
            guard values.isSymbolicLink != true else { throw NSError(domain: "BOSInventory", code: 5) }
            if values.isRegularFile == true { actual.insert(String(file.path.dropFirst(resources.path.count + 1))) }
        }
        guard actual == expected else { throw NSError(domain: "BOSInventory", code: 6) }
    }

    private func run(_ action: String) {
        busy = true; install.isEnabled = false; progress.startAnimation(nil)
        if action == "install" { status.stringValue = "Installing BOS in a separate test profile…" }
        DispatchQueue.global(qos: .userInitiated).async {
            var message = "The BOS download needs review. Setup has stopped safely."
            var ready = false
            do {
                try self.verifyResources()
                let process = Process(), pipe = Pipe()
                process.executableURL = self.resources.appendingPathComponent("vendor/node/bin/node")
                process.arguments = [self.resources.appendingPathComponent("engine/desktop-entry.mjs").path,
                                     "--resources", self.resources.path, "--action", action]
                var env: [String: String] = [:]
                for key in ["HOME", "USER", "LOGNAME", "TMPDIR"] { env[key] = ProcessInfo.processInfo.environment[key] }
                env["PATH"] = "/usr/bin:/bin"; process.environment = env
                process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
                try process.run()
                // One bounded JSON status; the bridge never returns account data.
                var output = Data()
                while let chunk = try pipe.fileHandleForReading.read(upToCount: 4096), !chunk.isEmpty {
                    output.append(chunk)
                    if output.count > 65536 { process.terminate(); throw NSError(domain: "BOSOutput", code: 1) }
                }
                process.waitUntilExit()
                if let result = try JSONSerialization.jsonObject(with: output) as? [String: Any],
                   let value = result["message"] as? String {
                    message = value
                    ready = process.terminationStatus == 0 && result["status"] as? String == "READY_TO_TEST_INSTALL"
                }
            } catch { }
            DispatchQueue.main.async {
                self.status.stringValue = message; self.install.isEnabled = ready
                self.progress.stopAnimation(nil); self.busy = false
            }
        }
    }
}

let delegate = BOSSetup()
if CommandLine.arguments.contains("--verify-only") {
    do {
        try delegate.verifyResources()
        print("{\"status\":\"NATIVE_RESOURCE_INVENTORY_VERIFIED\",\"public_release\":false}")
        exit(0)
    } catch {
        print("{\"status\":\"NATIVE_RESOURCE_INVENTORY_REJECTED\",\"public_release\":false}")
        exit(1)
    }
}
let app = NSApplication.shared
app.delegate = delegate
app.run()
